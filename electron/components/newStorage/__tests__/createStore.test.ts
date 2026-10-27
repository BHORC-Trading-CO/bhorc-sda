import fs from "fs";
import os from "os";
import path from "path";

const mockStoreOptions: unknown[] = [];
jest.mock("electron-store", () =>
    jest.fn().mockImplementation((opts) => {
        mockStoreOptions.push(opts);
        return { path: "/nonexistent/config.json" };
    })
);

import createStore, { CONFIG_FILE_MODE, restrictSecretFiles } from "../createStore";

const posixOnly = process.platform === "win32" ? it.skip : it;
const mode = (p: string) => fs.statSync(p).mode & 0o777;

describe("createStore", () => {
    it("создаёт хранилище с правами 0o600 на config.json", () => {
        createStore();
        expect(CONFIG_FILE_MODE).toBe(0o600);
        expect(mockStoreOptions).toContainEqual({ configFileMode: 0o600 });
    });

    posixOnly("настоящий conf с этим режимом пишет файл 0o600 (и 0o666 без него)", () => {
        const Conf = jest.requireActual("conf");
        const ConfClass = Conf.default || Conf;
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sda-conf-"));
        const secure = new ConfClass({ cwd: path.join(dir, "a"), projectName: "t", configFileMode: CONFIG_FILE_MODE });
        secure.set("k", 1);
        expect(mode(secure.path)).toBe(0o600);
        const insecure = new ConfClass({ cwd: path.join(dir, "b"), projectName: "t" });
        insecure.set("k", 1);
        expect(mode(insecure.path)).toBe(0o666);
    });

    posixOnly("restrictSecretFiles чинит права старой установки и убирает tmp-копии", () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sda-store-"));
        const config = path.join(dir, "config.json");
        fs.writeFileSync(config, "{}");
        fs.chmodSync(config, 0o666);
        const tmp = path.join(dir, "config.json.tmp-1234567890abcdef");
        fs.writeFileSync(tmp, "{\"password\":\"x\"}");
        const pending = path.join(dir, "pending_authenticators");
        fs.mkdirSync(pending, { mode: 0o755 });
        fs.chmodSync(pending, 0o755);
        const backup = path.join(pending, "acc-1.json");
        fs.writeFileSync(backup, "{}");
        fs.chmodSync(backup, 0o644);

        restrictSecretFiles({ path: config });

        expect(mode(config)).toBe(0o600);
        expect(fs.existsSync(tmp)).toBe(false);
        expect(mode(pending)).toBe(0o700);
        expect(mode(backup)).toBe(0o600);
    });

    it("restrictSecretFiles не падает, если ничего ещё нет", () => {
        expect(() => restrictSecretFiles({ path: "/nonexistent/config.json" })).not.toThrow();
    });

    it("electron-store нигде не создают в обход createStore", () => {
        const roots = [path.join(__dirname, "../../.."), path.join(__dirname, "../../../../src")];
        const offenders: string[] = [];
        const walk = (dir: string) => {
            for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
                const full = path.join(dir, entry.name);
                if (entry.isDirectory()) {
                    if (entry.name !== "__tests__") walk(full);
                } else if (/\.tsx?$/.test(entry.name) && !full.endsWith(path.join("newStorage", "createStore.ts"))) {
                    if (/["']electron-store["']/.test(fs.readFileSync(full, "utf8"))) offenders.push(full);
                }
            }
        };
        roots.forEach(walk);
        expect(offenders).toEqual([]);
    });
});
