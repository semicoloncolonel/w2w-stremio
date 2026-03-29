const store = new Map();

const DEFAULT_TTL = 6 * 60 * 60 * 1000; // 6 hours

function get(key) {
  const entry = store.get(key);
  if (!entry) return undefined;
  if (Date.now() > entry.expires) {
    store.delete(key);
    return undefined;
  }
  return entry.value;
}

function set(key, value, ttlMs = DEFAULT_TTL) {
  store.set(key, { value, expires: Date.now() + ttlMs });
}

function has(key) {
  return get(key) !== undefined;
}

module.exports = { get, set, has };
