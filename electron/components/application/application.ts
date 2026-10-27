import Manager from "../manager/manager";
import WindowsManager from "./WindowsManager/WindowsManager";
import listeners from "./listenersRouters/listenersRouters";
import { app, App, dialog } from "electron";
import createStore, { getCreatedStorePaths, restrictSecretFiles } from "../newStorage/createStore";
import ensureSingleInstance from "./singleInstance";
import { areDataPathsPinned, LEGACY_DATA_DIR_NAME } from "../../dataDir";
import WindowsChannels from "../../interfaces/IpcChannels/WindowsChannels";
import { testCrypto } from "../newStorage/cryptoUserData";
import { getAppEntries } from "./appEntries";
import { installNavigationGuard } from "./navigationGuard";
import { onceTrusted } from "./trustedIpc";

class Application {
  object: App;
  windowsManager: WindowsManager;
  secretKey: string | null;

  constructor() {
    this.object = app;
    installNavigationGuard(getAppEntries());
    this.windowsManager = new WindowsManager();

    this.object.on('window-all-closed', () => {
      if (process.platform !== 'darwin') {
        app.quit();
        process.exit(1);
      }
    })
  }

  firstStage(cb: () => void) {
    const isPrimary = ensureSingleInstance(app, () => {
      const win = this.windowsManager.mainWindow;
      if (!win) return;
      if (win.isMinimized()) win.restore();
      win.focus();
    });
    if (!isPrimary) return;
    app.on("ready", async () => {
      if (!areDataPathsPinned(app.getPath("userData"), getCreatedStorePaths())) {
        dialog.showErrorBox("BHORC SDA", `Данные открыты не из папки ${LEGACY_DATA_DIR_NAME} (${getCreatedStorePaths().join(", ") || app.getPath("userData")}). Запуск остановлен, чтобы не потерять аккаунты.`);
        app.quit();
        return;
      }
      restrictSecretFiles(createStore());
      this.windowsManager.createMain();
      //this.decrypt(cb);
      this.secondStage(cb);
    });
  }

  decrypt(cb: () => void) {
    const store = createStore();
    const secretKey = store.get("secretKey", null);

    if (secretKey) {
      this.windowsManager.mainWindow?.webContents.send(WindowsChannels.GET_SECRET_KEY);
      onceTrusted(WindowsChannels.GET_SECRET_KEY, (event, key) => {
        if (testCrypto(key)) {
          this.secretKey = key;
          this.secondStage(cb);
        } else {
          this.decrypt(cb);
        }
      });
    } else {
      this.secondStage(cb);
    }
  }

  secondStage(cb: () => void) {
    Manager.Load();
    listeners();
    cb();
  }

  sendToMain(channel: string, content: any) {
    if (this.windowsManager.mainWindow)
      this.windowsManager.mainWindow.webContents.send(channel, content);
  }
}

export default new Application();
