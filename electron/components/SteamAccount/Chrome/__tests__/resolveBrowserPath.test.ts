import fs from "fs";
import os from "os";
import path from "path";

import resolveBrowserPath, {
  BINARY_INSIDE_ARCHIVE,
  needsNativeArmBrowser,
  ResolveBrowserDeps,
} from "../resolveBrowserPath";
import { setMainLanguage } from "../../../../i18n";

// Сообщения проверяем на русском: ru — прежний текст без изменений (SDA-18).
beforeAll(() => setMainLanguage("ru"));

const BUNDLED = "/fake/chromium";

function makeCacheRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "resolve-browser-test-"));
}

/** Кладёт в кеш готовую «сборку» указанной ревизии и возвращает путь до бинарника. */
function seedCachedRevision(cacheRoot: string, revision: string) {
  const binary = path.join(cacheRoot, revision, BINARY_INSIDE_ARCHIVE);
  fs.mkdirSync(path.dirname(binary), { recursive: true });
  fs.writeFileSync(binary, "");
  return binary;
}

function makeDeps(overrides: Partial<ResolveBrowserDeps> = {}): Partial<ResolveBrowserDeps> {
  return {
    platform: "darwin",
    arch: "arm64",
    bundledPath: BUNDLED,
    fetchText: jest.fn(async () => "1688726"),
    download: jest.fn(async () => undefined),
    // Распаковка по умолчанию имитирует успешную: создаёт бинарник на месте.
    extract: jest.fn(async (_archive: string, destDir: string) => {
      const binary = path.join(destDir, BINARY_INSIDE_ARCHIVE);
      fs.mkdirSync(path.dirname(binary), { recursive: true });
      fs.writeFileSync(binary, "");
    }),
    ...overrides,
  };
}

describe("needsNativeArmBrowser", () => {
  it("нативная сборка нужна только на darwin/arm64", () => {
    expect(needsNativeArmBrowser("darwin", "arm64")).toBe(true);
    expect(needsNativeArmBrowser("darwin", "x64")).toBe(false);
    expect(needsNativeArmBrowser("win32", "x64")).toBe(false);
    expect(needsNativeArmBrowser("win32", "arm64")).toBe(false);
    expect(needsNativeArmBrowser("linux", "arm64")).toBe(false);
  });
});

describe("resolveBrowserPath — платформы кроме Apple Silicon", () => {
  it("на Windows отдаёт путь из npm-пакета chromium и никуда не ходит", async () => {
    const cacheRoot = makeCacheRoot();
    const deps = makeDeps({ platform: "win32", arch: "x64", cacheRoot });

    await expect(resolveBrowserPath(deps)).resolves.toBe(BUNDLED);
    expect(deps.fetchText).not.toHaveBeenCalled();
    expect(deps.download).not.toHaveBeenCalled();
  });

  it("на Intel-маке тоже отдаёт путь из пакета", async () => {
    const cacheRoot = makeCacheRoot();
    const deps = makeDeps({ platform: "darwin", arch: "x64", cacheRoot });

    await expect(resolveBrowserPath(deps)).resolves.toBe(BUNDLED);
    expect(deps.download).not.toHaveBeenCalled();
  });
});

describe("resolveBrowserPath — Apple Silicon", () => {
  it("качает arm64-сборку, когда кеш пуст, и возвращает бинарник из неё", async () => {
    const cacheRoot = makeCacheRoot();
    const deps = makeDeps({ cacheRoot });

    const result = await resolveBrowserPath(deps);

    expect(result).toBe(path.join(cacheRoot, "1688726", BINARY_INSIDE_ARCHIVE));
    expect(result).not.toBe(BUNDLED);
    expect(fs.existsSync(result)).toBe(true);

    // Ревизию берём из LAST_CHANGE ветки Mac_Arm, архив — из неё же.
    expect(deps.fetchText).toHaveBeenCalledWith(
      expect.stringContaining("/Mac_Arm/LAST_CHANGE")
    );
    expect(deps.download).toHaveBeenCalledWith(
      expect.stringContaining("/Mac_Arm/1688726/chrome-mac.zip"),
      expect.any(String)
    );
  });

  it("повторный запуск переиспользует скачанную ревизию и не качает заново", async () => {
    const cacheRoot = makeCacheRoot();
    const cached = seedCachedRevision(cacheRoot, "1688726");
    const deps = makeDeps({ cacheRoot });

    await expect(resolveBrowserPath(deps)).resolves.toBe(cached);
    expect(deps.fetchText).not.toHaveBeenCalled();
    expect(deps.download).not.toHaveBeenCalled();
  });

  it("папка ревизии без бинарника не считается готовой сборкой", async () => {
    const cacheRoot = makeCacheRoot();
    fs.mkdirSync(path.join(cacheRoot, "1000000", "chrome-mac"), { recursive: true });
    const deps = makeDeps({ cacheRoot });

    await resolveBrowserPath(deps);

    expect(deps.download).toHaveBeenCalled();
  });

  it("мусор вместо номера ревизии — падаем до скачивания", async () => {
    const cacheRoot = makeCacheRoot();
    const deps = makeDeps({
      cacheRoot,
      fetchText: jest.fn(async () => "<!doctype html>"),
    });

    await expect(resolveBrowserPath(deps)).rejects.toThrow(/ревизию Chromium/);
    expect(deps.download).not.toHaveBeenCalled();
  });

  it("если в архиве нет бинарника — падаем и не оставляем битую ревизию в кеше", async () => {
    const cacheRoot = makeCacheRoot();
    const deps = makeDeps({
      cacheRoot,
      extract: jest.fn(async () => undefined),
    });

    await expect(resolveBrowserPath(deps)).rejects.toThrow(/нет бинарника/);
    expect(fs.existsSync(path.join(cacheRoot, "1688726"))).toBe(false);
  });
});
