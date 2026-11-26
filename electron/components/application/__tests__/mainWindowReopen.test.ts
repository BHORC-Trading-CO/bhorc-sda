// SDA-64: приложение живо, а главного окна нет (macOS: закрыли, осталось в Dock) — окно открывается
// заново, а данные при этом не загружаются и слушатели не регистрируются второй раз.
jest.mock("../../Manager/Manager", () => ({ __esModule: true, default: { Load: jest.fn() } }));
jest.mock("../listenersRouters/listenersRouters", () => ({ __esModule: true, default: jest.fn() }));
jest.mock("../listenersRouters/languageListenersRouter", () => ({ __esModule: true, default: jest.fn() }));
jest.mock("../../../dataDir", () => ({ areDataPathsPinned: () => true, LEGACY_DATA_DIR_NAME: "test" }));
jest.mock("../../newStorage/createStore", () => ({ __esModule: true, ...jest.requireActual("../../newStorage/createStore"), restrictSecretFiles: jest.fn() }));
jest.mock("../../language/languageManager", () => ({ initLanguage: jest.fn(), localeToLanguage: () => "en" }));

import { app, BrowserWindow } from "electron";
import Manager from "../../Manager/Manager";
import listeners from "../listenersRouters/listenersRouters";
import AppSettingsStorage from "../../newStorage/AppSettingsStorage";

const platform = Object.getOwnPropertyDescriptor(process, "platform")!;
const names = ["MAIN", "AUTH", "CONFIRMATIONS", "ASK_FAMILY_PIN", "ERROR"];
beforeAll(() => {
    // До require приложения: BackgroundMode запоминает платформу при создании.
    Object.defineProperty(process, "platform", { ...platform, value: "darwin" });
    for (const name of names) {
        (global as any)[`${name}_WINDOW_WEBPACK_ENTRY`] = `http://localhost:3000/${name.toLowerCase()}_window`;
        (global as any)[`${name}_WINDOW_PRELOAD_WEBPACK_ENTRY`] = `/preload/${name}.js`;
    }
    Object.assign(app, { getLocale: () => "en" });
    jest.spyOn(console, "log").mockImplementation(() => {});
});
afterAll(() => {
    Object.defineProperty(process, "platform", platform);
    jest.restoreAllMocks();
    (app as any).removeAllListeners();
    for (const name of names) {
        delete (global as any)[`${name}_WINDOW_WEBPACK_ENTRY`];
        delete (global as any)[`${name}_WINDOW_PRELOAD_WEBPACK_ENTRY`];
    }
});

it("macOS: a second launch opens the main window again", () => {
    AppSettingsStorage.Save({ closeToTray: false, launchAtLogin: false, startMinimized: false });
    const application = require("../application").default;
    application.firstStage(() => undefined);
    (app as any).emit("ready");
    const first = application.windowsManager.mainWindow;
    expect(BrowserWindow.getAllWindows()).toEqual([first]);
    expect(first.url).toBe("http://localhost:3000/main_window");

    const confirmations = new BrowserWindow({});
    Object.assign(app, { quit: jest.fn() });
    first.close();
    (app as any).emit("second-instance", {}, ["bhorc-sda"]);

    const second = application.windowsManager.mainWindow;
    expect(second).not.toBe(first);
    expect([second.isDestroyed(), second.isVisible(), second.url]).toEqual([false, true, first.url]);
    application.sendToMain("CHANNEL", 1);
    expect(second.webContents.send).toHaveBeenCalledWith("CHANNEL", 1);
    expect(confirmations.isDestroyed()).toBe(false);
    expect(app.quit).not.toHaveBeenCalled();
    expect(Manager.Load).toHaveBeenCalledTimes(1);
    expect(listeners).toHaveBeenCalledTimes(1);
});
