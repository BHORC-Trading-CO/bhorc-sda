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
        // Иконки — только lucide через src/globalComponents/Icon, логотип — src/globalComponents/Brand.
        // Второй шаблон ловит имя файла иконки строкой (icon="Trash.svg"): путь к нему достраивался в другом месте.
        const iconRef = /assets\/img\/|['"`][\w./-]*\.(svg|png)['"`]/;
        expect(findHits([iconRef])).toEqual([]);
    });

    test("lucide-react only through the Icon wrapper", () => {
        const hits = findHits([/from\s+["']lucide-react/]).filter(
            (hit) => hit.split(":")[0].split(path.sep).join("/") !== "src/globalComponents/Icon/Icon.tsx"
        );
        expect(hits).toEqual([]);
    });

    test("brand mark: angular S, white bars and the cyan middle bar", () => {
        const markPath = path.join(ROOT, "assets/logo/sda-mark.svg");
        expect(fs.existsSync(markPath)).toBe(true);
        const mark = fs.readFileSync(markPath, "utf8");
        expect(mark).toContain("#22d3ee");
        expect(mark).toContain("#f4f4f5");
    });

    test("Brand inlines the same mark as assets/logo/sda-mark.svg", () => {
        // Brand.tsx рисует знак инлайн (CSP default-src 'self', без загрузки файла): геометрия и цвета
        // должны совпадать с исходником, из которого scripts/make-icons.mjs собирает иконки приложения.
        const polygons = (text: string) =>
            (text.match(/<polygon\b[^>]*>/g) || []).map((tag) => ({
                points: (tag.match(/\bpoints="([^"]*)"/) || [])[1],
                fill: (tag.match(/\bfill="([^"]*)"/) || [])[1],
            }));
        const mark = polygons(fs.readFileSync(path.join(ROOT, "assets/logo/sda-mark.svg"), "utf8"));
        const brandPath = path.join(ROOT, "src/globalComponents/Brand/Brand.tsx");
        expect(fs.existsSync(brandPath)).toBe(true);
        expect(mark.length).toBeGreaterThan(0);
        expect(polygons(fs.readFileSync(brandPath, "utf8"))).toEqual(mark);
    });

    test("app icons forge packages are generated", () => {
        // forge.config.js: icon "assets/icon" — packager дописывает .icns на macOS и .ico на Windows.
        const pngSize = (file: string) => {
            const buf = fs.readFileSync(path.join(ROOT, file));
            expect(buf.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
            return [buf.readUInt32BE(16), buf.readUInt32BE(20)];
        };
        expect(pngSize("assets/icon.png")).toEqual([1024, 1024]);
        expect(pngSize("assets/newIcon.png")).toEqual([512, 512]);
        expect(pngSize("assets/confirmationsIcon.png")).toEqual([512, 512]);

        // .icns: "icns", длина файла, затем записи (тип, длина); ic10 — 1024 px (512@2x).
        const icnsPath = path.join(ROOT, "assets/icon.icns");
        expect(fs.existsSync(icnsPath)).toBe(true);
        const icns = fs.readFileSync(icnsPath);
        expect(icns.subarray(0, 4).toString("latin1")).toBe("icns");
        expect(icns.readUInt32BE(4)).toBe(icns.length);
        const types: string[] = [];
        for (let at = 8; at < icns.length; at += icns.readUInt32BE(at + 4)) {
            types.push(icns.subarray(at, at + 4).toString("latin1"));
            expect(icns.readUInt32BE(at + 4)).toBeGreaterThan(8);
        }
        expect(types).toContain("ic10");

        // .ico: 7 размеров, каждая запись — PNG своего размера (ширина 0 в каталоге означает 256).
        const ico = fs.readFileSync(path.join(ROOT, "assets/icon.ico"));
        expect([ico.readUInt16LE(0), ico.readUInt16LE(2)]).toEqual([0, 1]);
        const sizes: number[] = [];
        for (let i = 0; i < ico.readUInt16LE(4); i++) {
            const entry = 6 + i * 16;
            const size = ico[entry] || 256;
            const bytes = ico.readUInt32LE(entry + 8);
            const offset = ico.readUInt32LE(entry + 12);
            expect(offset + bytes).toBeLessThanOrEqual(ico.length);
            const png = ico.subarray(offset, offset + bytes);
            expect(png.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
            expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([size, size]);
            sizes.push(size);
        }
        expect(sizes).toEqual([16, 24, 32, 48, 64, 128, 256]);
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
