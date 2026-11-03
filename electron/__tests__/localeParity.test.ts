import fs from "fs";
import path from "path";
import ts from "typescript";

// Переводы (SDA-18): в каждом пространстве имён у всех трёх языков один и тот же набор ключей
// и одни и те же {{параметры}}. Формы множественного числа (_one/_few/_many/_other) у каждого
// языка свои — по правилам Intl.PluralRules, но сама группа ключей должна быть у всех.
const ROOT = path.join(__dirname, "../..");
const LANGUAGES = ["en", "uk", "ru"];
const NAMESPACES = [
    { name: "main", dir: "electron/locales" },
    { name: "common", dir: "src/locales" },
    { name: "shell", dir: "src/locales" },
];
const PLURAL_SUFFIX = /_(zero|one|two|few|many|other)$/;

type Flat = Record<string, string>;

function flatten(value: unknown, prefix: string, out: Flat, errors: string[]): Flat {
    if (typeof value === "string") {
        out[prefix] = value;
    } else if (value && typeof value === "object" && !Array.isArray(value)) {
        for (const [key, child] of Object.entries(value)) flatten(child, prefix ? `${prefix}.${key}` : key, out, errors);
    } else {
        errors.push(`${prefix}: значение должно быть строкой или объектом`);
    }
    return out;
}

function load(dir: string, language: string, ns: string, errors: string[]): Flat {
    const file = path.join(ROOT, dir, language, `${ns}.json`);
    if (!fs.existsSync(file)) {
        errors.push(`${path.relative(ROOT, file)}: файла нет`);
        return {};
    }
    return flatten(JSON.parse(fs.readFileSync(file, "utf8")), "", {}, errors);
}

function placeholders(text: string): string[] {
    return [...text.matchAll(/\{\{\s*([\w.]+)[^}]*\}\}/g)].map((m) => m[1]);
}

// Ключ без суффикса множественного числа -> { формы, параметры (кроме count, его в формах можно опускать) }.
function groups(flat: Flat) {
    const result = new Map<string, { forms: Set<string>; params: Set<string> }>();
    for (const [key, text] of Object.entries(flat)) {
        const match = key.match(PLURAL_SUFFIX);
        const base = match ? key.slice(0, -match[0].length) : key;
        const group = result.get(base) || { forms: new Set<string>(), params: new Set<string>() };
        if (match) group.forms.add(match[1]);
        for (const name of placeholders(text)) if (!(match && name === "count")) group.params.add(name);
        result.set(base, group);
    }
    return result;
}

const sorted = (values: Iterable<string>) => [...values].sort();

describe.each(NAMESPACES)("переводы: пространство имён $name", ({ name, dir }) => {
    const errors: string[] = [];
    const byLanguage = Object.fromEntries(LANGUAGES.map((language) => [language, groups(load(dir, language, name, errors))]));

    it("файлы есть и разбираются", () => {
        expect(errors).toEqual([]);
    });

    it("у всех языков одинаковые ключи", () => {
        const reference = sorted(byLanguage.en.keys());
        for (const language of LANGUAGES) {
            expect({ language, keys: sorted(byLanguage[language].keys()) }).toEqual({ language, keys: reference });
        }
    });

    it("у каждого ключа одинаковые {{параметры}} во всех языках", () => {
        const mismatches: string[] = [];
        for (const [key, group] of byLanguage.en) {
            for (const language of LANGUAGES) {
                const other = byLanguage[language].get(key);
                if (other && sorted(other.params).join() !== sorted(group.params).join()) {
                    mismatches.push(`${key}: en {${sorted(group.params)}} ≠ ${language} {${sorted(other.params)}}`);
                }
            }
        }
        expect(mismatches).toEqual([]);
    });

    // В ru/uk форма one — это и 21, 31, 101…, а не «ровно один»: без числа текст читается неверно.
    it("в ru/uk каждая форма _one содержит {{count}}", () => {
        const errors2: string[] = [];
        const bad: string[] = [];
        for (const language of ["uk", "ru"]) {
            const flat = load(dir, language, name, errors2);
            for (const [key, text] of Object.entries(flat)) {
                if (key.endsWith("_one") && !placeholders(text).includes("count")) bad.push(`${language} ${key}`);
            }
        }
        expect(bad).toEqual([]);
    });

    it("формы множественного числа соответствуют правилам языка", () => {
        const mismatches: string[] = [];
        for (const language of LANGUAGES) {
            const required = sorted(new Intl.PluralRules(language).resolvedOptions().pluralCategories);
            for (const [key, group] of byLanguage[language]) {
                if (group.forms.size && sorted(group.forms).join() !== required.join()) {
                    mismatches.push(`${language} ${key}: ${sorted(group.forms)} вместо ${required}`);
                }
            }
        }
        expect(mismatches).toEqual([]);
    });
});

describe("ключи t() в electron/ есть в main", () => {
    // Литеральные ключи t("...") / t('...'); ключи из шаблонов (`errors.askAborted.${type}`) — по префиксу.
    function usedKeys(): { key: string; where: string; prefix: boolean }[] {
        const out: { key: string; where: string; prefix: boolean }[] = [];
        const walk = (dir: string) => {
            for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
                const full = path.join(dir, entry.name);
                if (entry.isDirectory()) {
                    if (!["__tests__", "locales", "node_modules"].includes(entry.name)) walk(full);
                    continue;
                }
                if (!/\.ts$/.test(entry.name)) continue;
                const sf = ts.createSourceFile(full, fs.readFileSync(full, "utf8"), ts.ScriptTarget.Latest, true);
                const visit = (node: ts.Node) => {
                    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "t" && node.arguments[0]) {
                        const arg = node.arguments[0];
                        const where = `${path.relative(ROOT, full)}:${sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1}`;
                        if (ts.isStringLiteral(arg) || ts.isNoSubstitutionTemplateLiteral(arg)) out.push({ key: arg.text, where, prefix: false });
                        else if (ts.isTemplateExpression(arg)) out.push({ key: arg.head.text, where, prefix: true });
                    }
                    ts.forEachChild(node, visit);
                };
                visit(sf);
            }
        };
        walk(path.join(ROOT, "electron"));
        return out;
    }

    it("каждый ключ существует в en/main.json", () => {
        const keys = Object.keys(flatten(JSON.parse(fs.readFileSync(path.join(ROOT, "electron/locales/en/main.json"), "utf8")), "", {}, []));
        const used = usedKeys();
        expect(used.length).toBeGreaterThan(20);
        const missing = used
            .filter(({ key, prefix }) => prefix ? !keys.some((k) => k.startsWith(key)) : !keys.includes(key))
            .map(({ key, where }) => `${where}: ${key}`);
        expect(missing).toEqual([]);
    });
});

describe("ключи в src/ есть в common или shell", () => {
    type Used = { ns: string; key: string; where: string; prefix: boolean; hasCount: boolean };
    // t("…"), i18n.t("…"), t(cond ? "a" : "b"), t(`prefix.${x}`), <Trans i18nKey="…" />.
    // Пространство имён: "ns:key" явно, иначе shell для файлов с useTranslation("shell"), иначе common.
    function usedKeys(): Used[] {
        const out: Used[] = [];
        const walk = (dir: string) => {
            for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
                const full = path.join(dir, entry.name);
                if (entry.isDirectory()) {
                    if (!["__tests__", "locales", "node_modules"].includes(entry.name)) walk(full);
                    continue;
                }
                if (!/\.tsx?$/.test(entry.name)) continue;
                const source = fs.readFileSync(full, "utf8");
                const fileNs = /useTranslation\(\s*["']shell["']\s*\)/.test(source) ? "shell" : "common";
                const sf = ts.createSourceFile(full, source, ts.ScriptTarget.Latest, true, /\.tsx$/.test(entry.name) ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
                const push = (arg: ts.Expression, node: ts.Node, hasCount: boolean) => {
                    const where = `${path.relative(ROOT, full)}:${sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1}`;
                    const add = (raw: string, prefix: boolean) => {
                        const [ns, key] = raw.includes(":") ? raw.split(":", 2) : [fileNs, raw];
                        out.push({ ns, key, where, prefix, hasCount });
                    };
                    if (ts.isStringLiteral(arg) || ts.isNoSubstitutionTemplateLiteral(arg)) add(arg.text, false);
                    else if (ts.isTemplateExpression(arg)) add(arg.head.text, true);
                    else if (ts.isConditionalExpression(arg)) { push(arg.whenTrue, node, hasCount); push(arg.whenFalse, node, hasCount); }
                };
                // Второй аргумент t(key, { count, ... }) — объект со свойством count.
                const passesCount = (options: ts.Expression | undefined) => !!options && ts.isObjectLiteralExpression(options) &&
                    options.properties.some((p) => (ts.isPropertyAssignment(p) || ts.isShorthandPropertyAssignment(p)) && p.name.getText(sf) === "count");
                const visit = (node: ts.Node) => {
                    if (ts.isCallExpression(node) && node.arguments[0]) {
                        const callee = node.expression;
                        const isT = (ts.isIdentifier(callee) && callee.text === "t") ||
                            (ts.isPropertyAccessExpression(callee) && callee.name.text === "t" && ts.isIdentifier(callee.expression) && callee.expression.text === "i18n");
                        if (isT) push(node.arguments[0], node, passesCount(node.arguments[1]));
                    }
                    if ((ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) && node.tagName.getText(sf) === "Trans") {
                        for (const attr of node.attributes.properties) {
                            if (ts.isJsxAttribute(attr) && attr.name.getText(sf) === "i18nKey" && attr.initializer) {
                                const init = attr.initializer;
                                const hasCount = node.attributes.properties.some((a) => ts.isJsxAttribute(a) && a.name.getText(sf) === "count");
                                if (ts.isStringLiteral(init)) push(init, node, hasCount);
                                else if (ts.isJsxExpression(init) && init.expression) push(init.expression, node, hasCount);
                            }
                        }
                    }
                    ts.forEachChild(node, visit);
                };
                visit(sf);
            }
        };
        walk(path.join(ROOT, "src"));
        return out;
    }

    it("каждый ключ существует в en (с учётом форм множественного числа)", () => {
        const keys: Record<string, string[]> = {};
        for (const ns of ["common", "shell"]) {
            keys[ns] = Object.keys(flatten(JSON.parse(fs.readFileSync(path.join(ROOT, "src/locales/en", `${ns}.json`), "utf8")), "", {}, []));
        }
        const used = usedKeys();
        expect(used.length).toBeGreaterThan(200);
        const exists = ({ ns, key, prefix, hasCount }: Used) => {
            const list = keys[ns] || [];
            if (prefix) return list.some((k) => k.startsWith(key));
            // Ключ только с формами множественного числа без count i18next покажет как сырой ключ.
            return list.includes(key) || (hasCount && list.some((k) => k.startsWith(`${key}_`) && PLURAL_SUFFIX.test(k)));
        };
        expect(used.filter((u) => !exists(u)).map((u) => `${u.where}: ${u.ns}:${u.key}`)).toEqual([]);
    });
});
