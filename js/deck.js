// deck.js — lógica del mazo, sin DOM, testeable en Node.
// Baraja Fisher-Yates, filtros, mezclas porcentuales y control de usadas.

export function fisherYates(items, rng = Math.random) {
  const result = items.slice();
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function normalizeText(text) {
  return String(text)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

// Un filtro declarativo sobre las tarjetas. Toda la app usa esto.
export function passesFilters(card, filters = {}) {
  const {
    deckIds,
    difficulties,
    includeDuplicates = false,
    excludeCategories = [],
    deckMaxDifficulty = {},
  } = filters;

  if (deckIds && !deckIds.includes(card.deck)) return false;
  if (difficulties && !difficulties.includes(card.difficulty)) return false;
  if (card.duplicateOf && !includeDuplicates) return false;
  if (card.category && excludeCategories.includes(card.category)) return false;

  const cap = deckMaxDifficulty[card.deck];
  if (cap != null && card.difficulty > cap) return false;

  return true;
}

export function selectCards(cards, filters = {}) {
  return cards.filter((card) => passesFilters(card, filters));
}

export function countByDeck(cards) {
  const counts = {};
  for (const card of cards) {
    counts[card.deck] = (counts[card.deck] || 0) + 1;
  }
  return counts;
}

// Mazo activo de una partida. Mantiene las tarjetas usadas (persistibles) y
// entrega tarjetas sin repetir hasta agotarse.
export class Deck {
  constructor(cards, options = {}) {
    const {
      filters = {},
      weights = null,
      usedIds = [],
      rng = Math.random,
    } = options;

    this.rng = rng;
    this.weights = weights || null;
    this.used = new Set(usedIds);
    this.filters = filters;

    const selected = selectCards(cards, filters);
    this.pools = [];
    const byDeck = new Map();
    for (const card of selected) {
      if (!byDeck.has(card.deck)) {
        byDeck.set(card.deck, {
          id: card.deck,
          weight: this.weights ? this.weights[card.deck] ?? 1 : 1,
          cards: [],
        });
      }
      byDeck.get(card.deck).cards.push(card);
    }
    for (const pool of byDeck.values()) {
      const shuffled = fisherYates(pool.cards, this.rng);
      const unused = shuffled.filter((card) => !this.used.has(card.id));
      const used = shuffled.filter((card) => this.used.has(card.id));
      pool.cards = unused.concat(used);
      this.pools.push(pool);
    }
  }

  availableCount() {
    return this.pools.reduce(
      (sum, pool) => sum + pool.cards.filter((card) => !this.used.has(card.id)).length,
      0,
    );
  }

  totalCount() {
    return this.pools.reduce((sum, pool) => sum + pool.cards.length, 0);
  }

  // Entrega la siguiente tarjeta no usada o null si el mazo se agotó.
  draw() {
    const active = this.pools.filter(
      (pool) => pool.cards.some((card) => !this.used.has(card.id)) && pool.weight > 0,
    );
    if (active.length === 0) return null;

    const total = active.reduce((sum, pool) => sum + pool.weight, 0);
    let roll = this.rng() * total;
    let picked = active[active.length - 1];
    for (const pool of active) {
      roll -= pool.weight;
      if (roll <= 0) {
        picked = pool;
        break;
      }
    }

    for (let i = picked.cards.length - 1; i >= 0; i -= 1) {
      const card = picked.cards[i];
      if (!this.used.has(card.id)) {
        this.used.add(card.id);
        return card;
      }
    }
    return null;
  }

  // Devuelve una tarjeta al mazo (cambio de tarjeta o salto) sin marcarla usada.
  returnCard(card) {
    if (!card) return false;
    this.used.delete(card.id);
    return true;
  }

  isUsed(id) {
    return this.used.has(id);
  }

  usedIds() {
    return Array.from(this.used);
  }

  resetUsed() {
    this.used.clear();
  }
}
