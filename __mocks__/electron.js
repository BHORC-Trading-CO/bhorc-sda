// Минимальный мок electron для юнит-тестов main-процесса (вне Electron runtime).
const { EventEmitter } = require('events');
const allWindows = [];
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
    // Как в Electron: только живые окна.
    static getAllWindows() { return allWindows.filter((win) => !win.destroyed); }
    constructor() {
      super();
      allWindows.push(this);
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
    // Как в Electron (и при закрытии системной кнопкой): 'close', уничтожение, затем 'closed'.
    close() {
      this.emit('close');
      this.destroyed = true;
      this.emit('closed');
    }
  },
  ipcMain: Object.assign(new EventEmitter(), { handle: jest.fn(), removeHandler: jest.fn() }),
  ipcRenderer: { on: () => {}, once: () => {}, send: () => {}, invoke: () => Promise.resolve() },
  contextBridge: { exposeInMainWorld: () => {} },
  Menu: { setApplicationMenu: () => {}, buildFromTemplate: () => ({}) },
  dialog: {},
  shell: { openExternal: jest.fn().mockResolvedValue(undefined) },
};
