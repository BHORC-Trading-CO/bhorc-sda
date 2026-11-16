import fs from "fs";
import os from "os";
import path from "path";

const { copyExternalModules, isBundledBrowserDir } = require("../../webpack/copyExternalModules");
const externals: string[] = require("../../webpack/externals");

const temporaryDirs: string[] = [];

afterEach(() => {
  for (const dir of temporaryDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

function tmpDir(prefix: string) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  temporaryDirs.push(dir);
  return dir;
}

/** Проект, в котором у каждого внешнего модуля есть пакет, а у chromium - скачанный браузер. */
function makeProject() {
  const project = tmpDir("bhorc-sda-copy-src-");
  for (const name of externals) {
    const dir = path.join(project, "node_modules", name);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name, main: "index.js" }));
    fs.writeFileSync(path.join(dir, "index.js"), "");
  }
  const browser = path.join(project, "node_modules", "chromium", "lib", "chromium", "chrome-mac", "Chromium");
  fs.mkdirSync(path.dirname(browser), { recursive: true });
  fs.writeFileSync(browser, "binary");
  fs.mkdirSync(path.join(project, "node_modules", "chromium", "node_modules", ".bin"), { recursive: true });
  return project;
}

const bundledBrowser = (build: string) =>
  path.join(build, "node_modules", "chromium", "lib", "chromium", "chrome-mac", "Chromium");

describe("copyExternalModules", () => {
  it.each([
    ["win32", "x64"],
    ["linux", "x64"],
    ["darwin", "x64"],
  ])("сборка %s/%s получает браузер из пакета chromium", (platform, arch) => {
    const build = tmpDir("bhorc-sda-copy-dst-");
    copyExternalModules(makeProject(), build, { platform, arch });

    expect(fs.existsSync(bundledBrowser(build))).toBe(true);
  });

  it("без указания платформы поведение прежнее: браузер копируется", () => {
    const build = tmpDir("bhorc-sda-copy-dst-");
    copyExternalModules(makeProject(), build);

    expect(fs.existsSync(bundledBrowser(build))).toBe(true);
  });

  it("сборка darwin/arm64 не тащит x86_64-браузер, но сам модуль chromium на месте", () => {
    const build = tmpDir("bhorc-sda-copy-dst-");
    const count = copyExternalModules(makeProject(), build, { platform: "darwin", arch: "arm64" });

    expect(count).toBe(externals.length);
    expect(fs.existsSync(path.join(build, "node_modules", "chromium", "lib", "chromium"))).toBe(false);
    expect(fs.existsSync(path.join(build, "node_modules", "chromium", "index.js"))).toBe(true);
    expect(fs.existsSync(path.join(build, "node_modules", "chromium", "package.json"))).toBe(true);
    for (const name of externals) {
      expect(fs.existsSync(path.join(build, "node_modules", name, "package.json"))).toBe(true);
    }
  });

  it("папки .bin в сборку не попадают ни на одной платформе", () => {
    const build = tmpDir("bhorc-sda-copy-dst-");
    copyExternalModules(makeProject(), build, { platform: "win32", arch: "x64" });

    expect(fs.existsSync(path.join(build, "node_modules", "chromium", "node_modules", ".bin"))).toBe(false);
  });
});

describe("isBundledBrowserDir", () => {
  it("узнаёт папку браузера в любом виде пути", () => {
    expect(isBundledBrowserDir("/repo/node_modules/chromium/lib/chromium")).toBe(true);
    expect(isBundledBrowserDir("/repo/node_modules/chromium/lib/chromium/")).toBe(true);
    expect(isBundledBrowserDir("C:\\repo\\node_modules\\chromium\\lib\\chromium")).toBe(true);
    expect(isBundledBrowserDir("\\\\?\\C:\\repo\\node_modules\\chromium\\lib\\chromium")).toBe(true);
  });

  it("соседние папки и сам пакет не трогает", () => {
    expect(isBundledBrowserDir("/repo/node_modules/chromium")).toBe(false);
    expect(isBundledBrowserDir("/repo/node_modules/chromium/lib")).toBe(false);
    expect(isBundledBrowserDir("/repo/node_modules/chromium/lib/chromium/chrome-mac")).toBe(false);
    expect(isBundledBrowserDir("/repo/node_modules/other/lib/chromium")).toBe(false);
  });
});
