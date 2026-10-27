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

import createStore, { CONFIG_FILE_MODE, restrictConfigFileMode } from "../createStore";

const posixOnly = process.platform === "win32" ? it.skip : it;

describe("createStore", () => {
    it("создаёт хранилище с правами 0o600 на config.json", () => {
        createStore();
        expect(CONFIG_FILE_MODE).toBe(0o600);
        expect(mockStoreOptions).toContainEqual({ configFileMode: 0o600 });
    });

    posixOnly("restrictConfigFileMode ужимает права уже существующего файла", () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sda-store-"));
        const file = path.join(dir, "config.json");
        fs.writeFileSync(file, "{}");
        fs.chmodSync(file, 0o666);

        restrictConfigFileMode({ path: file });

        expect(fs.statSync(file).mode & 0o777).toBe(0o600);
    });

    it("restrictConfigFileMode не падает, если файла ещё нет", () => {
        expect(() => restrictConfigFileMode({ path: "/nonexistent/config.json" })).not.toThrow();
    });

    it("electron-store нигде не создают в обход createStore", () => {
        const root = path.join(__dirname, "../../..");
        const offenders: string[] = [];
        const walk = (dir: string) => {
            for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
                const full = path.join(dir, entry.name);
                if (entry.isDirectory()) {
                    if (entry.name !== "__tests__") walk(full);
                } else if (/\.tsx?$/.test(entry.name) && !full.endsWith(path.join("newStorage", "createStore.ts"))) {
                    const text = fs.readFileSync(full, "utf8");
                    if (/new Store\(|from ["']electron-store["']/.test(text)) offenders.push(path.relative(root, full));
                }
            }
        };
        walk(root);
        expect(offenders).toEqual([]);
    });
});
