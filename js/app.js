// app.js — orquesta datos, mazo, partida, cronómetro y pantallas.
import { Deck } from './deck.js';
import { Game, getModality, MODALITIES, pickPartyRestriction, createTeam } from './game.js';
import { Timer, formatTime } from './timer.js';
import * as storage from './storage.js';
import * as ui from './ui.js';

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

const DEFAULT_SETTINGS = {
  turnSeconds: 60,
  sound: true,
  vibration: true,
  theme: 'auto',
  includeDuplicates: false,
};

const state = {
  cards: [],
  decks: {},
  settings: { ...DEFAULT_SETTINGS },
  screen: 'home',
  draft: null,
  config: null,
  game: null,
  deck: null,
  currentCard: null,
  revealed: false,
  skipsUsed: 0,
  timer: null,
  audioCtx: null,
};

// --------------------------------------------------------------------------
// Arranque
// --------------------------------------------------------------------------
async function init() {
  state.settings = { ...DEFAULT_SETTINGS, ...(storage.load(storage.KEYS.settings, {}) || {}) };
  applyTheme();
  wireGlobalEvents();
  registerServiceWorker();

  try {
    const response = await fetch('data/cards.json');
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    state.cards = data.cards;
    state.decks = data.decks;
    $('#loading').hidden = true;
    renderHome();
    showScreen('home');
  } catch (error) {
    $('#loading').hidden = true;
    const box = $('#load-error');
    box.hidden = false;
    box.innerHTML =
      `<strong>No se pudieron cargar las tarjetas.</strong> ` +
      `Abre la app desde un servidor local (por ejemplo <code>python3 -m http.server 8080</code>) ` +
      `y recarga la página. Detalle: ${ui.escapeHtml(error.message)}.`;
    showScreen(null);
  }
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  if (location.protocol === 'file:') return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}

// --------------------------------------------------------------------------
// Tema y ajustes
// --------------------------------------------------------------------------
function applyTheme() {
  const root = document.documentElement;
  const theme = state.settings.theme;
  if (theme === 'auto') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', theme);
}

function saveSettings() {
  storage.save(storage.KEYS.settings, state.settings);
}

// --------------------------------------------------------------------------
// Pantallas
// --------------------------------------------------------------------------
function showScreen(name) {
  state.screen = name;
  for (const screen of $$('.screen')) {
    screen.hidden = screen.dataset.screen !== name;
  }
  if (name === 'home') renderHome();
  window.scrollTo({ top: 0, behavior: 'auto' });
}

function renderHome() {
  const hasSave = !!loadSavedGame();
  $('[data-action="continue-game"]').hidden = !hasSave;
  const duplicates = state.cards.filter((card) => card.duplicateOf).length;
  $('#deck-summary').textContent = `${state.cards.length} tarjetas en 5 mazos · ${duplicates} repetidas se excluyen por defecto.`;
  renderUsedCount();
}

function renderUsedCount() {
  const el = $('#used-count');
  if (el) el.textContent = `Tarjetas usadas registradas: ${storage.loadUsedCards().length}.`;
}

// --------------------------------------------------------------------------
// Configuración de partida
// --------------------------------------------------------------------------
function defaultDraft() {
  return {
    modality: 'nino-nino',
    teams: [createTeam('Equipo A'), createTeam('Equipo B')],
    rounds: 10,
    turnSeconds: state.settings.turnSeconds,
    decks: ['infantil', 'mixto'],
    difficulties: [1, 2, 3],
    deckMaxDifficulty: {},
    weights: null,
    includeDuplicates: state.settings.includeDuplicates,
    excludeCategories: [],
    partyMode: false,
    skipLimit: 1,
  };
}

function openConfig() {
  state.draft = defaultDraft();
  ui.fillModalitySelect($('#modality'), MODALITIES, state.draft.modality);
  $('#turn-seconds').value = String(state.draft.turnSeconds);
  $('#rounds').value = String(state.draft.rounds);
  $('#include-duplicates').checked = state.draft.includeDuplicates;
  $('#chile-family').checked = false;
  $('#party-mode').checked = false;
  for (const level of [1, 2, 3]) $(`#diff-${level}`).checked = true;

  renderTeams();
  applyModalityPreset(state.draft.modality, { keepTeamConfig: true });
  showScreen('config');
}

function renderTeams() {
  ui.renderTeamsEditor($('#teams-editor'), state.draft.teams, {
    onAddMember: (teamIndex) => {
      syncTeamsFromDom();
      state.draft.teams[teamIndex].members.push({ name: '', child: false });
      renderTeams();
    },
    onRemoveMember: (teamIndex, memberIndex) => {
      syncTeamsFromDom();
      const members = state.draft.teams[teamIndex].members;
      if (members.length <= 1) {
        ui.showToast('Cada equipo necesita al menos un jugador.');
        return;
      }
      members.splice(memberIndex, 1);
      renderTeams();
    },
  });
}

function syncTeamsFromDom() {
  const container = $('#teams-editor');
  $$('.team-block', container).forEach((block, index) => {
    const team = state.draft.teams[index];
    if (!team) return;
    const nameInput = $('.team-name', block);
    if (nameInput) team.name = nameInput.value.trim() || `Equipo ${index + 1}`;
    const family = $('.team-family input', block);
    if (family) team.family = family.checked;
    team.members = $$('.member-row', block).map((row, memberIndex) => ({
      name: $('.member-name', row).value.trim() || `Jugador ${memberIndex + 1}`,
      child: $('.member-child', row).checked,
    }));
  });
}

function applyModalityPreset(modalityId, options = {}) {
  const modality = getModality(modalityId);
  state.draft.modality = modality.id;
  state.draft.decks = modality.decks.slice();
  state.draft.weights = modality.weights || null;
  state.draft.deckMaxDifficulty = { ...(modality.deckMaxDifficulty || {}) };
  state.draft.partyMode = !!modality.partyMode;
  if (!options.keepTeamConfig) state.draft.difficulties = [1, 2, 3];

  for (const level of [1, 2, 3]) $(`#diff-${level}`).checked = state.draft.difficulties.includes(level);
  if (modality.partyMode) $('#party-mode').checked = true;
  $('#modality-hint').textContent = modalityHint(modality);
  renderDecks();
}

function modalityHint(modality) {
  if (modality.id === 'chile-mixto') return 'Mezcla 50% Chile / 25% Mixto / 25% Infantil+Adulto.';
  if (modality.id === 'chile') return 'Solo tarjetas chilenas. Activa «Modo Chile familiar» para evitar expresiones difíciles.';
  if (modality.id === 'fiesta') return 'Mazos adulto, chile y desafío, con restricción aleatoria «Dibujo imposible».';
  if (modality.id === 'personalizado') return 'Elige a mano los mazos y la dificultad.';
  return `Mazos sugeridos: ${modality.decks.map((id) => state.decks[id]?.label || id).join(', ')}.`;
}

function readDraftFromForm() {
  syncTeamsFromDom();
  state.draft.decks = $$('#decks-editor input[type="checkbox"]:checked').map((input) => input.value);
  state.draft.difficulties = [1, 2, 3].filter((level) => $(`#diff-${level}`).checked);
  state.draft.turnSeconds = Number($('#turn-seconds').value);
  state.draft.rounds = Number($('#rounds').value);
  state.draft.includeDuplicates = $('#include-duplicates').checked;
  state.draft.excludeCategories = $('#chile-family').checked ? ['Expresiones y conceptos chilenos'] : [];
  state.draft.partyMode = $('#party-mode').checked;
  return state.draft;
}

function currentCountFilters() {
  return {
    difficulties: state.draft.difficulties,
    includeDuplicates: state.draft.includeDuplicates,
    excludeCategories: $('#chile-family').checked ? ['Expresiones y conceptos chilenos'] : [],
    deckMaxDifficulty: state.draft.deckMaxDifficulty,
  };
}

function renderDecks() {
  const selected = state.draft.decks;
  const filters = currentCountFilters();
  const counts = {};
  for (const deckId of Object.keys(state.decks)) {
    counts[deckId] = state.cards.filter((card) => {
      if (card.deck !== deckId) return false;
      if (!filters.difficulties.includes(card.difficulty)) return false;
      if (card.duplicateOf && !filters.includeDuplicates) return false;
      if (card.category && filters.excludeCategories.includes(card.category)) return false;
      const cap = filters.deckMaxDifficulty[card.deck];
      if (cap != null && card.difficulty > cap) return false;
      return true;
    }).length;
  }
  ui.renderDecksEditor($('#decks-editor'), state.decks, selected, counts);
  $('#deck-count-hint').textContent = `Total seleccionado: ${selected.reduce(
    (sum, deckId) => sum + (counts[deckId] || 0),
    0,
  )} tarjetas.`;
}

function startGameFromConfig() {
  const draft = readDraftFromForm();

  if (!draft.decks.length) {
    ui.showToast('Selecciona al menos un mazo.');
    return;
  }
  if (!draft.difficulties.length) {
    ui.showToast('Selecciona al menos una dificultad.');
    return;
  }
  if (draft.teams.length < 2 || draft.teams.length > 4) {
    ui.showToast('La partida necesita entre 2 y 4 equipos.');
    return;
  }

  state.config = draft;
  state.game = new Game(draft);
  buildDeck();
  saveGame();
  showScreen('play');
  startTurn();
}

function buildDeck() {
  const config = state.config;
  state.deck = new Deck(state.cards, {
    filters: {
      deckIds: config.decks,
      difficulties: config.difficulties,
      includeDuplicates: config.includeDuplicates,
      excludeCategories: config.excludeCategories,
      deckMaxDifficulty: config.deckMaxDifficulty,
    },
    weights: config.weights,
    usedIds: storage.loadUsedCards(),
  });
  persistUsed();
}

function persistUsed() {
  if (state.deck) storage.saveUsedCards(state.deck.usedIds());
}

// --------------------------------------------------------------------------
// Turno
// --------------------------------------------------------------------------
function startTurn() {
  state.currentCard = null;
  state.revealed = false;
  state.skipsUsed = 0;
  renderTurn();
  createTimer();
}

function createTimer() {
  if (state.timer) state.timer.stop();
  const seconds = state.game.turnSeconds();
  state.timer = new Timer({
    seconds,
    onTick: updateTimerUI,
    onEnd: onTimeEnd,
  });
  updateTimerUI(seconds);
}

function renderTurn() {
  const game = state.game;
  $('#play-team').textContent = game.team ? game.team.name : '';
  $('#play-drawer').textContent = game.drawer ? `Dibuja: ${game.drawer.name}${game.drawer.child ? ' (niño)' : ''}` : '';
  $('#play-round').textContent = `Ronda ${game.round} / ${game.rounds}`;

  ui.renderScoreboard($('#scoreboard-list'), game.scores, game.config.teams, game.teamIndex);

  // Tarjeta oculta hasta pulsar "Ver tarjeta".
  $('#card-back').hidden = false;
  $('#pcard').hidden = true;
  state.revealed = false;

  $('#timer-bonus').hidden = game.familyBonusSeconds === 0;
  if (game.familyBonusSeconds) $('#timer-bonus').textContent = `+${game.familyBonusSeconds} s`;

  updateSkipButton();
  updateSwapButton();
  $('#toggle-timer-btn').textContent = 'Iniciar';
  $('#progress-fill').style.width = '100%';
}

function revealCard() {
  state.revealed = true;
  if (!state.currentCard && !drawCard()) {
    state.revealed = false;
    return;
  }
  $('#card-back').hidden = true;
  $('#pcard').hidden = false;
  if (state.currentCard) ui.renderCard($('#pcard'), state.currentCard, state.decks[state.currentCard.deck]);
  updateSwapButton();
}

function drawCard() {
  let card = state.deck.draw();
  if (!card) {
    const reset = window.confirm(
      'El mazo filtrado se agotó. ¿Quieres reiniciar las tarjetas usadas para seguir jugando? ' +
        'Si cancelas, puedes ampliar los mazos o dificultades en una nueva partida.',
    );
    if (!reset) {
      ui.showToast('Mazo agotado. Amplía filtros o reinicia las tarjetas usadas en Ajustes.');
      return null;
    }
    state.deck.resetUsed();
    persistUsed();
    card = state.deck.draw();
    if (!card) return null;
  }
  persistUsed();

  if (state.config.partyMode) {
    const restriction = pickPartyRestriction(card);
    card.restrictionLabel = restriction ? restriction.label : null;
  } else {
    card.restrictionLabel = null;
  }

  state.currentCard = card;
  if (state.revealed) ui.renderCard($('#pcard'), card, state.decks[card.deck]);
  updateSwapButton();
  return card;
}

function hideCard() {
  if (state.timer && state.timer.isRunning) state.timer.pause();
  state.revealed = false;
  $('#card-back').hidden = false;
  $('#pcard').hidden = true;
  $('#toggle-timer-btn').textContent = 'Reanudar';
}

function updateSwapButton() {
  const game = state.game;
  const button = $('#swap-btn');
  const canSwap =
    game && game.canSwap() && game.drawer && game.drawer.child && !!state.currentCard;
  button.hidden = !canSwap;
}

function updateSkipButton() {
  const limit = state.game.config.skipLimit;
  const button = $('[data-action="skip"]');
  button.disabled = state.skipsUsed >= limit;
  button.textContent = `Saltar tarjeta (${Math.max(0, limit - state.skipsUsed)}/${limit})`;
}

let lastTimerText = '';
function updateTimerUI(remaining) {
  const formatted = formatTime(remaining);
  if (formatted !== lastTimerText) {
    lastTimerText = formatted;
    $('#timer-value').textContent = formatted;
  }
  const total = state.timer ? state.timer.totalSeconds : 1;
  const percent = Math.max(0, Math.min(100, (remaining / total) * 100));
  $('#progress-fill').style.width = `${percent}%`;
  $('#progress-fill').classList.toggle('is-low', percent <= 25);
}

function onTimeEnd() {
  ui.showToast('¡Se acabó el tiempo!');
  playBeep();
  vibrate();
  $('#toggle-timer-btn').textContent = 'Iniciar';
}

function toggleTimer() {
  if (!state.timer) return;
  if (state.timer.remaining <= 0) {
    ui.showToast('El tiempo del turno ya terminó. Marca el resultado.');
    return;
  }
  if (state.timer.isRunning) {
    state.timer.pause();
    $('#toggle-timer-btn').textContent = 'Reanudar';
  } else {
    state.timer.resume();
    $('#toggle-timer-btn').textContent = 'Pausar';
  }
}

function skipCard() {
  if (state.skipsUsed >= state.game.config.skipLimit || !state.currentCard) return;
  state.deck.returnCard(state.currentCard);
  persistUsed();
  state.skipsUsed += 1;
  state.currentCard = null;
  drawCard();
  if (state.revealed && state.currentCard) ui.renderCard($('#pcard'), state.currentCard, state.decks[state.currentCard.deck]);
  updateSkipButton();
}

function swapCard() {
  const game = state.game;
  if (!game.canSwap() || !game.drawer || !game.drawer.child || !state.currentCard) return;
  state.deck.returnCard(state.currentCard);
  persistUsed();
  game.markSwap();
  state.currentCard = null;
  drawCard();
  if (state.revealed && state.currentCard) ui.renderCard($('#pcard'), state.currentCard, state.decks[state.currentCard.deck]);
  updateSwapButton();
}

function endTurnWith(hit) {
  if (!state.currentCard) {
    ui.showToast('Primero muestra la tarjeta.');
    return;
  }
  if (state.timer) state.timer.stop();
  const results = state.game.endTurn({
    card: state.currentCard,
    hit,
    skipped: false,
    restriction: state.currentCard.restrictionLabel
      ? { id: state.currentCard.restrictionLabel }
      : null,
  });
  if (results) {
    storage.remove(storage.KEYS.savedGame);
    showResults(results);
  } else {
    saveGame();
    startTurn();
  }
}

// --------------------------------------------------------------------------
// Resultados
// --------------------------------------------------------------------------
function showResults(results) {
  ui.renderResults($('#results-title'), $('#results-sub'), $('#results-list'), results);
  showScreen('results');
}

// --------------------------------------------------------------------------
// Persistencia de partida
// --------------------------------------------------------------------------
function saveGame() {
  if (!state.game || state.game.finished) return;
  storage.save(storage.KEYS.savedGame, { config: state.config, game: state.game.toJSON() });
}

function loadSavedGame() {
  const save = storage.load(storage.KEYS.savedGame, null);
  if (!save || !save.game || !save.config) return null;
  const game = Game.fromJSON(save.game);
  if (game.finished) return null;
  return { save, game };
}

function continueGame() {
  const loaded = loadSavedGame();
  if (!loaded) {
    ui.showToast('No hay partida guardada.');
    return;
  }
  state.config = loaded.save.config;
  state.game = loaded.game;
  buildDeck();
  showScreen('play');
  startTurn();
}

function rematch() {
  if (!state.config) {
    openConfig();
    return;
  }
  state.game = new Game(state.config);
  buildDeck();
  saveGame();
  showScreen('play');
  startTurn();
}

// --------------------------------------------------------------------------
// Sonido / vibración
// --------------------------------------------------------------------------
function playBeep() {
  if (!state.settings.sound) return;
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    if (!state.audioCtx) state.audioCtx = new Ctx();
    const ctx = state.audioCtx;
    if (ctx.state === 'suspended') ctx.resume();
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.type = 'sine';
    oscillator.frequency.value = 880;
    gain.gain.setValueAtTime(0.001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
    oscillator.start();
    oscillator.stop(ctx.currentTime + 0.6);
  } catch {
    /* sonido opcional */
  }
}

function vibrate() {
  if (!state.settings.vibration) return;
  try {
    navigator.vibrate?.(200);
  } catch {
    /* vibración opcional */
  }
}

// --------------------------------------------------------------------------
// Ajustes
// --------------------------------------------------------------------------
function openSettings() {
  $('#setting-time').value = String(state.settings.turnSeconds);
  $('#setting-theme').value = state.settings.theme;
  $('#setting-sound').checked = state.settings.sound;
  $('#setting-vibration').checked = state.settings.vibration;
  $('#setting-duplicates').checked = state.settings.includeDuplicates;
  renderUsedCount();
  showScreen('settings');
}

function applySettingsFromForm() {
  state.settings.turnSeconds = Number($('#setting-time').value);
  state.settings.theme = $('#setting-theme').value;
  state.settings.sound = $('#setting-sound').checked;
  state.settings.vibration = $('#setting-vibration').checked;
  state.settings.includeDuplicates = $('#setting-duplicates').checked;
  saveSettings();
  applyTheme();
}

// --------------------------------------------------------------------------
// Eventos
// --------------------------------------------------------------------------
function wireGlobalEvents() {
  document.addEventListener('click', (event) => {
    const target = event.target.closest('[data-action]');
    if (!target) return;
    const action = target.dataset.action;
    const handler = ACTIONS[action];
    if (handler) {
      event.preventDefault();
      handler(target);
    }
  });

  $('#modality').addEventListener('change', (event) => applyModalityPreset(event.target.value));
  $('#decks-editor').addEventListener('change', renderDecks);
  $('#chile-family').addEventListener('change', renderDecks);
  for (const level of [1, 2, 3]) $(`#diff-${level}`).addEventListener('change', renderDecks);

  $('#config-form').addEventListener('submit', (event) => {
    event.preventDefault();
    startGameFromConfig();
  });

  $('#settings-form').addEventListener('change', applySettingsFromForm);

  document.addEventListener('keydown', (event) => {
    if (state.screen !== 'play') return;
    if (event.key === ' ' && event.target === document.body) {
      event.preventDefault();
      if (!state.revealed) revealCard();
      else toggleTimer();
    }
  });
}

const ACTIONS = {
  'go-home': () => {
    state.timer?.stop();
    showScreen('home');
  },
  'new-game': () => {
    state.timer?.stop();
    openConfig();
  },
  'continue-game': continueGame,
  'open-howto': () => showScreen('howto'),
  'open-settings': openSettings,
  'add-team': () => {
    syncTeamsFromDom();
    if (state.draft.teams.length >= 4) {
      ui.showToast('Máximo 4 equipos.');
      return;
    }
    state.draft.teams.push(createTeam(`Equipo ${String.fromCharCode(65 + state.draft.teams.length)}`));
    renderTeams();
  },
  'remove-team': () => {
    syncTeamsFromDom();
    if (state.draft.teams.length <= 2) {
      ui.showToast('La partida necesita al menos 2 equipos.');
      return;
    }
    state.draft.teams.pop();
    renderTeams();
  },
  reveal: revealCard,
  'hide-card': hideCard,
  'toggle-timer': toggleTimer,
  skip: skipCard,
  swap: swapCard,
  hit: () => endTurnWith(true),
  miss: () => endTurnWith(false),
  rematch,
  'reset-used': () => {
    storage.clearUsedCards();
    if (state.deck) state.deck.resetUsed();
    renderUsedCount();
    ui.showToast('Tarjetas usadas reiniciadas.');
  },
};

init();
