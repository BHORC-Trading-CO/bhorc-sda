// In-memory мок electron-store (без записи на диск и без путей Electron).
module.exports = class Store {
  constructor(opts) {
    this.store = (opts && opts.defaults) || {};
  }
  get(key, def) {
    return key in this.store ? this.store[key] : def;
  }
  set(key, val) {
    this.store[key] = val;
  }
  has(key) {
    return key in this.store;
  }
  delete(key) {
    delete this.store[key];
  }
  clear() {
    this.store = {};
  }
};
