import AppSettingsInterface, { AppSettingsPatch } from "../../interfaces/AppSettings/AppSettingsInterface";

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
 * One switch flipped on the page: { key, value }. The renderer sends only what changed and main
 * merges it into the stored settings in arrival order, so a reply to an earlier save can never
 * carry an old value over a newer one. Anything else is rejected. null = rejected.
 */
export function parseAppSettingsPatch(incoming: unknown): AppSettingsPatch | null {
    if (!incoming || typeof incoming !== "object" || Array.isArray(incoming)) return null;
    const { key, value } = incoming as Record<string, unknown>;
    if (typeof key !== "string" || !(KEYS as string[]).includes(key) || typeof value !== "boolean") return null;
    return { key: key as keyof AppSettingsInterface, value };
}
