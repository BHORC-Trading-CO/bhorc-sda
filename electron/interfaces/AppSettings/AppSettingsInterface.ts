/**
 * Application settings from the Settings page (SDA-35, SDA-36), config.json key "appSettings".
 * Installs without the key read as all false: closing the window quits as before, no login item.
 */
export default interface AppSettingsInterface {
    /** Closing the main window hides it to the tray instead of quitting. */
    closeToTray: boolean;
    /** Start SDA when the user signs in to the computer (Windows and macOS only). */
    launchAtLogin: boolean;
    /** With launchAtLogin: start without showing the main window; it opens from the tray. */
    startMinimized: boolean;
}

/**
 * Whether this run can register a login item:
 * - supported: packaged app on Windows or macOS;
 * - unsupportedPlatform: Linux, where Electron has no login-item API;
 * - notPackaged: development run (npm start), where the executable is the bare Electron binary;
 * - translocated: macOS runs the app from a temporary App Translocation path (opened from
 *   Downloads without moving it to Applications), which a login item cannot point at.
 */
export type LoginItemSupport = "supported" | "unsupportedPlatform" | "notPackaged" | "translocated";

/** What the Settings page shows. */
export interface AppSettingsView {
    settings: AppSettingsInterface;
    loginItem: LoginItemSupport;
    /**
     * Close-to-tray is on, but the tray icon could not be created (Windows/Linux): closing the
     * window quits, because a hidden window would be out of reach. macOS keeps the Dock icon,
     * so there the window still hides.
     */
    trayUnavailable: boolean;
}

/** A rejected save; message is already translated in main. */
export interface AppSettingsError {
    message: string;
}
