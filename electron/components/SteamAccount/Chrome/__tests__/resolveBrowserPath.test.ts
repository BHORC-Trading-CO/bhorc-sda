import fs from "fs";
import os from "os";
import path from "path";

import resolveBrowserPath, {
  BINARY_INSIDE_ARCHIVE,
  extractArchive,
  needsNativeArmBrowser,
  ResolveBrowserDeps,
  snapshotFor,
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

describe("snapshotFor", () => {
  it("знает ветку, архив и бинарник для каждой поддержанной платформы", () => {
    expect(snapshotFor("darwin", "arm64")).toMatchObject({ branch: "Mac_Arm", archiveName: "chrome-mac.zip", cacheDirName: "chromium-mac-arm64" });
    expect(snapshotFor("darwin", "x64")).toMatchObject({ branch: "Mac", archiveName: "chrome-mac.zip", cacheDirName: "chromium-mac-x64" });
    expect(snapshotFor("win32", "x64")).toMatchObject({ branch: "Win_x64", archiveName: "chrome-win.zip", cacheDirName: "chromium-win-x64" });
    expect(snapshotFor("win32", "ia32")).toMatchObject({ branch: "Win", archiveName: "chrome-win.zip" });
    expect(snapshotFor("win32", "arm64")).toMatchObject({ branch: "Win_Arm64", archiveName: "chrome-win.zip" });
    expect(snapshotFor("linux", "x64")).toMatchObject({ branch: "Linux_x64", archiveName: "chrome-linux.zip", cacheDirName: "chromium-linux-x64" });
    expect(snapshotFor("win32", "x64")!.binaryInsideArchive).toBe(path.join("chrome-win", "chrome.exe"));
    expect(snapshotFor("linux", "x64")!.binaryInsideArchive).toBe(path.join("chrome-linux", "chrome"));
    expect(snapshotFor("darwin", "arm64")!.binaryInsideArchive).toBe(BINARY_INSIDE_ARCHIVE);
  });

  it("для неизвестной платформы сборки нет", () => {
    expect(snapshotFor("linux", "arm64")).toBeNull();
    expect(snapshotFor("freebsd", "x64")).toBeNull();
  });
});

// SDA-30: на Windows браузер не стартовал с "An `executablePath` or `channel` must be
// specified for `puppeteer-core`" - в приложении не оказалось chrome.exe, chromium.path пуст.
describe("resolveBrowserPath - в приложении нет бинарника Chromium", () => {
  /** Распаковка, которая кладёт бинарник по указанному пути внутри архива. */
  const extractCreating = (binaryInsideArchive: string) =>
    jest.fn(async (_archive: string, destDir: string) => {
      const binary = path.join(destDir, binaryInsideArchive);
      fs.mkdirSync(path.dirname(binary), { recursive: true });
      fs.writeFileSync(binary, "");
    });

  it.each([
    ["win32", "x64", "Win_x64", "chrome-win.zip", path.join("chrome-win", "chrome.exe")],
    ["linux", "x64", "Linux_x64", "chrome-linux.zip", path.join("chrome-linux", "chrome")],
    ["darwin", "x64", "Mac", "chrome-mac.zip", BINARY_INSIDE_ARCHIVE],
  ])("%s/%s: качает сборку %s в кеш и отдаёт бинарник из неё", async (platform, arch, branch, archive, binaryInside) => {
    const cacheRoot = makeCacheRoot();
    const deps = makeDeps({ platform, arch, cacheRoot, bundledPath: undefined, extract: extractCreating(binaryInside) });

    const result = await resolveBrowserPath(deps);

    expect(result).toBe(path.join(cacheRoot, "1688726", binaryInside));
    expect(fs.existsSync(result)).toBe(true);
    expect(deps.fetchText).toHaveBeenCalledWith(expect.stringContaining(`/${branch}/LAST_CHANGE`));
    expect(deps.download).toHaveBeenCalledWith(
      expect.stringContaining(`/${branch}/1688726/${archive}`),
      expect.any(String)
    );
  });

  it("скачанная раньше сборка переиспользуется, сеть не трогаем", async () => {
    const cacheRoot = makeCacheRoot();
    const binary = path.join(cacheRoot, "1700000", "chrome-win", "chrome.exe");
    fs.mkdirSync(path.dirname(binary), { recursive: true });
    fs.writeFileSync(binary, "");
    const deps = makeDeps({ platform: "win32", arch: "x64", cacheRoot, bundledPath: undefined });

    await expect(resolveBrowserPath(deps)).resolves.toBe(binary);
    expect(deps.fetchText).not.toHaveBeenCalled();
    expect(deps.download).not.toHaveBeenCalled();
  });

  it("бинарник в приложении важнее кеша: при наличии обоих берём тот, что в приложении", async () => {
    const cacheRoot = makeCacheRoot();
    const cached = path.join(cacheRoot, "1700000", "chrome-win", "chrome.exe");
    fs.mkdirSync(path.dirname(cached), { recursive: true });
    fs.writeFileSync(cached, "");
    const deps = makeDeps({ platform: "win32", arch: "x64", cacheRoot });

    await expect(resolveBrowserPath(deps)).resolves.toBe(BUNDLED);
  });

  it("чужая кеш-папка с mac-раскладкой не считается сборкой для Windows", async () => {
    const cacheRoot = makeCacheRoot();
    seedCachedRevision(cacheRoot, "1700000"); // chrome-mac/... внутри
    const deps = makeDeps({
      platform: "win32", arch: "x64", cacheRoot, bundledPath: undefined,
      extract: extractCreating(path.join("chrome-win", "chrome.exe")),
    });

    const result = await resolveBrowserPath(deps);

    expect(result).toBe(path.join(cacheRoot, "1688726", "chrome-win", "chrome.exe"));
    expect(deps.download).toHaveBeenCalled();
  });

  it("платформа без известной сборки - понятная ошибка, а не undefined в puppeteer", async () => {
    const cacheRoot = makeCacheRoot();
    const deps = makeDeps({ platform: "linux", arch: "arm64", cacheRoot, bundledPath: undefined });

    await expect(resolveBrowserPath(deps)).rejects.toThrow(/нет браузера Chromium для linux\/arm64/);
    expect(deps.fetchText).not.toHaveBeenCalled();
    expect(deps.download).not.toHaveBeenCalled();
  });

  it("оборванное скачивание не оставляет папку ревизии в кеше", async () => {
    const cacheRoot = makeCacheRoot();
    const deps = makeDeps({
      platform: "win32", arch: "x64", cacheRoot, bundledPath: undefined,
      download: jest.fn(async () => { throw new Error("socket hang up"); }),
    });

    await expect(resolveBrowserPath(deps)).rejects.toThrow(/socket hang up/);
    expect(fs.existsSync(path.join(cacheRoot, "1688726"))).toBe(false);
    expect(deps.extract).not.toHaveBeenCalled();
  });

  it("упавшая распаковка тоже не оставляет полусобранную ревизию", async () => {
    const cacheRoot = makeCacheRoot();
    const deps = makeDeps({
      platform: "win32", arch: "x64", cacheRoot, bundledPath: undefined,
      extract: jest.fn(async (_archive: string, destDir: string) => {
        fs.mkdirSync(path.join(destDir, "chrome-win"), { recursive: true });
        fs.writeFileSync(path.join(destDir, "chrome-win", "half.dll"), "");
        throw new Error("invalid zip");
      }),
    });

    await expect(resolveBrowserPath(deps)).rejects.toThrow(/invalid zip/);
    expect(fs.existsSync(path.join(cacheRoot, "1688726"))).toBe(false);
  });
});

// Настоящая распаковка, без подмен: на Windows и Linux работает extract-zip, на macOS - ditto.
// CI гоняет тесты на Windows и macOS, так что проверяются обе ветки.
describe("extractArchive", () => {
  it("распаковывает архив сборки вместе с вложенными папками", async () => {
    const destDir = makeCacheRoot();
    const archive = path.join(__dirname, "fixtures", "chrome-stub.zip");

    await extractArchive(archive, destDir);

    const binary = path.join(destDir, "chrome-win", "chrome.exe");
    expect(fs.readFileSync(binary, "utf8")).toBe("stub browser binary\n");
    expect(fs.existsSync(path.join(destDir, "chrome-win", "locales", "en-US.pak"))).toBe(true);
    if (process.platform !== "win32") {
      // Бит исполнения из архива должен сохраниться, иначе chrome на Linux не запустится.
      expect(fs.statSync(binary).mode & 0o111).not.toBe(0);
    }
  });

  it("битый архив - ошибка, а не тихий успех", async () => {
    const destDir = makeCacheRoot();
    const broken = path.join(destDir, "broken.zip");
    fs.writeFileSync(broken, "this is not a zip archive");

    await expect(extractArchive(broken, path.join(destDir, "out"))).rejects.toBeTruthy();
  });
});
