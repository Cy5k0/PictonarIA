// storage.js — persistencia segura en localStorage (nunca lanza).
const PREFIX = 'pictonaria:';

export const KEYS = {
  settings: `${PREFIX}settings`,
  usedCards: `${PREFIX}usedCards`,
  savedGame: `${PREFIX}savedGame`,
};

function backend() {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

export function isAvailable() {
  const store = backend();
  if (!store) return false;
  try {
    const probe = `${PREFIX}__probe__`;
    store.setItem(probe, '1');
    store.removeItem(probe);
    return true;
  } catch {
    return false;
  }
}

export function load(key, fallback = null) {
  const store = backend();
  if (!store) return fallback;
  try {
    const raw = store.getItem(key);
    if (raw === null) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function save(key, value) {
  const store = backend();
  if (!store) return false;
  try {
    store.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function remove(key) {
  const store = backend();
  if (!store) return false;
  try {
    store.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

export function loadUsedCards() {
  const value = load(KEYS.usedCards, []);
  return Array.isArray(value) ? value : [];
}

export function saveUsedCards(ids) {
  return save(KEYS.usedCards, Array.from(new Set(ids)));
}

export function clearUsedCards() {
  return remove(KEYS.usedCards);
}
