jest.mock("../../newStorage/createStore", () => {
    const data: Record<string, unknown> = {};
    const store = { data, get: (key: string) => data[key], set: (key: string, value: unknown) => { data[key] = value; } };
    return { __esModule: true, default: () => store, store };
});

import { ipcMain } from "electron";
import languageListeners from "../../application/listenersRouters/languageListenersRouter";
import WindowsManager from "../../application/WindowsManager/WindowsManager";
import InfoType from "../../application/askInfo/InfoType";
import LanguageChannels from "../../../interfaces/IpcChannels/LanguageChannels";
import { initLanguage } from "../languageManager";
import { getMainLanguage } from "../../../i18n";

const { store } = jest.requireMock("../../newStorage/createStore") as { store: { data: Record<string, unknown> } };
const entryNames = ["MAIN", "AUTH", "CONFIRMATIONS", "ASK_FAMILY_PIN", "ERROR"];
const appUrl = "http://localhost:3000/main_window";
const trusted = () => ({ senderFrame: { url: appUrl }, reply: jest.fn(), returnValue: undefined as unknown });
const foreign = () => ({ senderFrame: { url: "https://evil.test/" }, reply: jest.fn(), returnValue: undefined as unknown });

beforeEach(() => {
    jest.useFakeTimers();
    jest.spyOn(console, "warn").mockImplementation(() => { });
    for (const name of entryNames) {
        (global as any)[`${name}_WINDOW_WEBPACK_ENTRY`] = `http://localhost:3000/${name.toLowerCase()}_window`;
        (global as any)[`${name}_WINDOW_PRELOAD_WEBPACK_ENTRY`] = `/preload/${name}.js`;
    }
    for (const key of Object.keys(store.data)) delete store.data[key];
});

afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
    jest.restoreAllMocks();
    ipcMain.removeAllListeners();
    for (const name of entryNames) {
        delete (global as any)[`${name}_WINDOW_WEBPACK_ENTRY`];
        delete (global as any)[`${name}_WINDOW_PRELOAD_WEBPACK_ENTRY`];
    }
});

function openAllWindows(manager: WindowsManager) {
    manager.createMain();
    manager.createAuthWindow();
    manager.createConfirmationsWindow("account", "name");
    manager.createAskWindow("account", "name", "familyPin" as InfoType);
    manager.createErrorWindow("title", "text");
    return [
        manager.mainWindow!,
        manager.authWindow!,
        manager.confirmationsWindows.account,
        manager.askWindows.account,
        ...Object.values(manager.errorWindows),
    ];
}

it("смена языка из окна доходит до всех окон приложения: главного, подтверждений, ввода PIN/кода, ошибок", () => {
    const manager = new WindowsManager();
    const windows = openAllWindows(manager);
    expect(windows).toHaveLength(5);
    initLanguage("en-US", (channel, payload) => manager.broadcast(channel, payload));
    languageListeners();

    ipcMain.emit(LanguageChannels.SET_LANGUAGE, trusted(), "ru");

    expect(store.data.language).toBe("ru");
    expect(getMainLanguage()).toBe("ru");
    for (const win of windows) {
        expect(win.webContents.send).toHaveBeenCalledWith(LanguageChannels.LANGUAGE_CHANGED, "ru");
    }
});

it("закрытые окна и окна с чужой страницей рассылку не получают", () => {
    const manager = new WindowsManager();
    const [main, , confirmations, ask] = openAllWindows(manager);
    confirmations.close();
    ask.loadURL("https://evil.test/");
    manager.broadcast(LanguageChannels.LANGUAGE_CHANGED, "uk");
    expect(main.webContents.send).toHaveBeenCalledWith(LanguageChannels.LANGUAGE_CHANGED, "uk");
    expect(confirmations.webContents.send).not.toHaveBeenCalled();
    expect(ask.webContents.send).not.toHaveBeenCalled();
});

it("недопустимый язык отклоняется: не сохраняется и не рассылается", () => {
    const broadcast = jest.fn();
    initLanguage("uk-UA", broadcast);
    languageListeners();
    for (const value of ["de", "", null, { lang: "en" }]) ipcMain.emit(LanguageChannels.SET_LANGUAGE, trusted(), value);
    expect(store.data.language).toBe("uk");
    expect(broadcast).not.toHaveBeenCalled();
    expect(console.warn).toHaveBeenCalledTimes(4);
});

it("чужая страница язык не меняет", () => {
    const broadcast = jest.fn();
    initLanguage("uk-UA", broadcast);
    languageListeners();
    ipcMain.emit(LanguageChannels.SET_LANGUAGE, foreign(), "ru");
    expect(store.data.language).toBe("uk");
    expect(broadcast).not.toHaveBeenCalled();
});

it("синхронный запрос языка: значение в returnValue; чужой странице — язык по умолчанию, без зависания", () => {
    initLanguage("uk-UA");
    languageListeners();
    const event = trusted();
    ipcMain.emit(LanguageChannels.GET_LANGUAGE, event);
    expect(event.returnValue).toBe("uk");

    const untrusted = foreign();
    ipcMain.emit(LanguageChannels.GET_LANGUAGE, untrusted);
    expect(untrusted.returnValue).toBe("en");
});
