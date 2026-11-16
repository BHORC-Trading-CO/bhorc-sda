import { HIDDEN_ARG, loginItemQuery, loginItemSettings, loginItemSupport, squirrelUpdateExe } from "../loginItem";

// Launch at login (SDA-36): the object passed to app.setLoginItemSettings per platform, built from
// the platform, process.execPath and the settings. Windows paths are handled with path.win32, so
// these cases run the same on any OS.

const SQUIRREL_ROOT = "C:\\Users\\Lead\\AppData\\Local\\ElectronStarter";
const SQUIRREL_EXE = `${SQUIRREL_ROOT}\\app-1.0.5\\trademanager.exe`;
const UPDATE_EXE = `${SQUIRREL_ROOT}\\Update.exe`;
// A tester's unpacked CI artifact: the folder name has spaces, there is no Update.exe.
const FOLDER_EXE = "C:\\Users\\Tester\\Downloads\\BHORC SDA-win32-x64\\trademanager.exe";
const MAC_EXE = "/Applications/BHORC SDA.app/Contents/MacOS/bhorc-sda";

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
            });
        });

        it("on, start minimized: --hidden reaches the app through --process-start-args", () => {
            expect(loginItemSettings("win32", SQUIRREL_EXE, on(true), only(UPDATE_EXE))).toEqual({
                openAtLogin: true,
                path: UPDATE_EXE,
                args: ["--processStart", '"trademanager.exe"', "--process-start-args", `"${HIDDEN_ARG}"`],
            });
        });

        it("off: same path and args without --hidden, so Electron removes the same entry", () => {
            expect(loginItemSettings("win32", SQUIRREL_EXE, off(true), only(UPDATE_EXE))).toEqual({
                openAtLogin: false,
                path: UPDATE_EXE,
                args: ["--processStart", '"trademanager.exe"'],
            });
        });
    });

    describe("Windows, plain packaged folder (CI artifact): the exe itself", () => {
        it("on, window shown", () => {
            expect(loginItemSettings("win32", FOLDER_EXE, on(false), only())).toEqual({ openAtLogin: true, path: FOLDER_EXE, args: [] });
        });

        it("on, start minimized", () => {
            expect(loginItemSettings("win32", FOLDER_EXE, on(true), only())).toEqual({ openAtLogin: true, path: FOLDER_EXE, args: ["--hidden"] });
        });

        it("off", () => {
            expect(loginItemSettings("win32", FOLDER_EXE, off(false), only())).toEqual({ openAtLogin: false, path: FOLDER_EXE, args: [] });
        });

        it("an app-x.y.z folder without Update.exe also points at the exe", () => {
            expect(loginItemSettings("win32", SQUIRREL_EXE, on(true), only())).toEqual({ openAtLogin: true, path: SQUIRREL_EXE, args: ["--hidden"] });
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

describe("app.getLoginItemSettings query", () => {
    it("Windows: the same path and args as the registration, or openAtLogin cannot match", () => {
        const settings = loginItemSettings("win32", SQUIRREL_EXE, on(true), only(UPDATE_EXE));
        expect(loginItemQuery(settings)).toEqual({ path: UPDATE_EXE, args: settings!.args });
    });

    it("macOS and Linux: no options", () => {
        expect(loginItemQuery(loginItemSettings("darwin", MAC_EXE, on(true)))).toBeUndefined();
        expect(loginItemQuery(null)).toBeUndefined();
    });
});
