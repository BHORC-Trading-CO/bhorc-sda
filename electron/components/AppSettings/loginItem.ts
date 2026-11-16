import fs from "fs";
import path from "path";
import type { LoginItemSettings, LoginItemSettingsOptions, Settings } from "electron";
import AppSettingsInterface, { LoginItemSupport } from "../../interfaces/AppSettings/AppSettingsInterface";

// Launch at login (SDA-36) with the login-item API of the installed Electron 17:
// app.setLoginItemSettings / app.getLoginItemSettings exist on Windows and macOS only.

/** Command-line switch for a start without the main window (login item, Squirrel, manual autostart). */
export const HIDDEN_ARG = "--hidden";

/**
 * Windows Run value name. Electron's default is the AppUserModelId, which it sets differently for
 * a Squirrel install (com.squirrel.ElectronStarter.trademanager) and a plain folder: with the
 * default, both copies (they share config.json) would each leave their own entry and both start
 * at sign-in. One fixed name means one entry, rewritten by whichever copy registers last.
 */
export const LOGIN_ITEM_NAME = "BHORC SDA";

export function loginItemSupport(platform: NodeJS.Platform, isPackaged: boolean, execPath = ""): LoginItemSupport {
    if (platform !== "win32" && platform !== "darwin") return "unsupportedPlatform";
    // In a development run execPath is the bare Electron binary: at login it would open Electron
    // without SDA (and on macOS there is no way to pass the app folder as an argument).
    if (!isPackaged) return "notPackaged";
    // macOS App Translocation: an app opened from Downloads without moving it runs from a random
    // read-only path that is gone after a restart; a login item would point there.
    if (platform === "darwin" && execPath.includes("/AppTranslocation/")) return "translocated";
    return "supported";
}

/**
 * Squirrel.Windows layout (maker-squirrel in forge.config.js):
 *   %LocalAppData%\ElectronStarter\Update.exe
 *   %LocalAppData%\ElectronStarter\app-1.0.5\trademanager.exe   <- process.execPath
 * The versioned app-x.y.z folder is replaced by every update, so the login item has to start the
 * stable Update.exe. Returns its path, or null when this copy is not a Squirrel install (a plain
 * packaged folder from a CI artifact): no app-* folder or no Update.exe one level up.
 */
export function squirrelUpdateExe(execPath: string, exists: (file: string) => boolean = fs.existsSync): string | null {
    const appDir = path.win32.dirname(execPath);
    if (!/^app-\d/i.test(path.win32.basename(appDir))) return null;
    const updateExe = path.win32.join(path.win32.dirname(appDir), "Update.exe");
    return exists(updateExe) ? updateExe : null;
}

/**
 * The object for app.setLoginItemSettings, or null where there is no login-item API (Linux).
 *
 * - Windows, Squirrel install: Update.exe --processStart "<exe>" [--process-start-args "--hidden"],
 *   as in the setLoginItemSettings doc comment. Electron writes the Run value as "path" + args
 *   joined by spaces without quoting them, hence the quotes inside the arguments.
 * - Windows, plain folder: the exe itself, [--hidden].
 * - macOS: openAtLogin + openAsHidden. Electron 17 has no args on macOS; macOS 13+ ignores
 *   openAsHidden, so the start also checks wasOpenedAtLogin with the stored startMinimized
 *   (background.ts, hiddenStartRequested).
 *
 * Turning it off passes the same path and args: Electron removes the entry by its name.
 */
export function loginItemSettings(
    platform: NodeJS.Platform,
    execPath: string,
    settings: Pick<AppSettingsInterface, "launchAtLogin" | "startMinimized">,
    exists: (file: string) => boolean = fs.existsSync,
): Settings | null {
    const openAtLogin = settings.launchAtLogin;
    const hidden = settings.launchAtLogin && settings.startMinimized;
    if (platform === "darwin") return { openAtLogin, openAsHidden: hidden };
    if (platform !== "win32") return null;
    const updateExe = squirrelUpdateExe(execPath, exists);
    if (updateExe) {
        const exeName = path.win32.basename(execPath);
        const args = ["--processStart", `"${exeName}"`];
        if (hidden) args.push("--process-start-args", `"${HIDDEN_ARG}"`);
        return { openAtLogin, path: updateExe, args, name: LOGIN_ITEM_NAME };
    }
    return { openAtLogin, path: execPath, args: hidden ? [HIDDEN_ARG] : [], name: LOGIN_ITEM_NAME };
}

/**
 * Options for app.getLoginItemSettings that match a registration made with `settings`: on Windows
 * its launchItems list only Run entries whose program is this path.
 */
export function loginItemQuery(settings: Settings | null): LoginItemSettingsOptions | undefined {
    if (!settings || settings.path === undefined) return undefined;
    return { path: settings.path, args: settings.args || [] };
}

/**
 * Windows: is there a Run entry under our name (HKCU) that starts this program? getLoginItemSettings
 * reads openAtLogin by the AppUserModelId name, not by LOGIN_ITEM_NAME, so launchItems is used.
 * Arguments are not compared: Electron returns them parsed (quotes and switches stripped), and
 * they only change through a save from the Settings page, which always rewrites the entry. The
 * enabled flag is ignored on purpose: "Disabled" in Task Manager is the user's choice.
 */
export function isLoginItemRegistered(state: Pick<LoginItemSettings, "launchItems"> | null | undefined, settings: Settings | null): boolean {
    if (!settings || settings.path === undefined) return false;
    const target = settings.path.toLowerCase();
    return (state?.launchItems || []).some((item) =>
        item.name === LOGIN_ITEM_NAME && item.scope === "user" && typeof item.path === "string" && item.path.toLowerCase() === target);
}
