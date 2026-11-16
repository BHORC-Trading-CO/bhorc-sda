import type { App, BrowserWindow, LoginItemSettings } from "electron";
import AppSettingsInterface from "../../interfaces/AppSettings/AppSettingsInterface";
import { HIDDEN_ARG } from "./loginItem";

// Decisions of the background mode (SDA-35, SDA-36), kept free of Electron state so they can be
// tested on their own. backgroundMode.ts wires them to the app, the main window and the tray.

export type MainWindowCloseAction = "hide" | "close";

/**
 * What closing the main window (system close button, Cmd+W, CLOSE_MAIN_WINDOW) does.
 * - A real quit (tray Quit, Cmd+Q, app menu Quit, Windows session end) always closes: the hide
 *   must never hold the app open.
 * - Setting off: close, exactly as before the setting existed.
 * - Windows/Linux without a tray icon: close, otherwise the hidden window would be out of reach.
 *   macOS keeps the Dock icon, which brings the window back (app 'activate').
 */
export function mainWindowCloseAction(input: {
    closeToTray: boolean;
    isQuitting: boolean;
    trayReady: boolean;
    platform: NodeJS.Platform;
}): MainWindowCloseAction {
    if (input.isQuitting || !input.closeToTray) return "close";
    if (!input.trayReady && input.platform !== "darwin") return "close";
    return "hide";
}

/**
 * Whether this launch asks to start without the main window:
 * - --hidden on the command line (the Windows login item, or a manual autostart entry on Linux);
 * - macOS: the system opened the app as a hidden login item (wasOpenedAsHidden, before macOS 13),
 *   or opened it at login while "Start minimized" is on (macOS 13+ ignores openAsHidden and
 *   Electron 17 cannot pass arguments to a macOS login item).
 * The window still opens if the tray icon is missing: see startHidden.
 */
export function hiddenStartRequested(input: {
    argv: readonly string[];
    platform: NodeJS.Platform;
    login: Pick<LoginItemSettings, "wasOpenedAtLogin" | "wasOpenedAsHidden"> | null;
    settings: AppSettingsInterface;
}): boolean {
    if (input.argv.includes(HIDDEN_ARG)) return true;
    if (input.platform !== "darwin" || !input.login) return false;
    if (input.login.wasOpenedAsHidden) return true;
    return input.login.wasOpenedAtLogin && input.settings.launchAtLogin && input.settings.startMinimized;
}

/** Never start hidden without a tray icon: there would be no way to open the window. */
export function startHidden(requested: boolean, trayReady: boolean): boolean {
    return requested && trayReady;
}

/** The tray icon exists while close-to-tray is on, or for a session that started hidden. */
export function wantsTray(settings: AppSettingsInterface, startedHidden: boolean): boolean {
    return settings.closeToTray || startedHidden;
}

type RevealableWindow = Pick<BrowserWindow, "isDestroyed" | "isMinimized" | "restore" | "isVisible" | "show" | "focus">;

/**
 * Bring the main window back (tray click or "Show window", second launch, Dock click on macOS):
 * restore, show if hidden, focus. On macOS the app itself may be hidden (hidden login item) or
 * inactive behind another app, so it is unhidden and activated too. false = no live window.
 */
export function revealWindow(win: RevealableWindow | null | undefined, platform: NodeJS.Platform, app: Pick<App, "show" | "focus">): boolean {
    if (!win || win.isDestroyed()) return false;
    if (win.isMinimized()) win.restore();
    if (!win.isVisible()) win.show();
    if (platform === "darwin") {
        app.show();
        app.focus({ steal: true });
    }
    win.focus();
    return true;
}
