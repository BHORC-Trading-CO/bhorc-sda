import { execFile } from "child_process";
import fs from "fs";
import fsp from "fs/promises";
import https from "https";
import os from "os";
import path from "path";
import { app } from "electron";
import { t } from "../../../i18n";

const chromium = require("chromium");

/**
 * Откуда puppeteer берёт исполняемый файл браузера.
 *
 * На Windows и Linux — из npm-пакета chromium, как и раньше.
 *
 * На Apple Silicon так нельзя: node-chromium умеет качать только x86_64-сборку
 * (в его utils.js для darwin захардкожено `url += 'Mac'`, ветки Mac_Arm нет).
 * Такой бинарник идёт через Rosetta и падает раньше, чем откроет
 * DevTools-сокет, а puppeteer отваливается по 30-секундному таймауту с
 * "Timed out ... while trying to connect to the browser". Воспроизводится на
 * обеих доступных x86_64-сборках: свежая (154) убивается ассертом Rosetta
 * "code fragment does not contain the given arm address", а та ревизия, что
 * тянет сам puppeteer (109, r1069273), получает SIGTRAP внутри Swift-овского
 * Foundation на macOS 26.
 *
 * Поэтому на darwin/arm64 берём нативную arm64-сборку из того же хранилища
 * снапшотов Chromium, только из ветки Mac_Arm. Ревизия фиксируется при первом
 * скачивании и дальше переиспользуется — ровно так же, как node-chromium
 * фиксирует ревизию на момент npm install. Версия при этом совпадает с той,
 * что получает Windows, так что отпечаток браузера между платформами не
 * расходится.
 */

const SNAPSHOTS_BASE = "https://storage.googleapis.com/chromium-browser-snapshots";

/** Путь до бинарника внутри распакованного архива (macOS). */
export const BINARY_INSIDE_ARCHIVE = path.join(
  "chrome-mac",
  "Chromium.app",
  "Contents",
  "MacOS",
  "Chromium"
);

/**
 * Откуда качать сборку Chromium, когда в самом приложении её нет.
 *
 * На Apple Silicon это штатный путь (см. комментарий выше). На остальных
 * платформах — запасной: node-chromium качает браузер в postinstall и ГЛОТАЕТ
 * любую ошибку (install.js только пишет её в консоль, npm install завершается
 * успешно), а готовый chrome.exe из распакованной сборки может убрать антивирус.
 * В обоих случаях chromium.path пуст, и puppeteer раньше падал с невнятным
 * "An `executablePath` or `channel` must be specified for `puppeteer-core`" (SDA-30).
 * Теперь в такой ситуации качаем ту же сборку в userData — так же, как на arm64-маке.
 */
export interface BrowserSnapshot {
  /** Ветка в хранилище снапшотов Chromium. */
  branch: string;
  archiveName: string;
  /** Путь до бинарника внутри распакованного архива. */
  binaryInsideArchive: string;
  /** Имя папки кеша в userData. */
  cacheDirName: string;
}

export function snapshotFor(platform: string, arch: string): BrowserSnapshot | null {
  if (platform === "darwin" && (arch === "arm64" || arch === "x64")) {
    return {
      branch: arch === "arm64" ? "Mac_Arm" : "Mac",
      archiveName: "chrome-mac.zip",
      binaryInsideArchive: BINARY_INSIDE_ARCHIVE,
      cacheDirName: `chromium-mac-${arch}`,
    };
  }
  if (platform === "win32" && (arch === "x64" || arch === "ia32" || arch === "arm64")) {
    const branch = arch === "x64" ? "Win_x64" : arch === "arm64" ? "Win_Arm64" : "Win";
    return {
      branch,
      archiveName: "chrome-win.zip",
      binaryInsideArchive: path.join("chrome-win", "chrome.exe"),
      cacheDirName: `chromium-win-${arch}`,
    };
  }
  if (platform === "linux" && arch === "x64") {
    return {
      branch: "Linux_x64",
      archiveName: "chrome-linux.zip",
      binaryInsideArchive: path.join("chrome-linux", "chrome"),
      cacheDirName: "chromium-linux-x64",
    };
  }
  return null;
}

export interface ResolveBrowserDeps {
  platform: string;
  arch: string;
  /** Куда складывать скачанные сборки (по умолчанию — userData приложения). */
  cacheRoot: string;
  /**
   * Путь из npm-пакета chromium — используется на всех платформах кроме darwin/arm64.
   * Пусто, если бинарника в приложении нет (chromium.path сам проверяет наличие файла).
   */
  bundledPath: string | undefined;
  fetchText: (url: string) => Promise<string>;
  download: (url: string, destFile: string) => Promise<void>;
  extract: (archive: string, destDir: string) => Promise<void>;
}

/**
 * Нужна ли нативная arm64-сборка вместо той, что кладёт node-chromium.
 * Вынесено отдельно, чтобы условие было видно и в тестах.
 */
export function needsNativeArmBrowser(platform: string, arch: string): boolean {
  return platform === "darwin" && arch === "arm64";
}

function httpsGet(url: string, onResponse: (res: any) => void, reject: (err: any) => void, redirectsLeft = 5) {
  https
    .get(url, (res) => {
      const status = res.statusCode || 0;
      if (status >= 300 && status < 400 && res.headers.location) {
        res.resume();
        if (redirectsLeft <= 0) return reject(new Error(t("errors.chromium.tooManyRedirects", { url })));
        return httpsGet(res.headers.location, onResponse, reject, redirectsLeft - 1);
      }
      if (status !== 200) {
        res.resume();
        return reject(new Error(t("errors.chromium.httpStatus", { url, status })));
      }
      onResponse(res);
    })
    .on("error", reject);
}

function defaultFetchText(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    httpsGet(
      url,
      (res) => {
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (chunk: string) => (body += chunk));
        res.on("end", () => resolve(body.trim()));
        res.on("error", reject);
      },
      reject
    );
  });
}

function defaultDownload(url: string, destFile: string): Promise<void> {
  return new Promise((resolve, reject) => {
    httpsGet(
      url,
      (res) => {
        const file = fs.createWriteStream(destFile);
        res.pipe(file);
        file.on("finish", () => file.close(() => resolve()));
        file.on("error", reject);
        res.on("error", reject);
      },
      reject
    );
  });
}

/**
 * Распаковываем через ditto, а не unzip: это родной для macOS инструмент,
 * который корректно переносит бандл .app вместе с правами и ad-hoc подписью.
 * Без валидной подписи arm64-бинарник просто не запустится.
 */
export function extractArchive(archive: string, destDir: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (process.platform !== "darwin") {
      // На Windows и Linux ditto нет; extract-zip сохраняет права из архива (бит
      // исполнения у chrome на Linux) и не зависит от того, что стоит в системе.
      // require здесь, а не наверху: модуль нужен только в этой ветке.
      const extractZip = require("extract-zip");
      return extractZip(archive, { dir: destDir }, (err: Error | undefined) => {
        if (err) return reject(err);
        resolve();
      });
    }
    execFile("/usr/bin/ditto", ["-x", "-k", archive, destDir], (err) => {
      if (err) return reject(err);
      resolve();
    });
  });
}

function defaultDeps(): ResolveBrowserDeps {
  const snapshot = snapshotFor(process.platform, process.arch);
  return {
    platform: process.platform,
    arch: process.arch,
    // Для darwin/arm64 это прежняя папка chromium-mac-arm64: уже скачанные сборки остаются в деле.
    cacheRoot: path.join(app.getPath("userData"), snapshot ? snapshot.cacheDirName : "chromium"),
    bundledPath: chromium.path,
    fetchText: defaultFetchText,
    download: defaultDownload,
    extract: extractArchive,
  };
}

/** Уже скачанная ревизия, если она на месте и бинарник цел. */
function findCachedBinary(cacheRoot: string, binaryInsideArchive: string): string | null {
  let entries: string[];
  try {
    entries = fs.readdirSync(cacheRoot);
  } catch {
    return null;
  }

  for (const entry of entries.sort().reverse()) {
    const binary = path.join(cacheRoot, entry, binaryInsideArchive);
    if (fs.existsSync(binary)) return binary;
  }
  return null;
}

/**
 * Скачивания, которые идут прямо сейчас. Браузеры нескольких аккаунтов можно запустить
 * одновременно, и без этого каждый запуск качал бы сборку сам и распаковывал её в ту же
 * папку ревизии поверх соседа. Все одновременные запуски ждут одно скачивание.
 */
const inFlight = new Map<string, Promise<string>>();

export function resolveBrowserPath(
  overrides: Partial<ResolveBrowserDeps> = {}
): Promise<string> {
  const deps: ResolveBrowserDeps = { ...defaultDeps(), ...overrides };
  const key = [deps.cacheRoot, deps.platform, deps.arch, deps.bundledPath || ""].join("|");

  const running = inFlight.get(key);
  if (running) return running;

  const attempt = resolveOnce(deps).finally(() => {
    if (inFlight.get(key) === attempt) inFlight.delete(key);
  });
  inFlight.set(key, attempt);
  return attempt;
}

async function resolveOnce(deps: ResolveBrowserDeps): Promise<string> {
  const nativeArm = needsNativeArmBrowser(deps.platform, deps.arch);
  if (!nativeArm && deps.bundledPath) return deps.bundledPath;

  const snapshot = snapshotFor(deps.platform, deps.arch);
  if (!snapshot) {
    // Ни бинарника в приложении, ни известной сборки для этой платформы.
    throw new Error(t("errors.chromium.bundledMissing", { platform: `${deps.platform}/${deps.arch}` }));
  }

  const cached = findCachedBinary(deps.cacheRoot, snapshot.binaryInsideArchive);
  if (cached) return cached;

  if (!nativeArm) {
    console.log(`В приложении нет бинарника Chromium (${deps.platform}/${deps.arch}) - качаем сборку ${snapshot.branch}`);
  }

  const revision = await deps.fetchText(`${SNAPSHOTS_BASE}/${snapshot.branch}/LAST_CHANGE`);
  if (!/^\d+$/.test(revision)) {
    throw new Error(t("errors.chromium.revision", { branch: snapshot.branch, revision }));
  }

  const revisionDir = path.join(deps.cacheRoot, revision);
  await fsp.mkdir(revisionDir, { recursive: true });

  // Качаем во временный файл: если скачивание оборвётся, в кеше не останется
  // наполовину распакованной сборки, которую следующий запуск примет за готовую.
  const tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), "bhorc-sda-chromium-"));
  const tmpArchive = path.join(tmpDir, snapshot.archiveName);

  console.log(`Скачиваем сборку Chromium ${snapshot.branch} (ревизия ${revision})...`);
  try {
    await deps.download(
      `${SNAPSHOTS_BASE}/${snapshot.branch}/${revision}/${snapshot.archiveName}`,
      tmpArchive
    );
    await deps.extract(tmpArchive, revisionDir);
  } catch (err) {
    // Оборванное скачивание или распаковка: папку ревизии убираем, иначе в ней
    // останется часть файлов (без бинарника её и так не примут за готовую, но место займёт).
    await fsp.rm(revisionDir, { recursive: true, force: true });
    throw err;
  } finally {
    await fsp.rm(tmpDir, { recursive: true, force: true });
  }

  const binary = path.join(revisionDir, snapshot.binaryInsideArchive);
  if (!fs.existsSync(binary)) {
    await fsp.rm(revisionDir, { recursive: true, force: true });
    throw new Error(t("errors.chromium.binaryMissing", { binary }));
  }

  console.log(`Сборка Chromium ${snapshot.branch} готова: ${binary}`);
  return binary;
}

export default resolveBrowserPath;
