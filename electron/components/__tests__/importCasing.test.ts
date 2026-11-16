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

function mismatches(): string[] {
    const found: string[] = [];
    for (const dir of SOURCE_DIRS) {
        for (const file of sourceFiles(path.join(ROOT, dir))) {
            const text = fs.readFileSync(file, "utf8");
            const pattern = file.endsWith(".css") ? CSS_URL : SPECIFIER;
            for (const match of text.matchAll(pattern)) {
                const segment = wrongCaseSegment(file, match[1]);
                if (segment) found.push(`${path.relative(ROOT, file)}: "${match[1]}" (segment "${segment}")`);
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

    it("no relative import or CSS url differs from the real path only by letter case", () => {
        expect(mismatches()).toEqual([]);
    });
});
