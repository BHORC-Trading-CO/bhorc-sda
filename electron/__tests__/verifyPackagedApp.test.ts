import fs from "fs";
import os from "os";
import path from "path";

const { findPackagedAppDirs, verify } = require("../../scripts/verifyPackagedApp");
const externals: string[] = require("../../webpack/externals");
const outDir = path.resolve(__dirname, "..", "..", "out");
const temporaryDirs: string[] = [];

afterEach(() => {
  jest.restoreAllMocks();
  for (const dir of temporaryDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function mockLayout(entry: string, relativeAppDir: string) {
  const appDir = path.join(outDir, entry, relativeAppDir);
  const existing = new Set([outDir, path.join(appDir, "package.json")]);
  jest.spyOn(fs, "existsSync").mockImplementation((file) => existing.has(String(file)));
  jest.spyOn(fs, "readdirSync").mockReturnValue([entry] as any);
  jest.spyOn(fs, "statSync").mockReturnValue({ isDirectory: () => true } as fs.Stats);
  return appDir;
}

function makeFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "bhorc-sda-package-test-"));
  temporaryDirs.push(root);
  return root;
}

function seedExternals(root: string) {
  for (const name of externals) {
    const dir = path.join(root, "node_modules", name);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name, main: "index.js" }));
    fs.writeFileSync(path.join(dir, "index.js"), "");
  }
}

describe("проверка сборки BHORC SDA", () => {
  it.each([
    ["darwin-arm64", path.join("BHORC SDA.app", "Contents", "Resources", "app")],
    ["win32-x64", path.join("resources", "app")],
    ["linux-x64", path.join("resources", "app")],
  ])("находит новое расположение сборки %s", (target, relativeAppDir) => {
    const appDir = mockLayout(`BHORC SDA-${target}`, relativeAppDir);
    expect(findPackagedAppDirs()).toEqual([appDir]);
  });

  it("не принимает старую сборку за проверку переименованного приложения", () => {
    mockLayout("Trademanager-darwin-arm64", path.join("Trademanager.app", "Contents", "Resources", "app"));
    expect(() => findPackagedAppDirs()).toThrow(/не нашлось собранного приложения BHORC SDA/);
  });

  it("не подхватывает внешние модули из родительского node_modules", () => {
    const root = makeFixture();
    seedExternals(root);
    const appDir = path.join(root, "resources", "app");
    fs.mkdirSync(appDir, { recursive: true });

    const problems = verify(appDir);
    expect(problems).toHaveLength(externals.length);
    expect(problems.every((problem: string) => problem.includes("нет в сборке"))).toBe(true);
  });

  it("принимает модули внутри сборки и обнаруживает лишнюю папку .bin", () => {
    const appDir = makeFixture();
    seedExternals(appDir);
    expect(verify(appDir)).toEqual([]);

    fs.mkdirSync(path.join(appDir, "node_modules", ".bin"));
    expect(verify(appDir)).toEqual([expect.stringContaining("лишняя папка .bin")]);
  });
});
