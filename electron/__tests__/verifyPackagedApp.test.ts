import fs from "fs";
import os from "os";
import path from "path";

const { findPackagedAppDirs, verify, targetOf, expectedBundledBrowser } = require("../../scripts/verifyPackagedApp");
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
    // Windows-раскладка: у неё нет имени .app внутри, поэтому без фильтра по имени
    // старая сборка Trademanager-win32-x64 прошла бы проверку.
    mockLayout("Trademanager-win32-x64", path.join("resources", "app"));
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

// SDA-30: node-chromium глотает ошибку скачивания, и сборка выходила без chrome.exe.
describe("браузер Chromium в сборке", () => {
  function makeTargetFixture(target: string, relativeAppDir: string) {
    const appDir = path.join(makeFixture(), `BHORC SDA-${target}`, relativeAppDir);
    fs.mkdirSync(appDir, { recursive: true });
    seedExternals(appDir);
    return appDir;
  }

  function seedBrowser(appDir: string, binaryInsideLib: string) {
    const binary = path.join(appDir, "node_modules", "chromium", "lib", "chromium", binaryInsideLib);
    fs.mkdirSync(path.dirname(binary), { recursive: true });
    fs.writeFileSync(binary, "");
  }

  it("определяет платформу сборки по пути", () => {
    expect(targetOf(path.join("out", "BHORC SDA-win32-x64", "resources", "app"))).toBe("win32-x64");
    expect(
      targetOf(path.join("out", "BHORC SDA-darwin-arm64", "BHORC SDA.app", "Contents", "Resources", "app"))
    ).toBe("darwin-arm64");
    expect(targetOf(path.join(os.tmpdir(), "somewhere", "app"))).toBeNull();
  });

  it("знает, какой бинарник нужен каждой платформе", () => {
    expect(expectedBundledBrowser("win32-x64")).toBe(path.join("chrome-win", "chrome.exe"));
    expect(expectedBundledBrowser("linux-x64")).toBe(path.join("chrome-linux", "chrome"));
    expect(expectedBundledBrowser("darwin-x64")).toBe(
      path.join("chrome-mac", "Chromium.app", "Contents", "MacOS", "Chromium")
    );
    // Apple Silicon качает нативную сборку при первом запуске.
    expect(expectedBundledBrowser("darwin-arm64")).toBeNull();
    expect(expectedBundledBrowser(null)).toBeNull();
  });

  it.each([
    ["win32-x64", path.join("chrome-win", "chrome.exe")],
    ["linux-x64", path.join("chrome-linux", "chrome")],
  ])("сборка %s без браузера не проходит, с браузером проходит", (target, binary) => {
    const appDir = makeTargetFixture(target, path.join("resources", "app"));

    expect(verify(appDir)).toEqual([expect.stringContaining("нет браузера Chromium")]);

    seedBrowser(appDir, binary);
    expect(verify(appDir)).toEqual([]);
  });

  it("браузер другой платформы не засчитывается", () => {
    const appDir = makeTargetFixture("win32-x64", path.join("resources", "app"));
    seedBrowser(appDir, path.join("chrome-linux", "chrome"));

    expect(verify(appDir)).toEqual([expect.stringContaining("нет браузера Chromium")]);
  });

  it("сборке darwin-arm64 браузер из пакета не нужен", () => {
    const appDir = makeTargetFixture(
      "darwin-arm64",
      path.join("BHORC SDA.app", "Contents", "Resources", "app")
    );
    expect(verify(appDir)).toEqual([]);
  });
});
