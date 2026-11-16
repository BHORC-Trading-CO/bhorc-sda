// SDA-55: a relative import must spell every folder and file exactly as it is on disk, letter case
// included. Windows and macOS resolve "../manager/manager" to Manager/Manager.ts anyway; Linux does
// not, and the app did not build there. This test compares each path segment with the real directory
// listing, so it also fails on the file systems that forgive the mismatch.
import fs from "fs";
import path from "path";

const ROOT = path.resolve(__dirname, "../../..");
const SOURCE_DIRS = ["electron", "src", "webpack", "scripts"];
const SOURCE_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".css"];
// What a specifier without an extension may resolve to
const RESOLVE_EXTENSIONS = ["", ".ts", ".tsx", ".js", ".jsx", ".json", ".css"];
const SPECIFIER = /(?:from\s+|import\s+|import\(\s*|require\(\s*|jest\.(?:mock|doMock|unmock|requireActual|requireMock)\(\s*)['"](\.{1,2}\/[^'"]+)['"]/g;
const CSS_URL = /url\(\s*['"]?(\.{1,2}\/[^'")?#]+)/g;
const CSS_IMPORT = /@import\s+(?:url\(\s*)?['"](\.{1,2}\/[^'"]+)['"]/g;
// A url() that css-loader leaves as is (webpackIgnore) is relative to the window's document, and
// CopyPlugin puts the repository's assets/ folder next to that document (webpack/renderer.webpack.js)
const DOCUMENT_ASSET = /^\.\/assets\//;

function sourceFiles(dir: string): string[] {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        if (entry.name === "node_modules") return [];
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) return sourceFiles(full);
        return SOURCE_EXTENSIONS.includes(path.extname(entry.name)) ? [full] : [];
    });
}

// The segment of `specifier` whose letter case differs from the name on disk, or null
export function wrongCaseSegment(fromFile: string, specifier: string): string | null {
    let current = path.dirname(fromFile);
    const segments = specifier.split("/").filter((segment) => segment !== "." && segment !== "");
    for (let i = 0; i < segments.length; i++) {
        const segment = segments[i];
        if (segment === "..") { current = path.dirname(current); continue; }
        let names: string[];
        try { names = fs.readdirSync(current); } catch { return null; }
        const candidates = i === segments.length - 1 ? RESOLVE_EXTENSIONS.map((ext) => segment + ext) : [segment];
        if (candidates.some((name) => names.includes(name))) { current = path.join(current, segment); continue; }
        const lower = candidates.map((name) => name.toLowerCase());
        // Nothing with this name in any case: not a casing problem (an alias, a generated file)
        return names.some((name) => lower.includes(name.toLowerCase())) ? segment : null;
    }
    return null;
}

// Nothing else checks a document-relative asset path, so it must exist exactly as written
export function missingAsset(specifier: string): boolean {
    let current = ROOT;
    for (const segment of specifier.split("/").filter((part) => part !== "." && part !== "")) {
        let names: string[];
        try { names = fs.readdirSync(current); } catch { return true; }
        if (!names.includes(segment)) return true;
        current = path.join(current, segment);
    }
    return false;
}

function mismatches(): string[] {
    const found: string[] = [];
    for (const dir of SOURCE_DIRS) {
        for (const file of sourceFiles(path.join(ROOT, dir))) {
            const text = fs.readFileSync(file, "utf8");
            const patterns = file.endsWith(".css") ? [CSS_URL, CSS_IMPORT] : [SPECIFIER];
            for (const match of patterns.flatMap((pattern) => [...text.matchAll(pattern)])) {
                const where = path.relative(ROOT, file).split(path.sep).join("/");
                if (file.endsWith(".css") && DOCUMENT_ASSET.test(match[1])) {
                    if (missingAsset(match[1])) found.push(`${where}: "${match[1]}" (no such file under the repository's assets/)`);
                    continue;
                }
                const segment = wrongCaseSegment(file, match[1]);
                if (segment) found.push(`${where}: "${match[1]}" (segment "${segment}")`);
            }
        }
    }
    return found;
}

describe("import paths match the names on disk", () => {
    it("finds a wrong-case folder and a wrong-case file, and accepts the right spelling", () => {
        const here = __filename;
        expect(wrongCaseSegment(here, "../manager/Manager")).toBe("manager");
        expect(wrongCaseSegment(here, "../Manager/manager")).toBe("manager");
        expect(wrongCaseSegment(here, "../Manager/Manager")).toBeNull();
        expect(wrongCaseSegment(here, "./IMPORTCASING.test")).toBe("IMPORTCASING.test");
        expect(wrongCaseSegment(here, "./no-such-file")).toBeNull();
    });

    it("reads @import and url() in stylesheets, and checks document-relative assets against assets/", () => {
        const imports = [...'@import "../a/B.css";\n@import url("./c.css");'.matchAll(CSS_IMPORT)].map((match) => match[1]);
        expect(imports).toEqual(["../a/B.css", "./c.css"]);
        const urls = [...'src: /* webpackIgnore: true */ url("./assets/fonts/X.woff2") format("woff2"); background: url(../img/a.png)'.matchAll(CSS_URL)].map((match) => match[1]);
        expect(urls).toEqual(["./assets/fonts/X.woff2", "../img/a.png"]);
        const form = path.join(ROOT, "src/css/Form.css");
        expect(wrongCaseSegment(form, "../globalComponents/TextArea/TextArea.css")).toBeNull();
        expect(wrongCaseSegment(form, "../globalComponents/textarea/TextArea.css")).toBe("textarea");
        expect(missingAsset("./assets/fonts/Geist/Geist.woff2")).toBe(false);
        expect(missingAsset("./assets/fonts/geist/Geist.woff2")).toBe(true);
        expect(missingAsset("./assets/fonts/Geist/geist.woff2")).toBe(true);
        expect(missingAsset("./assets/fonts/Geist/Missing.woff2")).toBe(true);
    });

    it("no relative import or CSS url differs from the real path only by letter case", () => {
        expect(mismatches()).toEqual([]);
    });
});
