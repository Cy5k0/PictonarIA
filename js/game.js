// game.js — reglas de partida (equipos, turnos, puntaje, pareja familiar,
// modo fiesta), sin DOM, testeable en Node.

export const PARTY_RESTRICTIONS = [
  { id: 'mano-contraria', label: 'Dibuja con la mano contraria' },
  { id: 'sin-levantar', label: 'Dibuja sin levantar el lápiz' },
  { id: 'ojos-cerrados', label: 'Dibuja con los ojos cerrados' },
  { id: 'dibujo-compartido', label: 'Comparte el dibujo con otro jugador' },
];

const RESTRICTION_IN_TEXT = /mano contraria|sin levantar|ojos cerrados|comparti|dos personas/i;

// Modo Fiesta "Dibujo imposible": sortea una restricción para la tarjeta.
// Las tarjetas del mazo desafío ya la traen en su texto y no reciben otra.
export function pickPartyRestriction(card, rng = Math.random) {
  if (!card) return null;
  if (card.deck === 'desafio') return null;
  if (RESTRICTION_IN_TEXT.test(card.text || '')) return null;
  const index = Math.floor(rng() * PARTY_RESTRICTIONS.length);
  return PARTY_RESTRICTIONS[Math.min(index, PARTY_RESTRICTIONS.length - 1)];
}

// Modalidades de la sección 4.2 del prompt. Los mazos se preseleccionan, pero
// el usuario puede editarlos. `weights` habilita las mezclas porcentuales.
export const MODALITIES = [
  {
    id: 'nino-nino',
    label: 'Niño vs Niño',
    decks: ['infantil', 'mixto'],
  },
  {
    id: 'adulto-adulto',
    label: 'Adulto vs Adulto',
    decks: ['adulto', 'desafio', 'mixto'],
  },
  {
    id: 'parejas',
    label: 'Adulto + Niño vs Adulto + Niño',
    decks: ['mixto', 'infantil', 'chile'],
    deckMaxDifficulty: { chile: 1 },
  },
  {
    id: 'mixta',
    label: '2 Adultos vs Adulto + Niño',
    decks: ['mixto', 'chile', 'infantil', 'adulto'],
    deckMaxDifficulty: { adulto: 1 },
  },
  {
    id: 'chile',
    label: 'Modo Chile (solo Chile)',
    decks: ['chile'],
  },
  {
    id: 'chile-mixto',
    label: 'Modo Chile (mezcla 50/25/25)',
    decks: ['chile', 'mixto', 'infantil', 'adulto'],
    weights: { chile: 2, mixto: 1, infantil: 0.5, adulto: 0.5 },
  },
  {
    id: 'fiesta',
    label: 'Modo Fiesta',
    decks: ['adulto', 'chile', 'desafio'],
    partyMode: true,
  },
  {
    id: 'personalizado',
    label: 'Personalizado',
    decks: [],
  },
];

export function getModality(id) {
  return MODALITIES.find((modality) => modality.id === id) || MODALITIES[MODALITIES.length - 1];
}

export function createTeam(name = 'Equipo', options = {}) {
  return {
    name,
    family: !!options.family,
    members: options.members || [{ name: 'Jugador 1', child: false }],
  };
}

export const DEFAULT_CONFIG = {
  modality: 'nino-nino',
  teams: [createTeam('Equipo A'), createTeam('Equipo B')],
  rounds: 10,
  turnSeconds: 60,
  decks: ['infantil', 'mixto'],
  difficulties: [1, 2, 3],
  deckMaxDifficulty: {},
  weights: null,
  includeDuplicates: false,
  excludeCategories: [],
  partyMode: false,
  skipLimit: 1,
  skipPenalty: false,
};

export function normalizeConfig(config = {}) {
  const merged = { ...DEFAULT_CONFIG, ...config };
  merged.teams = (merged.teams || []).map((team) => ({
    name: team.name || 'Equipo',
    family: !!team.family,
    members:
      team.members && team.members.length
        ? team.members.map((member, index) => ({
            name: member.name || `Jugador ${index + 1}`,
            child: !!member.child,
          }))
        : [{ name: 'Jugador 1', child: false }],
  }));
  merged.difficulties = merged.difficulties && merged.difficulties.length ? merged.difficulties : [1, 2, 3];
  merged.decks = merged.decks || [];
  merged.deckMaxDifficulty = merged.deckMaxDifficulty || {};
  merged.excludeCategories = merged.excludeCategories || [];
  merged.rounds = Math.max(1, Number(merged.rounds) || 10);
  merged.turnSeconds = Number(merged.turnSeconds) || 60;
  return merged;
}

export function pointsForCard(card) {
  return card && typeof card.points === 'number' ? card.points : 0;
}

export class Game {
  constructor(config = {}) {
    this.config = normalizeConfig(config);
    this.turnCount = 0;
    this.scores = this.config.teams.map(() => 0);
    this.history = [];
    this.swapUsed = new Set();
  }

  get rounds() {
    return this.config.rounds;
  }

  get totalTurns() {
    return this.config.rounds * this.config.teams.length;
  }

  get finished() {
    return this.turnCount >= this.totalTurns || this.config.teams.length === 0;
  }

  get round() {
    return Math.min(this.config.rounds, Math.floor(this.turnCount / this.config.teams.length) + 1);
  }

  get teamIndex() {
    return this.config.teams.length ? this.turnCount % this.config.teams.length : 0;
  }

  get team() {
    return this.config.teams[this.teamIndex] || null;
  }

  get drawer() {
    const team = this.team;
    if (!team) return null;
    const members = team.members.length ? team.members : [{ name: 'Jugador', child: false }];
    const withinRound = Math.floor(this.turnCount / this.config.teams.length);
    return members[withinRound % members.length];
  }

  // Regla "Pareja Familiar" (sección 4.3): +10 s si dibuja el niño.
  get familyBonusSeconds() {
    return this.team && this.team.family && this.drawer && this.drawer.child ? 10 : 0;
  }

  turnSeconds() {
    return this.config.turnSeconds + this.familyBonusSeconds;
  }

  canSwap(teamIdx = this.teamIndex) {
    const team = this.config.teams[teamIdx];
    return !!team && team.family && !this.swapUsed.has(teamIdx);
  }

  markSwap(teamIdx = this.teamIndex) {
    this.swapUsed.add(teamIdx);
  }

  // Cierra el turno actual: suma puntos, registra y avanza la rotación.
  endTurn(outcome = {}) {
    if (this.finished) return this.results();

    const { card = null, hit = false, skipped = false, swapped = false, restriction = null } = outcome;
    const points = hit ? pointsForCard(card) : 0;
    this.scores[this.teamIndex] += points;

    this.history.push({
      round: this.round,
      turn: this.turnCount + 1,
      teamIndex: this.teamIndex,
      team: this.team ? this.team.name : '',
      drawer: this.drawer ? this.drawer.name : '',
      cardId: card ? card.id : null,
      cardText: card ? card.text : null,
      deck: card ? card.deck : null,
      difficulty: card ? card.difficulty : null,
      hit: !!hit,
      skipped: !!skipped,
      swapped: !!swapped,
      restriction: restriction ? restriction.id : null,
      points,
    });

    this.turnCount += 1;
    return this.finished ? this.results() : null;
  }

  winners() {
    if (!this.scores.length) return [];
    const max = Math.max(...this.scores);
    return this.scores
      .map((score, index) => ({ team: this.config.teams[index], score, index }))
      .filter((entry) => entry.score === max);
  }

  results() {
    const winners = this.winners();
    return {
      scores: this.config.teams.map((team, index) => ({ name: team.name, score: this.scores[index] })),
      winners: winners.map((entry) => ({ name: entry.team.name, score: entry.score, index: entry.index })),
      tie: winners.length > 1,
      history: this.history.slice(),
      rounds: this.config.rounds,
    };
  }

  // Revancha: misma configuración, marcador en cero.
  restart() {
    return new Game(this.config);
  }

  toJSON() {
    return {
      config: this.config,
      turnCount: this.turnCount,
      scores: this.scores,
      history: this.history,
      swapUsed: Array.from(this.swapUsed),
    };
  }

  static fromJSON(data) {
    const game = new Game(data.config);
    game.turnCount = data.turnCount || 0;
    game.scores = Array.isArray(data.scores) ? data.scores.slice() : game.config.teams.map(() => 0);
    game.history = Array.isArray(data.history) ? data.history.slice() : [];
    game.swapUsed = new Set(data.swapUsed || []);
    return game;
  }
}
