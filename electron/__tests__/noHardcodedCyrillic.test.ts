import fs from "fs";
import path from "path";
import ts from "typescript";

// Весь видимый пользователю текст живёт в locales/*.json (SDA-18). Тест ищет кириллицу в строковых
// литералах, частях шаблонных строк, JSX-тексте и строках JSX-атрибутов в src/ и electron/.
// Не считаются: комментарии, регулярки, аргументы console.*(...), каталоги locales/, __tests__/,
// __mocks__/. Осознанное исключение (например, сравнение с текстом страницы Steam) помечается
// комментарием "i18n-ok: причина" на той же строке или строкой выше.
const ROOT = path.join(__dirname, "../..");
const SKIP_DIRS = new Set(["locales", "__tests__", "__mocks__", "node_modules"]);
const CYRILLIC = /[Ѐ-ӿ]/;

function walk(dir: string, out: string[] = []): string[] {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            if (!SKIP_DIRS.has(entry.name)) walk(full, out);
        } else if (/\.tsx?$/.test(entry.name)) out.push(full);
    }
    return out;
}

function isConsoleCall(node: ts.Node): boolean {
    if (!ts.isCallExpression(node)) return false;
    let callee: ts.Expression = node.expression;
    while (ts.isPropertyAccessExpression(callee)) {
        if (ts.isIdentifier(callee.expression) && callee.expression.text === "console") return true;
        callee = callee.expression;
    }
    return false;
}

function literalText(node: ts.Node): string | null {
    if (
        ts.isStringLiteral(node) ||
        ts.isNoSubstitutionTemplateLiteral(node) ||
        ts.isTemplateHead(node) ||
        ts.isTemplateMiddle(node) ||
        ts.isTemplateTail(node) ||
        ts.isJsxText(node)
    ) return node.text;
    return null;
}

export function findCyrillic(file: string): string[] {
    const source = fs.readFileSync(file, "utf8");
    const lines = source.split("\n");
    const kind = file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
    const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, kind);
    const hits: string[] = [];
    const visit = (node: ts.Node) => {
        if (isConsoleCall(node)) return;
        const text = literalText(node);
        if (text !== null && CYRILLIC.test(text)) {
            const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line;
            const marked = lines[line].includes("i18n-ok") || (line > 0 && lines[line - 1].includes("i18n-ok"));
            if (!marked) hits.push(`${path.relative(ROOT, file)}:${line + 1}: ${text.trim().slice(0, 80)}`);
        }
        ts.forEachChild(node, visit);
    };
    visit(sf);
    return hits;
}

function scan(dir: string): string[] {
    return walk(path.join(ROOT, dir)).flatMap(findCyrillic);
}

describe("в коде нет захардкоженного русского текста", () => {
    it("находит литералы, шаблоны и JSX, но не console и не помеченные строки", () => {
        const tmp = fs.mkdtempSync(path.join(require("os").tmpdir(), "i18n-guard-"));
        const file = path.join(tmp, "sample.tsx");
        fs.writeFileSync(file, [
            "const a = 'Привет';",
            "const b = `x ${a} мир`;",
            "const c = <div title=\"Подсказка\">Текст</div>;",
            "console.log('лог', `ещё ${a} лог`);",
            "const d = 'ok'; // комментарий",
            "const e = /Регулярка/;",
            "// i18n-ok: текст страницы Steam",
            "const f = ' руб.';",
        ].join("\n"));
        const hits = findCyrillic(file).map((h) => h.replace(/^.*sample\.tsx:/, ""));
        fs.rmSync(tmp, { recursive: true, force: true });
        expect(hits).toEqual(["1: Привет", "2: мир", "3: Подсказка", "3: Текст"]);
    });

    // Если обход сломается (расширения, пропуски каталогов), проверка не должна пройти на пустом списке.
    it("обход видит файлы кода", () => {
        expect(walk(path.join(ROOT, "electron")).length).toBeGreaterThan(100);
        expect(walk(path.join(ROOT, "src")).length).toBeGreaterThan(60);
        expect(walk(path.join(ROOT, "src")).some((f) => f.endsWith("SteamAccountsTable.tsx"))).toBe(true);
    });

    it("electron/", () => {
        expect(scan("electron")).toEqual([]);
    });

    it("src/", () => {
        expect(scan("src")).toEqual([]);
    });
});
