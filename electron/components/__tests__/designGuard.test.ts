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

/**
 * Совпадения шаблонов во всём тексте файла, а не построчно: объявление может занимать несколько
 * строк (url(\n  "https://…")). Номер строки — по смещению начала совпадения.
 */
function scanText(text: string, patterns: RegExp[]): { line: number, text: string }[] {
    const lines = text.split("\n");
    const found = new Map<number, string>();
    for (const re of patterns) {
        const global = new RegExp(re.source, re.flags.includes("g") ? re.flags : `${re.flags}g`);
        for (const match of text.matchAll(global)) {
            const line = text.slice(0, match.index).split("\n").length;
            found.set(line, lines[line - 1].trim().slice(0, 120));
        }
    }
    return [...found.entries()].sort((a, b) => a[0] - b[0]).map(([line, text]) => ({ line, text }));
}

/** Строки вида "src/x.css:12: <строка>", где начинается совпадение хотя бы одного из шаблонов. */
function findHits(patterns: RegExp[]): string[] {
    const hits: string[] = [];
    for (const file of rendererFiles()) {
        for (const hit of scanText(fs.readFileSync(file, "utf8"), patterns)) {
            hits.push(`${path.relative(ROOT, file)}:${hit.line}: ${hit.text}`);
        }
    }
    return hits;
}

/**
 * Записи .icns: заголовок "icns" и длина файла, затем записи (тип 4 байта, длина 4 байта, данные).
 * Каждая запись должна целиком лежать в файле, а последняя — заканчиваться ровно на его конце.
 */
function icnsRecords(icns: Buffer): string[] {
    if (icns.length < 8 || icns.subarray(0, 4).toString("latin1") !== "icns") throw new Error("not an icns file");
    if (icns.readUInt32BE(4) !== icns.length) throw new Error(`header length ${icns.readUInt32BE(4)} != file length ${icns.length}`);
    const types: string[] = [];
    let at = 8;
    while (at < icns.length) {
        if (at + 8 > icns.length) throw new Error(`truncated record header at ${at}`);
        const type = icns.subarray(at, at + 4).toString("latin1");
        const size = icns.readUInt32BE(at + 4);
        if (size <= 8) throw new Error(`record ${type} at ${at} has length ${size}`);
        if (at + size > icns.length) throw new Error(`record ${type} at ${at} runs past the end (${at + size} > ${icns.length})`);
        types.push(type);
        at += size;
    }
    return types;
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

    // url(http://…), url("https://…") и протокол-относительный url(//…), в том числе через перенос строки.
    const REMOTE_URL = /url\(\s*['"]?\s*(https?:)?\/\//i;

    test("the scanner sees a remote url( split across lines and reports its first line", () => {
        const css = ".a { color: red; }\n@font-face {\n  src: url(\n    \"https://cdn.example.invalid/x.woff2\"\n  );\n}\n.b { background: url(//cdn.example.invalid/y.png); }\n";
        expect(scanText(css, [REMOTE_URL])).toEqual([
            { line: 3, text: "src: url(" },
            { line: 7, text: ".b { background: url(//cdn.example.invalid/y.png); }" },
        ]);
        expect(scanText("src: url(\n  './fonts/Geist.woff2'\n);", [REMOTE_URL])).toEqual([]);
    });

    test("fonts and icons are bundled", () => {
        expect(findHits([REMOTE_URL, /fonts\.googleapis/i])).toEqual([]);
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

    test("no library spinners or CSS-in-JS: loaders are the Icon loader", () => {
        // Спиннеры react-loading-icons и styled-components (GlobalStyle) заменены в редизайне:
        // загрузка — <Icon name="loader" motion="spinAlways" />, стили — обычный CSS с токенами.
        const removed = ["react-loading-icons", "styled-components", "react-circular-progressbar"];
        const importRe = new RegExp(`(from\\s+|require\\(\\s*|import\\s+)["'](${removed.join("|")})["'/]`);
        expect(findHits([importRe])).toEqual([]);
        const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
        const declared = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
        expect(declared.filter((name) => removed.includes(name) || name === "@types/styled-components")).toEqual([]);
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

    test("icon tile outline uses the --sda-border colour", () => {
        const tokens = fs.readFileSync(path.join(ROOT, "src/css/tokens.css"), "utf8");
        const script = fs.readFileSync(path.join(ROOT, "scripts/make-icons.mjs"), "utf8");
        const border = (tokens.match(/--sda-border:\s*(#[0-9a-f]{6})/i) || [])[1];
        expect(border).toBeDefined();
        expect((script.match(/const BORDER = "(#[0-9a-f]{6})"/i) || [])[1]).toBe(border);
        expect(script).toContain('stroke="${BORDER}"');
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

        // .icns: записи в границах файла (icnsRecords); ic10 — 1024 px (512@2x).
        const icnsPath = path.join(ROOT, "assets/icon.icns");
        expect(fs.existsSync(icnsPath)).toBe(true);
        expect(icnsRecords(fs.readFileSync(icnsPath))).toContain("ic10");

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

    test("the icns reader rejects records past the end and bytes after the last record", () => {
        const record = (type: string, data: number[]) => {
            const head = Buffer.alloc(8);
            head.write(type, 0, "latin1");
            head.writeUInt32BE(8 + data.length, 4);
            return Buffer.concat([head, Buffer.from(data)]);
        };
        const file = (body: Buffer, declared?: number) => {
            const head = Buffer.alloc(8);
            head.write("icns", 0, "latin1");
            head.writeUInt32BE(declared ?? 8 + body.length, 4);
            return Buffer.concat([head, body]);
        };
        const good = Buffer.concat([record("ic10", [1, 2, 3]), record("ic09", [4])]);
        expect(icnsRecords(file(good))).toEqual(["ic10", "ic09"]);
        // Длина записи больше, чем осталось в файле.
        const long = record("ic10", [1, 2, 3]);
        long.writeUInt32BE(64, 4);
        expect(() => icnsRecords(file(long))).toThrow(/runs past the end/);
        // После последней записи остались байты, которых не хватает на заголовок записи.
        expect(() => icnsRecords(file(Buffer.concat([good, Buffer.from([0, 0, 0])])))).toThrow(/truncated record header/);
        // Длина в заголовке файла не совпадает с настоящей.
        expect(() => icnsRecords(file(good, 8 + good.length + 4))).toThrow(/header length/);
        // Запись нулевой длины зациклила бы старый разбор.
        const empty = record("ic10", []);
        empty.writeUInt32BE(0, 4);
        expect(() => icnsRecords(file(empty))).toThrow(/has length 0/);
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
