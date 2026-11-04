import fs from "fs";
import path from "path";

// Страж дизайна QBS (редизайн R1). Проверяет исходники рендерера как текст: src/**/*.{css,ts,tsx}
// и public/*.html. Старая розово-фиолетовая палитра и Nunito не должны вернуться, шрифты и иконки
// грузятся только из сборки (CSP default-src 'self'), Geist объявлен и лежит в assets/fonts/Geist.
const ROOT = path.join(__dirname, "../../..");
const SKIP_DIRS = new Set(["node_modules", "__tests__", "__mocks__"]);

function walk(dir: string, out: string[] = []): string[] {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            if (!SKIP_DIRS.has(entry.name)) walk(full, out);
        } else if (/\.(css|tsx?)$/.test(entry.name)) out.push(full);
    }
    return out;
}

function rendererFiles(): string[] {
    const publicDir = path.join(ROOT, "public");
    const html = fs
        .readdirSync(publicDir)
        .filter((name) => name.endsWith(".html"))
        .map((name) => path.join(publicDir, name));
    return [...walk(path.join(ROOT, "src")), ...html];
}

/** Строки вида "src/x.css:12: <строка>", где встречается хотя бы один из шаблонов. */
function findHits(patterns: RegExp[]): string[] {
    const hits: string[] = [];
    for (const file of rendererFiles()) {
        const lines = fs.readFileSync(file, "utf8").split("\n");
        lines.forEach((line, i) => {
            if (patterns.some((re) => re.test(line))) {
                hits.push(`${path.relative(ROOT, file)}:${i + 1}: ${line.trim().slice(0, 120)}`);
            }
        });
    }
    return hits;
}

describe("design guard", () => {
    test("no pink/violet palette left", () => {
        const banned = [
            /#ff00e5/i,
            /#7000ff/i,
            /#c400f5/i,
            /#eb00f0/i,
            /rgba\(255, 0, 229/i,
            /rgba\(255,0,229/i,
            /--sda-accent-gradient/i,
            // Удалённые токены градиента: ссылка на них молча даёт пустое значение.
            /--sda-accent-(from|to)\b/i,
        ];
        expect(findHits(banned)).toEqual([]);
    });

    test("no Nunito", () => {
        expect(findHits([/Nunito/])).toEqual([]);
    });

    test("fonts and icons are bundled", () => {
        // url(http://…), url("https://…") и протокол-относительный url(//…).
        expect(findHits([/url\(\s*['"]?\s*(https?:)?\/\//i, /fonts\.googleapis/i])).toEqual([]);
    });

    test("no legacy assets/img icons in UI", () => {
        // Иконки — только lucide через src/globalComponents/Icon. Исключение — логотип: его заменяет
        // задача про логотип, до тех пор Navigation.tsx остаётся на Logo.svg.
        // Второй шаблон ловит имя файла иконки строкой (icon="Trash.svg"): путь к нему достраивался в другом месте.
        const allowed = new Set(["src/pages/Main/components/Navigation/Navigation.tsx:./assets/img/Logo.svg"]);
        const iconRef = /assets\/img\/|['"`][\w./-]*\.(svg|png)['"`]/;
        const hits = findHits([iconRef]).filter((hit) => {
            // Путь с прямыми слэшами и на Windows (path.relative там даёт обратные).
            const file = hit.split(":")[0].split(path.sep).join("/");
            const refs = hit.match(/['"`(][\w./-]*\.(svg|png)/g) || [];
            return !(refs.length > 0 && refs.every((ref) => allowed.has(`${file}:${ref.slice(1)}`)));
        });
        expect(hits).toEqual([]);
    });

    test("lucide-react only through the Icon wrapper", () => {
        const hits = findHits([/from\s+["']lucide-react/]).filter(
            (hit) => hit.split(":")[0].split(path.sep).join("/") !== "src/globalComponents/Icon/Icon.tsx"
        );
        expect(hits).toEqual([]);
    });

    test("Geist is declared", () => {
        const fontsCssPath = path.join(ROOT, "src/css/fonts.css");
        expect(fs.existsSync(fontsCssPath)).toBe(true);
        const fontsCss = fs.readFileSync(fontsCssPath, "utf8");
        expect(fontsCss).toContain('font-family: "Geist"');
        expect(fontsCss).toContain('font-family: "Geist Mono"');
        for (const file of ["Geist.woff2", "GeistMono.woff2"]) {
            expect(fs.existsSync(path.join(ROOT, "assets/fonts/Geist", file))).toBe(true);
        }
    });
});
