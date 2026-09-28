// Tests de la lógica del mazo, cronómetro y partida (sin DOM).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fisherYates, selectCards, countByDeck, Deck } from '../js/deck.js';
import { Timer, formatTime } from '../js/timer.js';
import { Game, createTeam, pickPartyRestriction, PARTY_RESTRICTIONS } from '../js/game.js';

function mulberry32(seed) {
  let a = seed >>> 0;
  return function rng() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function card(id, deck, difficulty, extra = {}) {
  return { id, text: extra.text || id, deck, difficulty, points: difficulty, category: extra.category || null, ...extra };
}

function makeCards() {
  const cards = [];
  for (let i = 1; i <= 10; i += 1) cards.push(card(`C${String(i).padStart(3, '0')}`, 'chile', (i % 3) + 1, { category: 'Vida cotidiana' }));
  for (let i = 1; i <= 10; i += 1) cards.push(card(`M${String(i).padStart(3, '0')}`, 'mixto', (i % 3) + 1));
  for (let i = 1; i <= 10; i += 1) cards.push(card(`D${String(i).padStart(3, '0')}`, 'desafio', 3));
  return cards;
}

test('fisherYates es una permutación y no muta la entrada', () => {
  const input = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  const snapshot = input.slice();
  const out = fisherYates(input, mulberry32(42));
  assert.deepEqual(input, snapshot);
  assert.equal(out.length, input.length);
  assert.deepEqual(out.slice().sort((a, b) => a - b), input);
});

test('selectCards filtra por mazo, dificultad, categoría y duplicados', () => {
  const cards = [
    card('I001', 'infantil', 1),
    card('I002', 'infantil', 3, { duplicateOf: 'I001', text: 'I001' }),
    card('C001', 'chile', 1, { category: 'Expresiones y conceptos chilenos' }),
    card('C002', 'chile', 1, { category: 'Vida cotidiana' }),
  ];

  assert.equal(selectCards(cards, { deckIds: ['infantil'] }).length, 1);
  assert.equal(selectCards(cards, { includeDuplicates: true }).length, 4);
  assert.equal(
    selectCards(cards, { excludeCategories: ['Expresiones y conceptos chilenos'] }).length,
    2,
  );
  const chileFacil = selectCards(cards, { deckIds: ['chile'], deckMaxDifficulty: { chile: 1 } });
  assert.equal(chileFacil.length, 2);
  assert.equal(selectCards(cards, { difficulties: [3] }).length, 0);
  assert.equal(selectCards(cards, { difficulties: [3], includeDuplicates: true }).length, 1);
});

test('Deck entrega todas las tarjetas sin repetir y luego null', () => {
  const cards = makeCards();
  const deck = new Deck(cards, { filters: { includeDuplicates: true } });
  assert.equal(deck.availableCount(), 30);

  const drawn = new Set();
  for (let i = 0; i < 30; i += 1) {
    const next = deck.draw();
    assert.ok(next, `debería entregar la tarjeta ${i}`);
    assert.ok(!drawn.has(next.id), `tarjeta repetida ${next.id}`);
    drawn.add(next.id);
  }
  assert.equal(deck.availableCount(), 0);
  assert.equal(deck.draw(), null);
});

test('Deck respeta las tarjetas ya usadas y resetUsed las libera', () => {
  const cards = makeCards();
  const first = new Deck(cards, { filters: { includeDuplicates: true } });
  const used = [];
  for (let i = 0; i < 5; i += 1) used.push(first.draw().id);

  const second = new Deck(cards, { filters: { includeDuplicates: true }, usedIds: used });
  assert.equal(second.availableCount(), 25);
  for (let i = 0; i < 25; i += 1) {
    const next = second.draw();
    assert.ok(!used.includes(next.id), 'no debe repetir una tarjeta usada');
  }
  assert.equal(second.draw(), null);

  second.resetUsed();
  assert.equal(second.availableCount(), 30);
});

test('Deck.returnCard devuelve una tarjeta al mazo', () => {
  const deck = new Deck(makeCards(), { filters: { includeDuplicates: true }, rng: mulberry32(1) });
  const drawn = deck.draw();
  assert.ok(deck.isUsed(drawn.id));
  deck.returnCard(drawn);
  assert.ok(!deck.isUsed(drawn.id));
  assert.equal(deck.availableCount(), 30);
});

test('Deck con pesos mezcla por proporción antes de agotar mazos', () => {
  const cards = [
    ...Array.from({ length: 60 }, (_, i) => card(`C${String(i).padStart(3, '0')}`, 'chile', 1)),
    ...Array.from({ length: 20 }, (_, i) => card(`M${String(i).padStart(3, '0')}`, 'mixto', 1)),
  ];
  const deck = new Deck(cards, {
    filters: { includeDuplicates: true },
    weights: { chile: 3, mixto: 1 },
    rng: mulberry32(7),
  });
  const counts = { chile: 0, mixto: 0 };
  while (deck.availableCount() > 0) {
    const next = deck.draw();
    counts[next.deck] += 1;
  }
  assert.equal(counts.chile, 60);
  assert.equal(counts.mixto, 20);
});

test('formatTime formatea mm:ss', () => {
  assert.equal(formatTime(60), '1:00');
  assert.equal(formatTime(9), '0:09');
  assert.equal(formatTime(0), '0:00');
  assert.equal(formatTime(-3), '0:00');
});

test('Timer cuenta, pausa, reanuda, suma segundos y avisa el final', () => {
  let now = 0;
  let tickFn = null;
  const events = { ticks: [], ended: 0 };
  const timer = new Timer({
    seconds: 60,
    now: () => now,
    setIntervalFn: (fn) => {
      tickFn = fn;
      return 1;
    },
    clearIntervalFn: () => {},
    onTick: (remaining) => events.ticks.push(remaining),
    onEnd: () => {
      events.ended += 1;
    },
  });

  timer.start();
  assert.equal(timer.remaining, 60);
  assert.ok(timer.isRunning);

  now += 30000;
  tickFn();
  assert.equal(timer.remaining, 30);

  timer.pause();
  assert.ok(!timer.isRunning);
  now += 100000;
  assert.equal(timer.remaining, 30);

  timer.resume();
  now += 10000;
  tickFn();
  assert.equal(timer.remaining, 20);

  timer.addSeconds(10);
  assert.equal(timer.remaining, 30);

  now += 30000;
  tickFn();
  assert.equal(timer.remaining, 0);
  assert.equal(events.ended, 1);
  assert.ok(!timer.isRunning);
});

test('Game rota equipos, redondea y suma puntos por dificultad', () => {
  const game = new Game({
    teams: [createTeam('A'), createTeam('B')],
    rounds: 2,
    decks: ['chile'],
  });
  assert.equal(game.round, 1);
  assert.equal(game.team.name, 'A');

  game.endTurn({ card: card('C001', 'chile', 2), hit: true });
  assert.equal(game.scores[0], 2);
  assert.equal(game.team.name, 'B');

  game.endTurn({ card: card('C002', 'chile', 3), hit: false });
  assert.equal(game.scores[1], 0);
  assert.equal(game.round, 2);
  assert.equal(game.team.name, 'A');

  game.endTurn({ card: card('C003', 'chile', 3), hit: true });
  game.endTurn({ card: card('C004', 'chile', 1), hit: true });
  assert.ok(game.finished);

  const results = game.results();
  assert.equal(results.scores[0].score, 5);
  assert.equal(results.scores[1].score, 1);
  assert.equal(results.winners[0].name, 'A');
  assert.equal(results.tie, false);
  assert.equal(results.history.length, 4);
});

test('Game detecta empates', () => {
  const game = new Game({ teams: [createTeam('A'), createTeam('B')], rounds: 1 });
  game.endTurn({ hit: false });
  game.endTurn({ hit: false });
  const results = game.results();
  assert.equal(results.tie, true);
  assert.equal(results.winners.length, 2);
});

test('Pareja familiar: +10 s si dibuja el niño y cambio único por partida', () => {
  const game = new Game({
    teams: [
      createTeam('Familia', { family: true, members: [{ name: 'Mamá', child: false }, { name: 'Hijo', child: true }] }),
      createTeam('Rival'),
    ],
    rounds: 3,
    turnSeconds: 60,
  });

  assert.equal(game.drawer.name, 'Mamá');
  assert.equal(game.familyBonusSeconds, 0);
  assert.equal(game.turnSeconds(), 60);
  game.endTurn({ hit: false });

  game.endTurn({ hit: false });
  assert.equal(game.team.name, 'Familia');
  assert.equal(game.drawer.name, 'Hijo');
  assert.equal(game.familyBonusSeconds, 10);
  assert.equal(game.turnSeconds(), 70);

  assert.ok(game.canSwap());
  game.markSwap();
  assert.ok(!game.canSwap());
  game.endTurn({ hit: false });

  game.endTurn({ hit: false });
  assert.equal(game.team.name, 'Familia');
  assert.equal(game.drawer.name, 'Mamá');
});

test('pickPartyRestriction evita desafío y tarjetas que ya traen restricción', () => {
  assert.equal(pickPartyRestriction(card('D001', 'desafio', 3, { text: 'Dibujar con la mano contraria' })), null);
  assert.equal(pickPartyRestriction(card('I001', 'infantil', 1, { text: 'Dibujar sin levantar el lápiz' })), null);
  const restriction = pickPartyRestriction(card('I002', 'infantil', 1, { text: 'Perro' }), () => 0);
  assert.equal(restriction, PARTY_RESTRICTIONS[0]);
});

test('countByDeck agrupa tarjetas por mazo', () => {
  assert.deepEqual(countByDeck(makeCards()), { chile: 10, mixto: 10, desafio: 10 });
});
