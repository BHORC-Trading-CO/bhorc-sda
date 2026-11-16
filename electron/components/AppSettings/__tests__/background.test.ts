import { hiddenStartRequested, mainWindowCloseAction, revealOnSecondLaunch, revealWindow, startHidden, wantsTray } from "../background";
import { DEFAULT_APP_SETTINGS } from "../appSettings";

// Pure decisions of the background mode (SDA-35, SDA-36).

describe("closing the main window: hide to the tray or close", () => {
    const base = { closeToTray: true, isQuitting: false, trayReady: true };

    it.each(["win32", "darwin", "linux"] as const)("%s: setting on, tray ready -> hide", (platform) => {
        expect(mainWindowCloseAction({ ...base, platform })).toBe("hide");
    });

    it.each(["win32", "darwin", "linux"] as const)("%s: setting off -> close, as before the setting existed", (platform) => {
        expect(mainWindowCloseAction({ ...base, closeToTray: false, platform })).toBe("close");
    });

    it.each(["win32", "darwin", "linux"] as const)("%s: a real quit (before-quit / session end) always closes", (platform) => {
        expect(mainWindowCloseAction({ ...base, isQuitting: true, platform })).toBe("close");
    });

    it.each(["win32", "linux"] as const)("%s: no tray icon -> close, a hidden window would be out of reach", (platform) => {
        expect(mainWindowCloseAction({ ...base, trayReady: false, platform })).toBe("close");
    });

    it("macOS without a tray icon still hides: the Dock icon brings the window back", () => {
        expect(mainWindowCloseAction({ ...base, trayReady: false, platform: "darwin" })).toBe("hide");
    });
});

describe("start without the main window", () => {
    const allOff = { ...DEFAULT_APP_SETTINGS };
    const minimizedAtLogin = { closeToTray: false, launchAtLogin: true, startMinimized: true };
    const login = (wasOpenedAtLogin: boolean, wasOpenedAsHidden: boolean) => ({ wasOpenedAtLogin, wasOpenedAsHidden });

    it.each(["win32", "darwin"] as const)("%s: --hidden with launch at login + start minimized on", (platform) => {
        expect(hiddenStartRequested({ argv: ["sda", "--hidden"], platform, login: null, settings: minimizedAtLogin })).toBe(true);
    });

    it("an ordinary start", () => {
        expect(hiddenStartRequested({ argv: ["trademanager.exe"], platform: "win32", login: null, settings: minimizedAtLogin })).toBe(false);
        expect(hiddenStartRequested({ argv: ["bhorc-sda"], platform: "darwin", login: login(false, false), settings: minimizedAtLogin })).toBe(false);
    });

    it("macOS: the system opened a hidden login item (before macOS 13)", () => {
        expect(hiddenStartRequested({ argv: ["bhorc-sda"], platform: "darwin", login: login(true, true), settings: minimizedAtLogin })).toBe(true);
    });

    it("macOS 13+: opened at login and \"Start minimized\" is on (openAsHidden is ignored there)", () => {
        expect(hiddenStartRequested({ argv: ["bhorc-sda"], platform: "darwin", login: login(true, false), settings: minimizedAtLogin })).toBe(true);
    });

    // Review round 1, finding 5: an existing hidden login item must not hide the window of a user
    // who never turned these settings on.
    it.each([
        ["all off", allOff],
        ["start minimized off", { ...minimizedAtLogin, startMinimized: false }],
        ["launch at login off", { ...minimizedAtLogin, launchAtLogin: false }],
    ])("%s: window shown even if macOS opened SDA as a hidden login item or --hidden is passed", (_name, settings) => {
        expect(hiddenStartRequested({ argv: ["bhorc-sda"], platform: "darwin", login: login(true, true), settings })).toBe(false);
        expect(hiddenStartRequested({ argv: ["bhorc-sda", "--hidden"], platform: "darwin", login: login(true, true), settings })).toBe(false);
        expect(hiddenStartRequested({ argv: ["trademanager.exe", "--hidden"], platform: "win32", login: null, settings })).toBe(false);
    });

    it("Linux never starts hidden: a tray host cannot be detected", () => {
        expect(hiddenStartRequested({ argv: ["bhorc-sda", "--hidden"], platform: "linux", login: null, settings: minimizedAtLogin })).toBe(false);
    });

    it("Windows ignores macOS login flags: only --hidden counts", () => {
        expect(hiddenStartRequested({ argv: ["trademanager.exe"], platform: "win32", login: login(true, true), settings: minimizedAtLogin })).toBe(false);
    });

    it("requested but no tray icon -> the window is shown", () => {
        expect(startHidden(true, true)).toBe(true);
        expect(startHidden(true, false)).toBe(false);
        expect(startHidden(false, true)).toBe(false);
    });
});

describe("when the tray icon exists", () => {
    it("with close-to-tray, or for a session that started hidden", () => {
        expect(wantsTray({ ...DEFAULT_APP_SETTINGS }, false)).toBe(false);
        expect(wantsTray({ ...DEFAULT_APP_SETTINGS, closeToTray: true }, false)).toBe(true);
        expect(wantsTray({ ...DEFAULT_APP_SETTINGS }, true)).toBe(true);
        // Launch at login alone does not put SDA in the tray.
        expect(wantsTray({ closeToTray: false, launchAtLogin: true, startMinimized: true }, false)).toBe(false);
    });
});

describe("another launch while SDA runs", () => {
    it("an ordinary launch brings the window; a --hidden one (login item) does not", () => {
        expect(revealOnSecondLaunch(["C:\\...\\trademanager.exe"])).toBe(true);
        expect(revealOnSecondLaunch([])).toBe(true);
        expect(revealOnSecondLaunch(["C:\\...\\trademanager.exe", "--hidden"])).toBe(false);
    });
});

describe("bringing the main window back", () => {
    function fakeWindow(state: { destroyed?: boolean; minimized?: boolean; visible?: boolean } = {}) {
        const calls: string[] = [];
        const win = {
            isDestroyed: () => !!state.destroyed,
            isMinimized: () => !!state.minimized,
            isVisible: () => state.visible !== false,
            restore: jest.fn(() => calls.push("restore")),
            show: jest.fn(() => calls.push("show")),
            focus: jest.fn(() => calls.push("focus")),
        };
        return { win, calls };
    }
    const fakeApp = () => ({ show: jest.fn(), focus: jest.fn() });

    it("hidden to the tray: shown, then focused", () => {
        const { win, calls } = fakeWindow({ visible: false });
        const app = fakeApp();
        expect(revealWindow(win as any, "win32", app as any)).toBe(true);
        expect(calls).toEqual(["show", "focus"]);
        expect(app.show).not.toHaveBeenCalled();
        expect(app.focus).not.toHaveBeenCalled();
    });

    it("minimized: restored and focused, show is not needed", () => {
        const { win, calls } = fakeWindow({ minimized: true });
        expect(revealWindow(win as any, "win32", fakeApp() as any)).toBe(true);
        expect(calls).toEqual(["restore", "focus"]);
    });

    it("macOS: the app is unhidden and activated as well", () => {
        const { win } = fakeWindow({ visible: false });
        const app = fakeApp();
        revealWindow(win as any, "darwin", app as any);
        expect(app.show).toHaveBeenCalled();
        expect(app.focus).toHaveBeenCalledWith({ steal: true });
        expect(win.show).toHaveBeenCalled();
    });

    it("no window or a destroyed one: nothing to do, no exception", () => {
        const { win, calls } = fakeWindow({ destroyed: true });
        const app = fakeApp();
        expect(revealWindow(win as any, "darwin", app as any)).toBe(false);
        expect(revealWindow(null, "win32", app as any)).toBe(false);
        expect(calls).toEqual([]);
        expect(app.focus).not.toHaveBeenCalled();
    });
});
