import AppSettingsInterface from "../../interfaces/AppSettings/AppSettingsInterface";

// Settings page (SDA-35 tray, SDA-36 launch at login). Everything defaults to off, so an
// existing install keeps its behaviour until the user turns something on.

export const DEFAULT_APP_SETTINGS: AppSettingsInterface = {
    closeToTray: false,
    launchAtLogin: false,
    startMinimized: false,
};

const KEYS = Object.keys(DEFAULT_APP_SETTINGS) as (keyof AppSettingsInterface)[];

/** Stored value as found in config.json (missing, partial or garbage): anything but true is off. */
export function sanitizeAppSettings(raw: unknown): AppSettingsInterface {
    const value = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
    const settings = { ...DEFAULT_APP_SETTINGS };
    for (const key of KEYS) settings[key] = value[key] === true;
    return settings;
}

/**
 * Settings sent by the renderer. Every field must be present and boolean: a malformed save is
 * rejected as a whole instead of silently flipping something off. null = rejected.
 */
export function parseAppSettingsUpdate(incoming: unknown): AppSettingsInterface | null {
    if (!incoming || typeof incoming !== "object" || Array.isArray(incoming)) return null;
    const value = incoming as Record<string, unknown>;
    const settings = { ...DEFAULT_APP_SETTINGS };
    for (const key of KEYS) {
        if (typeof value[key] !== "boolean") return null;
        settings[key] = value[key] as boolean;
    }
    return settings;
}
