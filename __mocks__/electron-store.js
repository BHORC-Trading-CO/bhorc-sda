// In-memory мок electron-store (без записи на диск и без путей Electron).
const stores = new Map();
const copy = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
const read = (object, key) => key.split('.').reduce((value, part) =>
  value && Object.prototype.hasOwnProperty.call(value, part) ? value[part] : undefined, object);
const write = (object, key, value) => {
  const parts = key.split('.');
  const last = parts.pop();
  const parent = parts.reduce((current, part) => {
    if (!current[part] || typeof current[part] !== 'object') current[part] = {};
    return current[part];
  }, object);
  parent[last] = copy(value);
};

module.exports = class Store {
  constructor(opts = {}) {
    this.key = JSON.stringify([opts.cwd || '', opts.name || 'config']);
    if (!stores.has(this.key)) stores.set(this.key, copy(opts.defaults || {}));
  }
  get store() { return stores.get(this.key); }
  set store(value) { stores.set(this.key, value); }
  get(key, def) {
    const value = read(this.store, key);
    return copy(value === undefined ? def : value);
  }
  set(key, val) {
    const next = copy(this.store);
    const values = typeof key === 'object' ? key : { [key]: val };
    for (const [path, value] of Object.entries(values)) write(next, path, value);
    this.store = next;
  }
  has(key) {
    return read(this.store, key) !== undefined;
  }
  delete(key) {
    const next = copy(this.store);
    const parts = key.split('.');
    const last = parts.pop();
    const parent = parts.length ? read(next, parts.join('.')) : next;
    if (parent) delete parent[last];
    this.store = next;
  }
  clear() {
    this.store = {};
  }
};
