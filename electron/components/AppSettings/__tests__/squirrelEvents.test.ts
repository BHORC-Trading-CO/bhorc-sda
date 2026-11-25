import fs from "fs";
import path from "path";
import { squirrelMaintenanceEvent } from "../squirrelEvents";

// Squirrel.Windows maintenance launches (review round 1, finding 3).

describe("is this a Squirrel maintenance launch", () => {
    const exe = "C:\\Users\\Lead\\AppData\\Local\\ElectronStarter\\app-1.0.6\\trademanager.exe";

    it.each([
        ["--squirrel-install", "install"],
        ["--squirrel-updated", "updated"],
        ["--squirrel-uninstall", "uninstall"],
        ["--squirrel-obsolete", "obsolete"],
    ] as const)("%s -> %s (Squirrel passes the version after it)", (flag, event) => {
        expect(squirrelMaintenanceEvent("win32", [exe, flag, "1.0.6"])).toBe(event);
        expect(squirrelMaintenanceEvent("win32", [exe, `${flag}=1.0.6`])).toBe(event);
    });

    it("an ordinary launch, the first run after install, or --hidden -> null", () => {
        expect(squirrelMaintenanceEvent("win32", [exe])).toBeNull();
        expect(squirrelMaintenanceEvent("win32", [exe, "--squirrel-firstrun"])).toBeNull();
        expect(squirrelMaintenanceEvent("win32", [exe, "--hidden"])).toBeNull();
        expect(squirrelMaintenanceEvent("win32", [exe, "--squirrel-uninstaller"])).toBeNull();
    });

    it.each(["darwin", "linux"] as const)("%s: never (Squirrel is Windows only)", (platform) => {
        expect(squirrelMaintenanceEvent(platform, ["sda", "--squirrel-uninstall"])).toBeNull();
    });
});

describe("startup order", () => {
    // The uninstall launch must clean up and quit before the single-instance lock (a running copy
    // would make it quit without cleanup and pop that copy's window) and before 'ready' (windows).
    it("uninstall is handled first in firstStage, before the lock, the hooks and the windows", () => {
        const source = fs.readFileSync(path.join(__dirname, "../../application/application.ts"), "utf8");
        const stage = source.slice(source.indexOf("firstStage("));
        const uninstallAt = stage.indexOf('squirrelMaintenanceEvent(process.platform, process.argv) === "uninstall"');
        const cleanupAt = stage.indexOf("backgroundMode.removeLoginItemForUninstall();");
        const lockAt = stage.indexOf("ensureSingleInstance(");
        const installAt = stage.indexOf("backgroundMode.install(process.argv");
        const readyAt = stage.indexOf('app.on("ready"');
        expect(uninstallAt).toBeGreaterThan(-1);
        expect(cleanupAt).toBeGreaterThan(uninstallAt);
        expect(stage.slice(cleanupAt, lockAt)).toMatch(/app\.quit\(\);\s*return;/);
        expect(lockAt).toBeGreaterThan(cleanupAt);
        expect(installAt).toBeGreaterThan(lockAt);
        expect(readyAt).toBeGreaterThan(installAt);
    });
});
