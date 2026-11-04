import fs from "fs";
import path from "path";
import { LANGUAGES, LANGUAGE_META } from "../../interfaces/Language";

// Меню языка (R2) строится из LANGUAGES и LANGUAGE_META: новый язык — запись в обоих списках
// и папка src/locales/<код>. Тест ловит язык, добавленный только в одно из мест.
const ROOT = path.join(__dirname, "../../..");
const SHELL_KEYS = ["languageMenu.label", "groups.all", "groups.new", "groups.createTitle"];

function lookup(tree: unknown, key: string): unknown {
    return key.split(".").reduce<unknown>((node, part) => (node && typeof node === "object" ? (node as Record<string, unknown>)[part] : undefined), tree);
}

describe("LANGUAGE_META", () => {
    it.each([...LANGUAGES])("%s: есть код и самоназвание", (language) => {
        const meta = LANGUAGE_META[language];
        expect(meta).toBeDefined();
        expect(meta.code.trim()).not.toBe("");
        expect(meta.nativeName.trim()).not.toBe("");
    });

    it("ровно те же языки, что в LANGUAGES, коды не повторяются", () => {
        expect(Object.keys(LANGUAGE_META).sort()).toEqual([...LANGUAGES].sort());
        const codes = LANGUAGES.map((language) => LANGUAGE_META[language].code);
        expect(new Set(codes).size).toBe(codes.length);
    });
});

describe("shell.json каждого языка", () => {
    it.each([...LANGUAGES])("%s: строки верхней панели и групп", (language) => {
        const file = path.join(ROOT, "src/locales", language, "shell.json");
        expect(fs.existsSync(file)).toBe(true);
        const shell = JSON.parse(fs.readFileSync(file, "utf8"));
        for (const key of SHELL_KEYS) {
            const value = lookup(shell, key);
            expect({ key, type: typeof value }).toEqual({ key, type: "string" });
            expect({ key, empty: (value as string).trim() === "" }).toEqual({ key, empty: false });
        }
    });
});
