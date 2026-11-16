import { app, ipcMain } from "electron";
import AppSettingsChannels from "../../../interfaces/IpcChannels/AppSettingsChannels";
import { appSettingsGetListener, appSettingsSaveListener } from "../Listeners/appSettingsListeners";
import appSettingsListeners from "../../application/listenersRouters/appSettingsListenersRouter";
import AppSettingsStorage from "../../newStorage/AppSettingsStorage";
import backgroundMode from "../backgroundMode";
import { setMainLanguage } from "../../../i18n";

// IPC of the Settings page (SDA-35, SDA-36): get / save with the reply on APP_SETTINGS_GET and the
// refusal on APP_SETTINGS_ERROR; registered only through the trusted-sender wrapper.

const ALL_OFF = { closeToTray: false, launchAtLogin: false, startMinimized: false };
const entry = "http://localhost:3000/main_window";
const makeEvent = () => ({ reply: jest.fn(), senderFrame: { url: entry } } as any);
const replies = (event: any, channel: string) => event.reply.mock.calls.filter((call: any[]) => call[0] === channel).map((call: any[]) => call[1]);

beforeAll(() => setMainLanguage("en"));
beforeEach(() => {
    AppSettingsStorage.Save(ALL_OFF);
    backgroundMode.update({ key: "closeToTray", value: false });
    (app as any).isPackaged = false;
});
afterAll(() => backgroundMode.tray.destroy());

it("get replies with the saved settings and what this system supports", () => {
    const event = makeEvent();
    appSettingsGetListener(event);
    expect(replies(event, AppSettingsChannels.APP_SETTINGS_GET)).toEqual([
        { settings: ALL_OFF, loginItem: process.platform === "linux" ? "unsupportedPlatform" : "notPackaged", trayUnavailable: false },
    ]);
});

it("save merges one switch and replies with the full state", () => {
    const event = makeEvent();
    appSettingsSaveListener(event, { key: "closeToTray", value: true });
    expect(replies(event, AppSettingsChannels.APP_SETTINGS_ERROR)).toEqual([]);
    expect(replies(event, AppSettingsChannels.APP_SETTINGS_GET)[0].settings).toEqual({ ...ALL_OFF, closeToTray: true });
    expect(AppSettingsStorage.Get()).toEqual({ ...ALL_OFF, closeToTray: true });
});

it("malformed save: the reason and the unchanged state come back", () => {
    const event = makeEvent();
    appSettingsSaveListener(event, { key: "closeToTray", value: 1 });
    expect(replies(event, AppSettingsChannels.APP_SETTINGS_ERROR)).toEqual([{ message: "Settings were not saved: unexpected values." }]);
    expect(replies(event, AppSettingsChannels.APP_SETTINGS_GET)[0].settings).toEqual(ALL_OFF);
});

describe("registration", () => {
    const entryNames = ["MAIN"];
    beforeEach(() => {
        for (const name of entryNames) (global as any)[`${name}_WINDOW_WEBPACK_ENTRY`] = entry;
        jest.spyOn(console, "warn").mockImplementation(() => {});
    });
    afterEach(() => {
        ipcMain.removeAllListeners();
        for (const name of entryNames) delete (global as any)[`${name}_WINDOW_WEBPACK_ENTRY`];
        (console.warn as jest.Mock).mockRestore();
    });

    it("a foreign page cannot read or change the settings", () => {
        appSettingsListeners();
        const foreign = { reply: jest.fn(), senderFrame: { url: "https://evil.test/" } };
        ipcMain.emit(AppSettingsChannels.APP_SETTINGS_SAVE, foreign, { key: "closeToTray", value: true });
        ipcMain.emit(AppSettingsChannels.APP_SETTINGS_GET, foreign);
        expect(foreign.reply).not.toHaveBeenCalled();
        expect(AppSettingsStorage.Get()).toEqual(ALL_OFF);

        const own = makeEvent();
        ipcMain.emit(AppSettingsChannels.APP_SETTINGS_GET, own);
        expect(replies(own, AppSettingsChannels.APP_SETTINGS_GET)).toHaveLength(1);
    });
});
