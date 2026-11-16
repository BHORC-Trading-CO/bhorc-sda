import { HIDDEN_ARG, isOurLoginItemEnabled, LOGIN_ITEM_NAME, loginItemQueries, loginItemSettings, loginItemSupport, readLoginItemOn, squirrelUpdateExe } from "../loginItem";

// Launch at login (SDA-36): the object passed to app.setLoginItemSettings per platform, built from
// the platform, process.execPath and the settings. Windows paths are handled with path.win32, so
// these cases run the same on any OS.

const SQUIRREL_ROOT = "C:\\Users\\Lead\\AppData\\Local\\ElectronStarter";
const SQUIRREL_EXE = `${SQUIRREL_ROOT}\\app-1.0.5\\trademanager.exe`;
const UPDATE_EXE = `${SQUIRREL_ROOT}\\Update.exe`;
// A tester's unpacked CI artifact: the folder name has spaces, there is no Update.exe.
const FOLDER_EXE = "C:\\Users\\Tester\\Downloads\\BHORC SDA-win32-x64\\trademanager.exe";
const MAC_EXE = "/Applications/BHORC SDA.app/Contents/MacOS/bhorc-sda";
// Opened from Downloads without moving: Gatekeeper runs it from a random read-only copy.
const TRANSLOCATED_EXE = "/private/var/folders/xy/abc/T/AppTranslocation/1F2E3D4C/d/BHORC SDA.app/Contents/MacOS/bhorc-sda";

const only = (...files: string[]) => (file: string) => files.includes(file);
const on = (startMinimized: boolean) => ({ launchAtLogin: true, startMinimized });
const off = (startMinimized: boolean) => ({ launchAtLogin: false, startMinimized });

describe("where a login item can be registered", () => {
    it.each([
        ["win32", true, "supported"],
        ["darwin", true, "supported"],
        ["win32", false, "notPackaged"],
        ["darwin", false, "notPackaged"],
        ["linux", true, "unsupportedPlatform"],
        ["linux", false, "unsupportedPlatform"],
        ["freebsd", true, "unsupportedPlatform"],
    ] as const)("%s, packaged=%s -> %s", (platform, packaged, expected) => {
        expect(loginItemSupport(platform, packaged)).toBe(expected);
    });

    it("macOS App Translocation: the temporary path cannot be a login item", () => {
        expect(loginItemSupport("darwin", true, TRANSLOCATED_EXE)).toBe("translocated");
        expect(loginItemSupport("darwin", true, MAC_EXE)).toBe("supported");
        expect(loginItemSupport("win32", true, FOLDER_EXE)).toBe("supported");
    });
});

describe("Squirrel install detection", () => {
    it("app-x.y.z folder with Update.exe one level up -> Update.exe", () => {
        const exists = jest.fn(only(UPDATE_EXE));
        expect(squirrelUpdateExe(SQUIRREL_EXE, exists)).toBe(UPDATE_EXE);
        expect(exists).toHaveBeenCalledWith(UPDATE_EXE);
    });

    it("app-x.y.z folder without Update.exe (copied out of an install) -> not Squirrel", () => {
        expect(squirrelUpdateExe(SQUIRREL_EXE, only())).toBeNull();
    });

    it("plain packaged folder: not app-x.y.z, Update.exe is not even looked for", () => {
        const exists = jest.fn(() => true);
        expect(squirrelUpdateExe(FOLDER_EXE, exists)).toBeNull();
        expect(exists).not.toHaveBeenCalled();
    });
});

describe("app.setLoginItemSettings argument", () => {
    describe("Windows, Squirrel install: the stable Update.exe, not the versioned app-x.y.z exe", () => {
        it("on, window shown", () => {
            expect(loginItemSettings("win32", SQUIRREL_EXE, on(false), only(UPDATE_EXE))).toEqual({
                openAtLogin: true,
                path: UPDATE_EXE,
                args: ["--processStart", '"trademanager.exe"'],
                name: LOGIN_ITEM_NAME,
            });
        });

        it("on, start minimized: --hidden reaches the app through --process-start-args", () => {
            expect(loginItemSettings("win32", SQUIRREL_EXE, on(true), only(UPDATE_EXE))).toEqual({
                openAtLogin: true,
                path: UPDATE_EXE,
                args: ["--processStart", '"trademanager.exe"', "--process-start-args", `"${HIDDEN_ARG}"`],
                name: LOGIN_ITEM_NAME,
            });
        });

        it("off: same path and args without --hidden, so Electron removes the same entry", () => {
            expect(loginItemSettings("win32", SQUIRREL_EXE, off(true), only(UPDATE_EXE))).toEqual({
                openAtLogin: false,
                path: UPDATE_EXE,
                args: ["--processStart", '"trademanager.exe"'],
                name: LOGIN_ITEM_NAME,
            });
        });
    });

    describe("Windows, plain packaged folder (CI artifact): the exe itself", () => {
        it("on, window shown", () => {
            expect(loginItemSettings("win32", FOLDER_EXE, on(false), only())).toEqual({ openAtLogin: true, path: FOLDER_EXE, args: [], name: LOGIN_ITEM_NAME });
        });

        it("on, start minimized", () => {
            expect(loginItemSettings("win32", FOLDER_EXE, on(true), only())).toEqual({ openAtLogin: true, path: FOLDER_EXE, args: ["--hidden"], name: LOGIN_ITEM_NAME });
        });

        it("off", () => {
            expect(loginItemSettings("win32", FOLDER_EXE, off(false), only())).toEqual({ openAtLogin: false, path: FOLDER_EXE, args: [], name: LOGIN_ITEM_NAME });
        });

        it("an app-x.y.z folder without Update.exe also points at the exe", () => {
            expect(loginItemSettings("win32", SQUIRREL_EXE, on(true), only())).toEqual({ openAtLogin: true, path: SQUIRREL_EXE, args: ["--hidden"], name: LOGIN_ITEM_NAME });
        });
    });

    describe("macOS: openAtLogin + openAsHidden, no path or args (Windows-only in Electron 17)", () => {
        it.each([
            [on(false), { openAtLogin: true, openAsHidden: false }],
            [on(true), { openAtLogin: true, openAsHidden: true }],
            [off(true), { openAtLogin: false, openAsHidden: false }],
        ])("%j -> %j", (settings, expected) => {
            const exists = jest.fn(() => true);
            expect(loginItemSettings("darwin", MAC_EXE, settings, exists)).toEqual(expected);
            expect(exists).not.toHaveBeenCalled();
        });
    });

    it("Linux has no login-item API: null, nothing to pass", () => {
        expect(loginItemSettings("linux", "/opt/BHORC SDA/bhorc-sda", on(true), () => true)).toBeNull();
    });
});

describe("app.getLoginItemSettings queries", () => {
    it("Windows, path without spaces: one query with the registration's path and args", () => {
        const settings = loginItemSettings("win32", SQUIRREL_EXE, on(true), only(UPDATE_EXE));
        expect(loginItemQueries(settings)).toEqual([{ path: UPDATE_EXE, args: settings!.args }]);
    });

    it("Windows, path with a space (plain folder \"BHORC SDA-win32-x64\"): also the quoted form", () => {
        const settings = loginItemSettings("win32", FOLDER_EXE, on(false), only());
        expect(loginItemQueries(settings)).toEqual([
            { path: FOLDER_EXE, args: [] },
            { path: `"${FOLDER_EXE}"`, args: [] },
        ]);
    });

    it("macOS and Linux: nothing to ask", () => {
        expect(loginItemQueries(loginItemSettings("darwin", MAC_EXE, on(true)))).toEqual([]);
        expect(loginItemQueries(null)).toEqual([]);
    });
});

describe("does the system start SDA at login (read-only, for the switch)", () => {
    const settings = loginItemSettings("win32", FOLDER_EXE, on(false), only());
    // As Electron 17 reports it: program path unquoted, args parsed (quotes and switches gone).
    const item = (over: object = {}) => ({ name: LOGIN_ITEM_NAME, path: FOLDER_EXE, args: [], scope: "user", enabled: true, ...over });

    it("our name, this program, current user, enabled -> on (args are not compared)", () => {
        expect(isOurLoginItemEnabled({ launchItems: [item()] }, settings)).toBe(true);
        expect(isOurLoginItemEnabled({ launchItems: [item({ path: FOLDER_EXE.toUpperCase() })] }, settings)).toBe(true);
    });

    it.each([
        ["no entries", []],
        ["disabled in Task Manager", [{ enabled: false }]],
        ["another app's entry", [{ name: "SomethingElse" }]],
        ["the entry of another copy (moved folder / installed vs plain folder)", [{ path: "C:\\Other\\trademanager.exe" }]],
        ["machine-wide entry", [{ scope: "machine" }]],
    ])("%s -> off", (_name, overrides) => {
        expect(isOurLoginItemEnabled({ launchItems: (overrides as object[]).map((over) => item(over)) }, settings)).toBe(false);
    });

    it("missing state or settings -> off", () => {
        expect(isOurLoginItemEnabled(null, settings)).toBe(false);
        expect(isOurLoginItemEnabled({ launchItems: undefined as any }, settings)).toBe(false);
        expect(isOurLoginItemEnabled({ launchItems: [item()] }, null)).toBe(false);
    });

    // Electron may read the query path as a command line (an unquoted path is cut at its first
    // space) or verbatim; the entry of a folder with a space is found either way.
    const parsing = (query?: { path?: string }) => {
        const program = query!.path!.startsWith('"') ? query!.path!.slice(1, -1) : query!.path!.split(" ")[0];
        return { openAtLogin: false, launchItems: program.toLowerCase() === FOLDER_EXE.toLowerCase() ? [item()] : [] };
    };
    const verbatim = (query?: { path?: string }) => ({ openAtLogin: false, launchItems: query!.path === FOLDER_EXE ? [item()] : [] });

    it.each([["parsing", parsing], ["verbatim", verbatim]] as const)("Windows, %s: found for a path with a space", (_name, read) => {
        expect(readLoginItemOn("win32", read, settings)).toBe(true);
    });

    it("Windows: an entry for another folder is not ours", () => {
        const moved = loginItemSettings("win32", "C:\\Moved here\\trademanager.exe", on(false), only());
        expect(readLoginItemOn("win32", parsing, moved)).toBe(false);
        expect(readLoginItemOn("win32", verbatim, moved)).toBe(false);
    });

    it("macOS: openAtLogin, asked without options", () => {
        const read = jest.fn(() => ({ openAtLogin: true, launchItems: [] }));
        expect(readLoginItemOn("darwin", read, loginItemSettings("darwin", MAC_EXE, on(false)))).toBe(true);
        expect(read).toHaveBeenCalledWith();
        expect(readLoginItemOn("darwin", () => ({ openAtLogin: false, launchItems: [] }), null)).toBe(false);
    });

    it("Linux: off, nothing is asked", () => {
        const read = jest.fn();
        expect(readLoginItemOn("linux", read, null)).toBe(false);
        expect(read).not.toHaveBeenCalled();
    });
});
