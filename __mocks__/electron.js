// Минимальный мок electron для юнит-тестов main-процесса (вне Electron runtime).
module.exports = {
  app: {
    whenReady: () => Promise.resolve(),
    on: () => {},
    getPath: () => process.cwd(),
    quit: () => {},
    requestSingleInstanceLock: () => true,
  },
  BrowserWindow: class BrowserWindow {
    constructor() {
      this.webContents = { send: () => {}, on: () => {}, session: { webRequest: { onBeforeSendHeaders: () => {} } } };
    }
    on() {}
    loadURL() {}
    show() {}
    focus() {}
    close() {}
  },
  ipcMain: { on: () => {}, once: () => {}, removeListener: () => {}, handle: () => {} },
  ipcRenderer: { on: () => {}, once: () => {}, send: () => {}, invoke: () => Promise.resolve() },
  contextBridge: { exposeInMainWorld: () => {} },
  Menu: { setApplicationMenu: () => {}, buildFromTemplate: () => ({}) },
  dialog: {},
  shell: {},
};
