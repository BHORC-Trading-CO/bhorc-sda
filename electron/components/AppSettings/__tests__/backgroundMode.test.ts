import { app, BrowserWindow, Menu, nativeImage } from "electron";
import { BackgroundMode } from "../backgroundMode";
import AppSettingsStorage from "../../newStorage/AppSettingsStorage";
import ensureSingleInstance from "../../application/singleInstance";
import AppSettingsInterface from "../../../interfaces/AppSettings/AppSettingsInterface";
import { setMainLanguage } from "../../../i18n";
import { LOGIN_ITEM_NAME } from "../loginItem";

// Background mode wired to the mocked Electron (SDA-35, SDA-36): the main window's close, real
// quits, start hidden, second launch, the tray menu and the login item. The mock BrowserWindow
// emits 'close' with preventDefault, then 'closed' — as Electron does for the system close button.

const ALL_OFF: AppSettingsInterface = { closeToTray: false, launchAtLogin: false, startMinimized: false };
const mockApp = app as any;
const quit = jest.fn();
const modes: BackgroundMode[] = [];

function makeMode(platform: NodeJS.Platform, stored: Partial<AppSettingsInterface> = {}, argv: string[] = ["sda"]) {
    AppSettingsStorage.Save({ ...ALL_OFF, ...stored });
    const mode = new BackgroundMode(platform);
    modes.push(mode);
    mode.install(argv);
    return mode;
}

const MINIMIZED_AT_LOGIN = { launchAtLogin: true, startMinimized: true };
/** Our Windows Run entry for this program as Electron 17 lists it in launchItems. */
const ourEntry = (over: object = {}) => ({ name: LOGIN_ITEM_NAME, path: process.execPath, args: [], scope: "user", enabled: true, ...over });
const patch = (key: keyof AppSettingsInterface, value: boolean) => ({ key, value });

function start(mode: BackgroundMode, argv: string[] = ["sda"]) {
    const { startHidden } = mode.prepareStartup(argv);
    const win = new BrowserWindow({ show: !startHidden });
    mode.attachMainWindow(win);
    return { win, startHidden };
}

const trayMenuItem = (index: number) => {
    const calls = (Menu.buildFromTemplate as jest.Mock).mock.calls;
    return (calls[calls.length - 1][0] as any[]).filter((item) => item.type !== "separator")[index];
};

beforeAll(() => {
    jest.spyOn(Menu, "buildFromTemplate");
    setMainLanguage("en");
});
beforeEach(() => {
    mockApp.quit = quit;
    mockApp.isPackaged = true;
    mockApp.getLoginItemSettings.mockReturnValue({ openAtLogin: false, wasOpenedAtLogin: false, wasOpenedAsHidden: false });
});
afterEach(() => {
    modes.splice(0).forEach((mode) => mode.tray.destroy());
    mockApp.removeAllListeners();
    mockApp.isPackaged = false;
});

describe("closing the main window", () => {
    it("setting off (existing installs): the window really closes, no tray icon", () => {
        const mode = makeMode("win32");
        const { win, startHidden } = start(mode);
        expect(startHidden).toBe(false);
        expect(mode.tray.ready).toBe(false);
        win.close();
        expect(win.isDestroyed()).toBe(true);
    });

    it.each(["win32", "darwin", "linux"] as const)("%s, setting on: the window hides, stays alive, the tray icon stays", (platform) => {
        const mode = makeMode(platform, { closeToTray: true });
        const { win } = start(mode);
        expect(mode.tray.ready).toBe(true);
        win.close();
        expect(win.isDestroyed()).toBe(false);
        expect(win.isVisible()).toBe(false);
        expect(mode.tray.ready).toBe(true);
    });

    it("macOS full screen: leaves full screen first, then hides (no empty black Space)", () => {
        const mode = makeMode("darwin", { closeToTray: true });
        const { win } = start(mode);
        win.setFullScreen(true);
        const order: string[] = [];
        win.on("leave-full-screen", () => order.push(`left, visible=${win.isVisible()}`));
        win.close();
        expect(order).toEqual(["left, visible=true"]);
        expect(win.isFullScreen()).toBe(false);
        expect(win.isVisible()).toBe(false);
        expect(win.isDestroyed()).toBe(false);
    });

    it("macOS full screen: brought back before the full-screen exit ends -> it stays visible", () => {
        const mode = makeMode("darwin", { closeToTray: true });
        const { win } = start(mode);
        win.fullScreen = true;
        // Electron leaves full screen with an animation: hold the event back.
        win.setFullScreen = jest.fn();
        win.close();
        mode.revealMainWindow();
        win.emit("leave-full-screen");
        expect(win.isVisible()).toBe(true);
    });

    it("a real quit (before-quit: tray Quit, Cmd+Q, app menu) closes even with the setting on; the tray goes too", () => {
        const mode = makeMode("darwin", { closeToTray: true });
        const { win } = start(mode);
        mockApp.emit("before-quit", { preventDefault: jest.fn() });
        win.close();
        expect(win.isDestroyed()).toBe(true);
        expect(mode.tray.ready).toBe(false);
    });

    it("Windows session end (shutdown, restart, sign-out) is not held up by the hide", () => {
        const mode = makeMode("win32", { closeToTray: true });
        const { win } = start(mode);
        win.emit("session-end");
        win.close();
        expect(win.isDestroyed()).toBe(true);
    });

    it("Windows without a tray icon: the setting cannot strand the window, close quits as before", () => {
        (nativeImage.createFromPath as jest.Mock).mockReturnValueOnce({ isEmpty: () => true, setTemplateImage: jest.fn() });
        const log = jest.spyOn(console, "log").mockImplementation(() => {});
        const mode = makeMode("win32", { closeToTray: true });
        const { win } = start(mode);
        expect(mode.view().trayUnavailable).toBe(true);
        win.close();
        expect(win.isDestroyed()).toBe(true);
        log.mockRestore();
    });
});

// SDA-64: closing the main window must not leave SDA running without a way back to it.
describe("closing the main window while other windows are open", () => {
    let opened: BrowserWindow[];
    beforeEach(() => {
        for (const win of BrowserWindow.getAllWindows()) (win as any).destroyed = true;
        opened = [];
    });
    function startReopenable(platform: NodeJS.Platform, stored: Partial<AppSettingsInterface> = {}) {
        AppSettingsStorage.Save({ ...ALL_OFF, ...stored });
        const mode = new BackgroundMode(platform);
        modes.push(mode);
        const open = () => {
            const win = new BrowserWindow({});
            opened.push(win);
            mode.attachMainWindow(win);
        };
        mode.install(["sda"], open);
        // Dock 'activate' of the very first launch comes before the first window: it must not open one.
        mode.revealMainWindow();
        expect(opened).toHaveLength(0);
        mode.prepareStartup(["sda"]);
        open();
        return { mode, win: opened[0] };
    }

    it.each(["win32", "linux"] as const)("%s: closing means exit, so SDA quits and the other windows go too", (platform) => {
        const { win } = startReopenable(platform);
        new BrowserWindow({});
        win.close();
        expect(quit).toHaveBeenCalledTimes(1);
    });

    it("Windows: with no other window the exit stays with 'window-all-closed'", () => {
        startReopenable("win32").win.close();
        expect(quit).not.toHaveBeenCalled();
    });

    it("Windows: hiding to the tray quits nothing, and the same window comes back", () => {
        const { mode, win } = startReopenable("win32", { closeToTray: true });
        new BrowserWindow({});
        win.close();
        expect(quit).not.toHaveBeenCalled();
        mode.onSecondLaunch(["trademanager.exe"]);
        expect([win.isVisible(), opened.length]).toEqual([true, 1]);
    });

    it("a real quit does not start another one, and a late launch does not open a window", () => {
        const { mode, win } = startReopenable("win32");
        new BrowserWindow({});
        mockApp.emit("before-quit", { preventDefault: jest.fn() });
        win.close();
        expect(quit).not.toHaveBeenCalled();
        mode.onSecondLaunch(["trademanager.exe"]);
        expect(opened).toHaveLength(1);
    });

    it.each(["Dock click", "second launch"])("macOS: SDA stays in the Dock; a %s opens one new main window", (way) => {
        const { mode, win } = startReopenable("darwin");
        const confirmations = new BrowserWindow({});
        win.close();
        expect(quit).not.toHaveBeenCalled();
        expect(confirmations.isDestroyed()).toBe(false);
        const reveal = () => way === "Dock click" ? mockApp.emit("activate") : mode.onSecondLaunch(["bhorc-sda"]);
        reveal();
        reveal();
        expect(opened).toHaveLength(2);
        expect([opened[1].isVisible(), opened[1].isDestroyed()]).toEqual([true, false]);
        opened[1].close();
        reveal();
        expect(opened).toHaveLength(3);
    });

    it("macOS: a launch with --hidden does not open a closed window", () => {
        const { mode, win } = startReopenable("darwin");
        win.close();
        mode.onSecondLaunch(["bhorc-sda", "--hidden"]);
        expect(opened).toHaveLength(1);
    });
});

describe("tray menu", () => {
    it("Show window brings the hidden window back; Quit quits the app", () => {
        const mode = makeMode("win32", { closeToTray: true });
        const { win } = start(mode);
        win.close();
        expect(win.isVisible()).toBe(false);
        trayMenuItem(0).click();
        expect(win.isVisible()).toBe(true);
        trayMenuItem(1).click();
        expect(quit).toHaveBeenCalledTimes(1);
    });

    it("macOS: a click on the Dock icon (activate) brings the hidden window back", () => {
        const mode = makeMode("darwin", { closeToTray: true });
        const { win } = start(mode);
        win.close();
        mockApp.emit("activate");
        expect(win.isVisible()).toBe(true);
        expect(mockApp.focus).toHaveBeenCalledWith({ steal: true });
    });
});

describe("second launch while running in the tray", () => {
    it("the single-instance handler shows and focuses the hidden window", () => {
        const mode = makeMode("win32", { closeToTray: true });
        const fakeApp = { requestSingleInstanceLock: jest.fn(() => true), quit: jest.fn(), on: jest.fn() };
        expect(ensureSingleInstance(fakeApp as any, (_event, argv) => mode.onSecondLaunch(argv))).toBe(true);
        const { win } = start(mode);
        const focus = jest.spyOn(win, "focus");
        win.close();
        const [, onSecondInstance] = fakeApp.on.mock.calls[0];
        onSecondInstance({}, ["trademanager.exe"]);
        expect(win.isVisible()).toBe(true);
        expect(focus).toHaveBeenCalled();
    });

    it("a second launch with --hidden (a login item firing while SDA runs) leaves the window hidden", () => {
        const mode = makeMode("win32", { closeToTray: true });
        const { win } = start(mode);
        win.close();
        mode.onSecondLaunch(["trademanager.exe", "--hidden"]);
        expect(win.isVisible()).toBe(false);
        mode.onSecondLaunch(["trademanager.exe"]);
        expect(win.isVisible()).toBe(true);
    });

    it("before the window exists or after it was closed: no exception", () => {
        const mode = makeMode("win32");
        expect(mode.revealMainWindow()).toBe(false);
        const { win } = start(mode);
        win.close();
        expect(mode.revealMainWindow()).toBe(false);
    });
});

describe("start without the main window", () => {
    it("--hidden with launch at login + start minimized on: tray icon created, window not shown", () => {
        const mode = makeMode("win32", MINIMIZED_AT_LOGIN);
        const { win, startHidden } = start(mode, ["trademanager.exe", "--hidden"]);
        expect(startHidden).toBe(true);
        expect(mode.tray.ready).toBe(true);
        expect(win.isVisible()).toBe(false);
        trayMenuItem(0).click();
        expect(win.isVisible()).toBe(true);
    });

    it("--hidden but the tray icon cannot be created: the window is shown", () => {
        (nativeImage.createFromPath as jest.Mock).mockReturnValueOnce({ isEmpty: () => true, setTemplateImage: jest.fn() });
        const log = jest.spyOn(console, "log").mockImplementation(() => {});
        const mode = makeMode("win32", MINIMIZED_AT_LOGIN);
        const { win, startHidden } = start(mode, ["trademanager.exe", "--hidden"]);
        expect(startHidden).toBe(false);
        expect(win.isVisible()).toBe(true);
        log.mockRestore();
    });

    it("macOS: opened at login with \"Start minimized\" on", () => {
        mockApp.getLoginItemSettings.mockReturnValue({ openAtLogin: true, wasOpenedAtLogin: true, wasOpenedAsHidden: false });
        const mode = makeMode("darwin", MINIMIZED_AT_LOGIN);
        expect(start(mode).startHidden).toBe(true);
    });

    it("macOS, everything off (an existing install): a hidden login item still gets the window, no tray icon", () => {
        mockApp.getLoginItemSettings.mockReturnValue({ openAtLogin: true, wasOpenedAtLogin: true, wasOpenedAsHidden: true });
        const mode = makeMode("darwin");
        const { win, startHidden } = start(mode, ["bhorc-sda", "--hidden"]);
        expect(startHidden).toBe(false);
        expect(win.isVisible()).toBe(true);
        expect(mode.tray.ready).toBe(false);
    });

    it("Linux never starts hidden, even with both settings on and --hidden", () => {
        const mode = makeMode("linux", MINIMIZED_AT_LOGIN);
        const { win, startHidden } = start(mode, ["bhorc-sda", "--hidden"]);
        expect(startHidden).toBe(false);
        expect(win.isVisible()).toBe(true);
    });

    it("macOS development run: login flags are not read", () => {
        mockApp.isPackaged = false;
        mockApp.getLoginItemSettings.mockReturnValue({ openAtLogin: true, wasOpenedAtLogin: true, wasOpenedAsHidden: true });
        const mode = makeMode("darwin", MINIMIZED_AT_LOGIN);
        expect(start(mode).startHidden).toBe(false);
        expect(mockApp.getLoginItemSettings).not.toHaveBeenCalled();
    });

    it("a session that started hidden keeps the tray icon, but closing still quits when close-to-tray is off", () => {
        const mode = makeMode("win32", MINIMIZED_AT_LOGIN);
        const { win } = start(mode, ["trademanager.exe", "--hidden"]);
        trayMenuItem(0).click();
        win.close();
        expect(win.isDestroyed()).toBe(true);
        expect(mode.tray.ready).toBe(false);
    });
});

describe("saving from the Settings page (one switch per save)", () => {
    it("close-to-tray on/off creates and removes the tray icon, and is stored", () => {
        const mode = makeMode("win32");
        start(mode);
        expect(mode.update(patch("closeToTray", true))).toEqual({ ok: true });
        expect(mode.tray.ready).toBe(true);
        expect(AppSettingsStorage.Get().closeToTray).toBe(true);
        expect(mode.update(patch("closeToTray", false))).toEqual({ ok: true });
        expect(mode.tray.ready).toBe(false);
        expect(mockApp.setLoginItemSettings).not.toHaveBeenCalled();
    });

    it("a save changes only its own key; the others stay as stored", () => {
        const mode = makeMode("win32", { closeToTray: true });
        start(mode);
        mode.update(patch("launchAtLogin", true));
        mode.update(patch("startMinimized", true));
        expect(AppSettingsStorage.Get()).toEqual({ closeToTray: true, launchAtLogin: true, startMinimized: true });
    });

    it("Windows: launch at login registers this exe, start minimized adds --hidden, off removes it", () => {
        const mode = makeMode("win32");
        start(mode);
        mode.update(patch("launchAtLogin", true));
        expect(mockApp.setLoginItemSettings).toHaveBeenLastCalledWith({ openAtLogin: true, path: process.execPath, args: [], name: LOGIN_ITEM_NAME });
        expect(mode.view().settings.launchAtLogin).toBe(true);
        mode.update(patch("startMinimized", true));
        expect(mockApp.setLoginItemSettings).toHaveBeenLastCalledWith({ openAtLogin: true, path: process.execPath, args: ["--hidden"], name: LOGIN_ITEM_NAME });
        mode.update(patch("launchAtLogin", false));
        expect(mockApp.setLoginItemSettings).toHaveBeenLastCalledWith({ openAtLogin: false, path: process.execPath, args: [], name: LOGIN_ITEM_NAME });
        expect(mockApp.setLoginItemSettings).toHaveBeenCalledTimes(3);
        // Start minimized while launch at login is off: nothing to change in the system.
        mode.update(patch("startMinimized", false));
        expect(mockApp.setLoginItemSettings).toHaveBeenCalledTimes(3);
        expect(AppSettingsStorage.Get()).toEqual(ALL_OFF);
    });

    it("macOS: openAtLogin + openAsHidden", () => {
        const mode = makeMode("darwin", { startMinimized: true });
        start(mode);
        mode.update(patch("launchAtLogin", true));
        expect(mockApp.setLoginItemSettings).toHaveBeenLastCalledWith({ openAtLogin: true, openAsHidden: true });
    });

    it.each([["linux", true, "unsupportedPlatform"], ["win32", false, "notPackaged"]] as const)(
        "%s (packaged=%s): startup switches are ignored and the system is not touched", (platform, packaged, support) => {
            mockApp.isPackaged = packaged;
            const mode = makeMode(platform);
            start(mode);
            expect(mode.update(patch("closeToTray", true))).toEqual({ ok: true });
            expect(mode.update(patch("launchAtLogin", true))).toEqual({ ok: true });
            expect(mode.update(patch("startMinimized", true))).toEqual({ ok: true });
            expect(mockApp.setLoginItemSettings).not.toHaveBeenCalled();
            expect(AppSettingsStorage.Get()).toEqual({ ...ALL_OFF, closeToTray: true });
            expect(mode.view()).toEqual({ settings: { ...ALL_OFF, closeToTray: true }, loginItem: support, trayUnavailable: false });
        });

    it("a development run sharing config.json does not switch off the installed copy's launch at login", () => {
        mockApp.isPackaged = false;
        const mode = makeMode("win32", MINIMIZED_AT_LOGIN);
        start(mode);
        mode.update(patch("launchAtLogin", false));
        mode.update(patch("closeToTray", true));
        expect(AppSettingsStorage.Get()).toEqual({ closeToTray: true, ...MINIMIZED_AT_LOGIN });
        expect(mockApp.setLoginItemSettings).not.toHaveBeenCalled();
    });

    it("the system refuses the login item: nothing is saved, the reason comes back", () => {
        const mode = makeMode("win32");
        start(mode);
        mockApp.setLoginItemSettings.mockImplementationOnce(() => { throw new Error("Access is denied."); });
        expect(mode.update(patch("launchAtLogin", true))).toEqual({ ok: false, message: "Could not change system startup: Access is denied." });
        expect(AppSettingsStorage.Get()).toEqual(ALL_OFF);
        expect(mode.view().settings.launchAtLogin).toBe(false);
    });

    it("malformed save: rejected, nothing changes", () => {
        const mode = makeMode("win32", { closeToTray: true });
        start(mode);
        expect(mode.update({ closeToTray: false, launchAtLogin: false, startMinimized: false })).toEqual({ ok: false, message: "Settings were not saved: unexpected values." });
        expect(mode.update({ key: "closeToTray", value: "no" })).toEqual({ ok: false, message: "Settings were not saved: unexpected values." });
        expect(AppSettingsStorage.Get()).toEqual({ ...ALL_OFF, closeToTray: true });
        expect(mode.tray.ready).toBe(true);
    });
});

describe("login item at startup: read to show the switch, never written", () => {
    it("Windows: stored on, no entry in the system -> zero writes, the switch shows off", () => {
        mockApp.getLoginItemSettings.mockReturnValue({ openAtLogin: false, launchItems: [] });
        const mode = makeMode("win32", { launchAtLogin: true });
        start(mode);
        expect(mockApp.getLoginItemSettings).toHaveBeenCalledWith({ path: process.execPath, args: [] });
        expect(mockApp.setLoginItemSettings).toHaveBeenCalledTimes(0);
        expect(mode.view().settings.launchAtLogin).toBe(false);
        // The stored value is not rewritten either.
        expect(AppSettingsStorage.Get().launchAtLogin).toBe(true);
    });

    it("Windows: stored on, entry disabled in Task Manager -> zero writes, off; the user's flip writes it again", () => {
        mockApp.getLoginItemSettings.mockReturnValue({ openAtLogin: false, launchItems: [ourEntry({ enabled: false })] });
        const mode = makeMode("win32", MINIMIZED_AT_LOGIN);
        start(mode);
        expect(mockApp.setLoginItemSettings).not.toHaveBeenCalled();
        expect(mode.view().settings.launchAtLogin).toBe(false);
        mode.update(patch("launchAtLogin", true));
        expect(mockApp.setLoginItemSettings).toHaveBeenCalledWith({ openAtLogin: true, path: process.execPath, args: ["--hidden"], name: LOGIN_ITEM_NAME });
        expect(mode.view().settings.launchAtLogin).toBe(true);
    });

    it("Windows: stored on, our enabled entry for this program -> on, zero writes", () => {
        mockApp.getLoginItemSettings.mockReturnValue({ openAtLogin: false, launchItems: [ourEntry()] });
        const mode = makeMode("win32", { launchAtLogin: true });
        start(mode);
        expect(mode.view().settings.launchAtLogin).toBe(true);
        expect(mockApp.setLoginItemSettings).not.toHaveBeenCalled();
    });

    it("Windows: an entry of ours, but stored off -> shown off", () => {
        mockApp.getLoginItemSettings.mockReturnValue({ openAtLogin: false, launchItems: [ourEntry()] });
        const mode = makeMode("win32");
        start(mode);
        expect(mode.view().settings.launchAtLogin).toBe(false);
    });

    it.each([[false, false], [true, true]])("macOS: stored on, system openAtLogin=%s -> shown %s, zero writes", (openAtLogin, shown) => {
        mockApp.getLoginItemSettings.mockReturnValue({ openAtLogin, wasOpenedAtLogin: false, wasOpenedAsHidden: false });
        const mode = makeMode("darwin", { launchAtLogin: true });
        start(mode);
        expect(mode.view().settings.launchAtLogin).toBe(shown);
        expect(mockApp.setLoginItemSettings).not.toHaveBeenCalled();
    });

    it("Windows: reading the stored settings throws -> the app still starts, with its window", () => {
        const mode = makeMode("win32", { launchAtLogin: true });
        const get = jest.spyOn(AppSettingsStorage, "Get").mockImplementation(() => { throw new Error("config.json"); });
        const log = jest.spyOn(console, "log").mockImplementation(() => {});
        try {
            const { startHidden, win } = start(mode);
            expect(startHidden).toBe(false);
            expect(win.isVisible()).toBe(true);
            expect(mockApp.setLoginItemSettings).not.toHaveBeenCalled();
        } finally {
            get.mockRestore();
            log.mockRestore();
        }
    });

    it("Windows: reading the login items throws -> window shown, the stored value is shown, nothing written", () => {
        mockApp.getLoginItemSettings.mockImplementationOnce(() => { throw new Error("registry"); });
        const log = jest.spyOn(console, "log").mockImplementation(() => {});
        const mode = makeMode("win32", { launchAtLogin: true });
        const { startHidden, win } = start(mode);
        expect(startHidden).toBe(false);
        expect(win.isVisible()).toBe(true);
        expect(mode.view().settings.launchAtLogin).toBe(true);
        expect(mockApp.setLoginItemSettings).not.toHaveBeenCalled();
        log.mockRestore();
    });
});

describe("Squirrel.Windows maintenance launches", () => {
    it.each(["--squirrel-install", "--squirrel-updated", "--squirrel-obsolete"])(
        "%s: no tray icon, close is not intercepted, no login-item writes", (flag) => {
            const mode = makeMode("win32", { closeToTray: true, ...MINIMIZED_AT_LOGIN }, ["trademanager.exe", flag, "1.0.6"]);
            const { win, startHidden } = start(mode, ["trademanager.exe", flag, "1.0.6", "--hidden"]);
            expect(startHidden).toBe(false);
            expect(mode.tray.ready).toBe(false);
            expect(mockApp.getLoginItemSettings).not.toHaveBeenCalled();
            mode.update(patch("launchAtLogin", false));
            mode.update(patch("closeToTray", true));
            expect(mockApp.setLoginItemSettings).not.toHaveBeenCalled();
            expect(mode.tray.ready).toBe(false);
            win.close();
            expect(win.isDestroyed()).toBe(true);
        });

    it("--squirrel-firstrun is the ordinary first start: background mode works", () => {
        const mode = makeMode("win32", { closeToTray: true }, ["trademanager.exe", "--squirrel-firstrun"]);
        const { win } = start(mode, ["trademanager.exe", "--squirrel-firstrun"]);
        expect(mode.tray.ready).toBe(true);
        win.close();
        expect(win.isDestroyed()).toBe(false);
    });

    it("uninstall: our login item is removed by its fixed name", () => {
        new BackgroundMode("win32").removeLoginItemForUninstall();
        expect(mockApp.setLoginItemSettings).toHaveBeenCalledTimes(1);
        expect(mockApp.setLoginItemSettings).toHaveBeenCalledWith({ openAtLogin: false, path: process.execPath, args: [], name: LOGIN_ITEM_NAME });
    });

    it("uninstall: a refusal is logged, not thrown (the app still quits)", () => {
        mockApp.setLoginItemSettings.mockImplementationOnce(() => { throw new Error("denied"); });
        const log = jest.spyOn(console, "log").mockImplementation(() => {});
        expect(() => new BackgroundMode("win32").removeLoginItemForUninstall()).not.toThrow();
        log.mockRestore();
    });
});
