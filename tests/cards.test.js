// Validación de data/cards.json (sección 3.4 del prompt).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const data = JSON.parse(readFileSync(join(here, '..', 'data', 'cards.json'), 'utf8'));

const EXPECTED_PREFIX = { infantil: 'I', adulto: 'A', mixto: 'M', chile: 'C', desafio: 'D' };

function normalize(text) {
  return String(text)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

test('meta: nombre, versión y total', () => {
  assert.equal(data.meta.name, 'pictonarIA');
  assert.equal(data.meta.version, '1.0.0');
  assert.equal(data.meta.total, 600);
});

test('hay exactamente 600 tarjetas', () => {
  assert.equal(data.cards.length, 600);
});

test('conteos por mazo: 200/100/100/100/100', () => {
  const expected = { infantil: 200, adulto: 100, mixto: 100, chile: 100, desafio: 100 };
  const counts = {};
  for (const card of data.cards) counts[card.deck] = (counts[card.deck] || 0) + 1;
  assert.deepEqual(counts, expected);

  for (const [deckId, meta] of Object.entries(data.decks)) {
    assert.equal(meta.count, expected[deckId], `meta.count de ${deckId}`);
  }
});

test('cada mazo declarado tiene sus metadatos y la bandera SVG para Chile', () => {
  for (const deckId of Object.keys(EXPECTED_PREFIX)) {
    assert.ok(data.decks[deckId], `falta el mazo ${deckId}`);
    assert.ok(data.decks[deckId].label);
    assert.ok(data.decks[deckId].emoji);
    assert.ok(data.decks[deckId].color);
  }
  assert.equal(data.decks.chile.icon, 'flag-cl');
  assert.equal(data.decks.chile.emoji, '\u{1F1E8}\u{1F1F1}');
});

test('IDs únicos, formato ^[IAMCD]\\d{3}$ y prefijo -> mazo', () => {
  const seen = new Set();
  for (const card of data.cards) {
    assert.match(card.id, /^[IAMCD]\d{3}$/, `ID inválido: ${card.id}`);
    assert.ok(!seen.has(card.id), `ID repetido: ${card.id}`);
    seen.add(card.id);
    assert.equal(card.id[0], EXPECTED_PREFIX[card.deck], `prefijo/mazo en ${card.id}`);
  }
});

test('dificultad 1-3, puntos = dificultad y texto no vacío', () => {
  for (const card of data.cards) {
    assert.ok([1, 2, 3].includes(card.difficulty), `dificultad en ${card.id}`);
    assert.equal(card.points, card.difficulty, `points en ${card.id}`);
    assert.equal(typeof card.text, 'string');
    assert.ok(card.text.trim().length > 0, `texto vacío en ${card.id}`);
  }
});

test('category es null o string sin emoji (Chile e Infantil)', () => {
  for (const card of data.cards) {
    if (card.category !== null) {
      assert.equal(typeof card.category, 'string');
      assert.ok(!/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(card.category), `emoji en category: ${card.category}`);
    }
  }
  const infantilesConCategoria = data.cards.filter((c) => c.deck === 'infantil' && c.category);
  assert.equal(infantilesConCategoria.length, 200);
});

test('duplicateOf apunta a una aparición anterior con el mismo texto normalizado', () => {
  const position = new Map(data.cards.map((card, index) => [card.id, index]));
  const duplicates = data.cards.filter((card) => card.duplicateOf);
  assert.ok(duplicates.length >= 17, `se esperaban >= 17 duplicados, hay ${duplicates.length}`);

  for (const card of duplicates) {
    const firstIndex = position.get(card.duplicateOf);
    assert.ok(firstIndex !== undefined, `${card.id} apunta a un id inexistente`);
    assert.ok(firstIndex < position.get(card.id), `${card.id} no apunta a una aparición previa`);
    const first = data.cards[firstIndex];
    assert.equal(normalize(first.text), normalize(card.text), `texto no coincide: ${card.id}`);
  }
});
