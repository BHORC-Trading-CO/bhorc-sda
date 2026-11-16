// Минимальный мок electron для юнит-тестов main-процесса (вне Electron runtime).
const { EventEmitter } = require('events');
const allWindows = [];
const app = Object.assign(new EventEmitter(), {
  whenReady: () => Promise.resolve(),
  getPath: jest.fn(() => process.cwd()),
  setPath: jest.fn(),
  quit: () => {},
  requestSingleInstanceLock: () => true,
  isPackaged: false,
  show: jest.fn(),
  focus: jest.fn(),
  getLoginItemSettings: jest.fn(() => ({ openAtLogin: false, openAsHidden: false, wasOpenedAtLogin: false, wasOpenedAsHidden: false, restoreState: false, executableWillLaunchAtLogin: false, launchItems: [] })),
  setLoginItemSettings: jest.fn(),
});

module.exports = {
  app,
  BrowserWindow: class BrowserWindow extends EventEmitter {
    // Как в Electron: только живые окна.
    static getAllWindows() { return allWindows.filter((win) => !win.destroyed); }
    constructor(options = {}) {
      super();
      allWindows.push(this);
      this.url = '';
      this.destroyed = false;
      this.visible = options.show !== false;
      this.minimized = false;
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
    show() { this.visible = true; }
    hide() { this.visible = false; }
    isVisible() { return this.visible; }
    isMinimized() { return this.minimized; }
    restore() { this.minimized = false; }
    isFullScreen() { return !!this.fullScreen; }
    setFullScreen(flag) {
      const left = this.fullScreen && !flag;
      this.fullScreen = flag;
      if (left) this.emit('leave-full-screen');
    }
    focus() {}
    // Как в Electron (и при закрытии системной кнопкой): 'close', уничтожение, затем 'closed'.
    // preventDefault() в обработчике 'close' отменяет закрытие (окно в трей, SDA-35).
    close() {
      let prevented = false;
      this.emit('close', { preventDefault: () => { prevented = true; } });
      if (prevented) return;
      this.destroyed = true;
      this.emit('closed');
    }
  },
  Tray: class Tray extends EventEmitter {
    constructor(image) {
      super();
      this.image = image;
      this.destroyed = false;
      this.setContextMenu = jest.fn();
      this.setToolTip = jest.fn();
    }
    destroy() { this.destroyed = true; }
    isDestroyed() { return this.destroyed; }
  },
  nativeImage: {
    createFromPath: jest.fn((file) => ({ file, isEmpty: () => false, setTemplateImage: jest.fn() })),
  },
  ipcMain: Object.assign(new EventEmitter(), { handle: jest.fn(), removeHandler: jest.fn() }),
  ipcRenderer: { on: () => {}, once: () => {}, send: () => {}, invoke: () => Promise.resolve() },
  contextBridge: { exposeInMainWorld: () => {} },
  Menu: { setApplicationMenu: () => {}, buildFromTemplate: () => ({}) },
  dialog: {},
  shell: { openExternal: jest.fn().mockResolvedValue(undefined) },
};
