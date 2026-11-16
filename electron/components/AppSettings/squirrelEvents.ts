// Squirrel.Windows maintenance hooks (maker-squirrel in forge.config.js). Squirrel runs the app
// with one of these switches during install, update and uninstall and expects it to exit quickly.
// The app has never handled them; for SDA-36 only --squirrel-uninstall is handled (it removes the
// login item this feature adds). In the other maintenance launches the background mode stays off:
// no tray icon, no close interception, no login-item writes.
//
// --squirrel-firstrun is deliberately not here: it is the ordinary first start after an install,
// the one the user sees and where they may turn launch at login on.

export type SquirrelMaintenanceEvent = "install" | "updated" | "uninstall" | "obsolete";

const EVENTS: SquirrelMaintenanceEvent[] = ["install", "updated", "uninstall", "obsolete"];

/** The Squirrel maintenance event this launch was started for, or null (always null outside Windows). */
export function squirrelMaintenanceEvent(platform: NodeJS.Platform, argv: readonly string[]): SquirrelMaintenanceEvent | null {
    if (platform !== "win32") return null;
    for (const event of EVENTS) {
        const flag = `--squirrel-${event}`;
        if (argv.some((arg) => arg === flag || arg.startsWith(`${flag}=`))) return event;
    }
    return null;
}
