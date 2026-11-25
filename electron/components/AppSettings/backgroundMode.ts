import { app, BrowserWindow, LoginItemSettings } from "electron";
import AppSettingsInterface, { AppSettingsView, LoginItemSupport } from "../../interfaces/AppSettings/AppSettingsInterface";
import AppSettingsStorage from "../newStorage/AppSettingsStorage";
import { parseAppSettingsPatch } from "./appSettings";
import { loginItemSettings, loginItemSupport, readLoginItemOn } from "./loginItem";
import { squirrelMaintenanceEvent } from "./squirrelEvents";
import { hiddenStartRequested, mainWindowCloseAction, revealOnSecondLaunch, revealWindow, startHidden, wantsTray } from "./background";
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
 *
 * The system login item is written only when the user flips a switch on the Settings page; at
 * startup it is only read, to show the switch as the system has it.
 */
export class BackgroundMode {
    private quitting = false;
    private startedHidden = false;
    /** Squirrel install/update/obsolete launch: no tray, no close interception, no login-item writes. */
    private maintenance = false;
    private settings: AppSettingsInterface | null = null;
    /** System login item: read at startup and for the Settings page, set by our own writes; null = not read. */
    private loginItemOn: boolean | null = null;
    private mainWindow: BrowserWindow | null = null;
    /** Opens a new main window and attaches it (application.ts); used only after the first one was closed. */
    private openMainWindow: (() => void) | null = null;
    private hadMainWindow = false;
    /** macOS: the window waits for the end of the full-screen exit to hide; a reveal cancels that. */
    private hideAfterFullScreen = false;
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
        return loginItemSupport(this.platform, app.isPackaged, process.execPath);
    }

    /**
     * App-level hooks, once, before 'ready'. before-quit comes first for every real quit (tray
     * Quit, Cmd+Q, app menu Quit, app.quit()): from then on the main window closes for real.
     * macOS: a click on the Dock icon ('activate') brings a hidden or closed main window back.
     */
    install(argv: readonly string[] = process.argv, openMainWindow: (() => void) | null = null) {
        this.openMainWindow = openMainWindow;
        this.maintenance = squirrelMaintenanceEvent(this.platform, argv) !== null;
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
            if (this.maintenance) return { startHidden: false };
            const settings = this.getSettings();
            const login = this.readMacLoginItem();
            this.loginItemOn = this.readLoginItemOn(login);
            const requested = hiddenStartRequested({ argv, platform: this.platform, login, settings });
            if (wantsTray(settings, requested)) this.tray.create();
            this.startedHidden = startHidden(requested, this.tray.ready);
        } catch (err) {
            // Whatever went wrong here, the app starts with its window.
            console.log(`Background mode was not prepared: ${err}`);
            this.startedHidden = false;
        }
        return { startHidden: this.startedHidden };
    }

    attachMainWindow(win: BrowserWindow) {
        this.mainWindow = win;
        this.hadMainWindow = true;
        win.on("close", (event) => {
            if (this.maintenance) return;
            const action = mainWindowCloseAction({
                closeToTray: this.getSettings().closeToTray,
                isQuitting: this.quitting,
                trayReady: this.tray.ready,
                platform: this.platform,
            });
            if (action !== "hide") return;
            event.preventDefault();
            // macOS: a full-screen window hidden as is leaves an empty black Space behind.
            if (this.platform === "darwin" && win.isFullScreen()) {
                this.hideAfterFullScreen = true;
                win.once("leave-full-screen", () => {
                    if (!this.hideAfterFullScreen) return;
                    this.hideAfterFullScreen = false;
                    win.hide();
                });
                win.setFullScreen(false);
            } else {
                win.hide();
            }
        });
        // Windows shutdown, restart or sign-out: Electron does not emit before-quit then. Should a
        // close still arrive after session-end, it must not be turned into a hide.
        win.on("session-end", () => {
            this.quitting = true;
        });
        // No window left to show: the tray goes too. Windows/Linux: closing the main window exits SDA;
        // with other windows open (confirmations, code requests) 'window-all-closed' does not come, and
        // the app would live on with neither a main window nor a tray icon (SDA-64). macOS keeps
        // running in the Dock, as before.
        win.on("closed", () => {
            if (this.mainWindow === win) this.mainWindow = null;
            this.tray.destroy();
            if (this.platform === "darwin" || this.quitting) return;
            if (BrowserWindow.getAllWindows().some((other) => other !== win && !other.isDestroyed())) app.quit();
        });
    }

    /** A tray click, "Show window", a second launch or a Dock click ends with a visible main window. */
    revealMainWindow(): boolean {
        this.hideAfterFullScreen = false;
        // Closed for good while the app lives on (macOS): open it again (SDA-64).
        if (!this.mainWindow && this.hadMainWindow && !this.quitting) this.openMainWindow?.();
        return revealWindow(this.mainWindow, this.platform, app);
    }

    /** Another launch of SDA ('second-instance'): show the window unless that launch asked for --hidden. */
    onSecondLaunch(argv: readonly string[] = []) {
        if (revealOnSecondLaunch(argv)) this.revealMainWindow();
    }

    /**
     * Before the Settings page is served: the entry may have been disabled or removed in the system
     * since startup, and SDA can stay in the tray for weeks (SDA-64). Read-only; a failed read keeps
     * what was known.
     */
    refreshLoginItem() {
        if (this.maintenance) return;
        const on = this.readLoginItemOn(this.readMacLoginItem());
        if (on !== null) this.loginItemOn = on;
    }

    view(): AppSettingsView {
        const settings = this.getSettings();
        const loginItem = this.loginItemSupport();
        return {
            // The system is the truth: stored on, but the entry was removed or disabled -> off.
            settings: { ...settings, launchAtLogin: loginItem === "supported" && settings.launchAtLogin && this.loginItemOn !== false },
            loginItem,
            trayUnavailable: settings.closeToTray && this.tray.failed && this.platform !== "darwin",
        };
    }

    /**
     * --squirrel-uninstall (Windows): remove the login item this feature may have added, before
     * Squirrel deletes the app. Deleted by its fixed name, whichever copy wrote it.
     */
    removeLoginItemForUninstall() {
        try {
            const settings = loginItemSettings(this.platform, process.execPath, { launchAtLogin: false, startMinimized: false });
            if (settings) app.setLoginItemSettings(settings);
        } catch (err) {
            console.log(`Login item was not removed on uninstall: ${err}`);
        }
    }

    /**
     * A switch flipped on the Settings page ({ key, value }), merged into the stored settings in
     * arrival order. The login item is written only here, and only when the user's flip changes
     * what the system does (compared with what the page shows); if the system refuses, nothing
     * is saved and the page gets the reason. Where the login item is unsupported (Linux,
     * development run, translocated macOS app, Squirrel maintenance launch) the startup switches
     * are ignored.
     */
    update(incoming: unknown): AppSettingsUpdate {
        const patch = parseAppSettingsPatch(incoming);
        if (!patch) return { ok: false, message: t("errors.appSettings.invalid") };
        const stored = this.getSettings();
        const next: AppSettingsInterface = { ...stored, [patch.key]: patch.value };
        if (patch.key !== "closeToTray") {
            if (this.loginItemSupport() !== "supported" || this.maintenance) return { ok: true };
            const shownOn = this.view().settings.launchAtLogin;
            const willBeOn = patch.key === "launchAtLogin" ? patch.value : shownOn;
            const changesSystem = willBeOn !== shownOn || (willBeOn && next.startMinimized !== stored.startMinimized);
            if (changesSystem) {
                try {
                    const settings = loginItemSettings(this.platform, process.execPath, { launchAtLogin: willBeOn, startMinimized: next.startMinimized });
                    if (settings) app.setLoginItemSettings(settings);
                    this.loginItemOn = willBeOn;
                } catch (err) {
                    return { ok: false, message: t("errors.appSettings.loginItem", { error: err instanceof Error ? err.message : String(err) }) };
                }
            }
        }
        AppSettingsStorage.Save(next);
        this.settings = next;
        this.syncTray();
        return { ok: true };
    }

    /** Tray icon on or off after a settings change. */
    private syncTray() {
        if (!this.maintenance && wantsTray(this.getSettings(), this.startedHidden)) this.tray.create();
        else this.tray.destroy();
    }

    private readMacLoginItem(): LoginItemSettings | null {
        if (this.platform !== "darwin" || this.loginItemSupport() !== "supported") return null;
        try {
            return app.getLoginItemSettings();
        } catch (err) {
            console.log(`Login item state was not read: ${err}`);
            return null;
        }
    }

    /** Read-only, for the switch; null when it cannot be read (the stored value is shown then). */
    private readLoginItemOn(macLogin: LoginItemSettings | null): boolean | null {
        if (this.loginItemSupport() !== "supported") return null;
        if (this.platform === "darwin") return macLogin ? macLogin.openAtLogin === true : null;
        try {
            const registration = loginItemSettings(this.platform, process.execPath, { launchAtLogin: true, startMinimized: this.getSettings().startMinimized });
            return readLoginItemOn(this.platform, (query) => app.getLoginItemSettings(query), registration);
        } catch (err) {
            console.log(`Login item state was not read: ${err}`);
            return null;
        }
    }
}

export default new BackgroundMode();
