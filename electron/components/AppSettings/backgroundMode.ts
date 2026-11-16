import { app, BrowserWindow } from "electron";
import AppSettingsInterface, { AppSettingsView, LoginItemSupport } from "../../interfaces/AppSettings/AppSettingsInterface";
import AppSettingsStorage from "../newStorage/AppSettingsStorage";
import { parseAppSettingsUpdate } from "./appSettings";
import { loginItemQuery, loginItemSettings, loginItemSupport } from "./loginItem";
import { hiddenStartRequested, mainWindowCloseAction, revealWindow, startHidden, wantsTray } from "./background";
import AppTray from "./appTray";
import { t } from "../../i18n";

export type AppSettingsUpdate = { ok: true } | { ok: false; message: string };

/**
 * Background mode (SDA-35, SDA-36): the tray icon, close-to-tray for the main window, a start
 * without the main window, and the system login item. The main process keeps running while the
 * window is hidden, so accounts, timers and confirmations go on as with an open window.
 *
 * Other windows (confirmations, family PIN / code requests, errors) are separate top-level windows:
 * hiding the main window leaves them open and working, and a login that needs a code still opens
 * its request window while the main window is hidden.
 */
export class BackgroundMode {
    private quitting = false;
    private startedHidden = false;
    private settings: AppSettingsInterface | null = null;
    private mainWindow: BrowserWindow | null = null;
    readonly tray: AppTray;

    constructor(private readonly platform: NodeJS.Platform = process.platform) {
        this.tray = new AppTray(() => this.revealMainWindow(), () => app.quit(), platform);
    }

    getSettings(): AppSettingsInterface {
        if (!this.settings) this.settings = AppSettingsStorage.Get();
        return this.settings;
    }

    get isQuitting(): boolean {
        return this.quitting;
    }

    loginItemSupport(): LoginItemSupport {
        return loginItemSupport(this.platform, app.isPackaged);
    }

    /**
     * App-level hooks, once, before 'ready'. before-quit comes first for every real quit (tray
     * Quit, Cmd+Q, app menu Quit, app.quit()): from then on the main window closes for real.
     * macOS: a click on the Dock icon ('activate') brings a hidden main window back.
     */
    install() {
        app.on("before-quit", () => {
            this.quitting = true;
        });
        app.on("activate", () => {
            this.revealMainWindow();
        });
    }

    /**
     * After 'ready' and the language, before the main window exists: creates the tray icon if it
     * is wanted and decides whether the main window starts hidden. If the tray icon cannot be
     * created, the window is shown.
     */
    prepareStartup(argv: readonly string[]): { startHidden: boolean } {
        try {
            const settings = this.getSettings();
            const login = this.platform === "darwin" && this.loginItemSupport() === "supported" ? this.readLoginItem() : null;
            const requested = hiddenStartRequested({ argv, platform: this.platform, login, settings });
            if (wantsTray(settings, requested)) this.tray.create();
            this.startedHidden = startHidden(requested, this.tray.ready);
        } catch (err) {
            // Whatever went wrong here, the app starts with its window.
            console.log(`Background mode was not prepared: ${err}`);
            this.startedHidden = false;
        }
        this.resyncLoginItem();
        return { startHidden: this.startedHidden };
    }

    attachMainWindow(win: BrowserWindow) {
        this.mainWindow = win;
        win.on("close", (event) => {
            const action = mainWindowCloseAction({
                closeToTray: this.getSettings().closeToTray,
                isQuitting: this.quitting,
                trayReady: this.tray.ready,
                platform: this.platform,
            });
            if (action !== "hide") return;
            event.preventDefault();
            win.hide();
        });
        // Windows shutdown, restart or sign-out: Electron does not emit before-quit then, and a
        // window that only hides must not hold up the end of the session.
        win.on("session-end", () => {
            this.quitting = true;
        });
        // No window left to show: the tray goes too (on Windows/Linux the app is quitting anyway,
        // and on macOS a "Show window" item would do nothing).
        win.on("closed", () => {
            if (this.mainWindow === win) this.mainWindow = null;
            this.tray.destroy();
        });
    }

    revealMainWindow(): boolean {
        return revealWindow(this.mainWindow, this.platform, app);
    }

    view(): AppSettingsView {
        const settings = this.getSettings();
        return {
            settings: { ...settings },
            loginItem: this.loginItemSupport(),
            trayUnavailable: settings.closeToTray && this.tray.failed && this.platform !== "darwin",
        };
    }

    /**
     * Save from the Settings page. The login item is changed first; if the system refuses, the
     * startup fields keep their saved values and the page gets the reason. Where the login item
     * is unsupported (Linux, development run), the startup fields cannot change: whatever the page
     * sends, they keep the stored values (off on Linux; a development run sharing config.json with
     * an installed copy does not switch that copy's setting off).
     */
    update(incoming: unknown): AppSettingsUpdate {
        const parsed = parseAppSettingsUpdate(incoming);
        if (!parsed) return { ok: false, message: t("errors.appSettings.invalid") };
        const previous = this.getSettings();
        const support = this.loginItemSupport();
        let next: AppSettingsInterface = support === "supported"
            ? parsed
            : { ...parsed, launchAtLogin: previous.launchAtLogin, startMinimized: previous.startMinimized };
        let result: AppSettingsUpdate = { ok: true };
        const loginItemChanged = next.launchAtLogin !== previous.launchAtLogin
            || (next.launchAtLogin && next.startMinimized !== previous.startMinimized);
        if (support === "supported" && loginItemChanged) {
            try {
                const settings = loginItemSettings(this.platform, process.execPath, next);
                if (settings) app.setLoginItemSettings(settings);
            } catch (err) {
                next = { ...next, launchAtLogin: previous.launchAtLogin, startMinimized: previous.startMinimized };
                result = { ok: false, message: t("errors.appSettings.loginItem", { error: err instanceof Error ? err.message : String(err) }) };
            }
        }
        AppSettingsStorage.Save(next);
        this.settings = next;
        this.syncTray();
        return result;
    }

    /** Tray icon on or off after a settings change. */
    private syncTray() {
        if (wantsTray(this.getSettings(), this.startedHidden)) this.tray.create();
        else this.tray.destroy();
    }

    private readLoginItem() {
        try {
            return app.getLoginItemSettings();
        } catch (err) {
            console.log(`Login item state was not read: ${err}`);
            return null;
        }
    }

    /**
     * Windows only: the setting is on, but the Run entry does not start this copy (a plain folder
     * that was moved, or a newer CI build unpacked elsewhere). Re-register it for this copy.
     * Nothing is written while the entry matches, so "Disabled" in Task Manager stays disabled.
     * macOS keeps its login item by itself, and a user who removed it in System Settings meant it.
     */
    private resyncLoginItem() {
        if (this.platform !== "win32" || !this.getSettings().launchAtLogin || this.loginItemSupport() !== "supported") return;
        try {
            const settings = loginItemSettings(this.platform, process.execPath, this.getSettings());
            if (settings && !app.getLoginItemSettings(loginItemQuery(settings)).openAtLogin) app.setLoginItemSettings(settings);
        } catch (err) {
            console.log(`Login item was not re-registered: ${err}`);
        }
    }
}

export default new BackgroundMode();
