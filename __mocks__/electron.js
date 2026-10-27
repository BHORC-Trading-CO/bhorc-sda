// Минимальный мок electron для юнит-тестов main-процесса (вне Electron runtime).
const { EventEmitter } = require('events');
const app = Object.assign(new EventEmitter(), {
  whenReady: () => Promise.resolve(),
  getPath: jest.fn(() => process.cwd()),
  setPath: jest.fn(),
  quit: () => {},
  requestSingleInstanceLock: () => true,
});

module.exports = {
  app,
  BrowserWindow: class BrowserWindow extends EventEmitter {
    constructor() {
      super();
      this.url = '';
      this.destroyed = false;
      this.webContents = Object.assign(new EventEmitter(), {
        send: jest.fn(),
        getURL: () => this.url,
        setWindowOpenHandler: jest.fn(),
        session: { webRequest: { onBeforeSendHeaders: () => {} } },
      });
      app.emit('web-contents-created', {}, this.webContents);
    }
    loadURL(url) { this.url = url; }
    isDestroyed() { return this.destroyed; }
    show() {}
    focus() {}
    close() {
      this.emit('close');
      this.destroyed = true;
    }
  },
  ipcMain: Object.assign(new EventEmitter(), { handle: jest.fn(), removeHandler: jest.fn() }),
  ipcRenderer: { on: () => {}, once: () => {}, send: () => {}, invoke: () => Promise.resolve() },
  contextBridge: { exposeInMainWorld: () => {} },
  Menu: { setApplicationMenu: () => {}, buildFromTemplate: () => ({}) },
  dialog: {},
  shell: { openExternal: jest.fn().mockResolvedValue(undefined) },
};
