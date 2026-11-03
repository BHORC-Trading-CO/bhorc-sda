import { execFile } from "child_process";
import fs from "fs";
import fsp from "fs/promises";
import https from "https";
import os from "os";
import path from "path";
import { app } from "electron";

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
const MAC_ARM_BRANCH = "Mac_Arm";
const ARCHIVE_NAME = "chrome-mac.zip";

/** Путь до бинарника внутри распакованного архива. */
export const BINARY_INSIDE_ARCHIVE = path.join(
  "chrome-mac",
  "Chromium.app",
  "Contents",
  "MacOS",
  "Chromium"
);

export interface ResolveBrowserDeps {
  platform: string;
  arch: string;
  /** Куда складывать скачанные сборки (по умолчанию — userData приложения). */
  cacheRoot: string;
  /** Путь из npm-пакета chromium — используется на всех платформах кроме darwin/arm64. */
  bundledPath: string;
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
        if (redirectsLeft <= 0) return reject(new Error(`Слишком много редиректов: ${url}`));
        return httpsGet(res.headers.location, onResponse, reject, redirectsLeft - 1);
      }
      if (status !== 200) {
        res.resume();
        return reject(new Error(`${url} ответил ${status}`));
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
function defaultExtract(archive: string, destDir: string): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile("/usr/bin/ditto", ["-x", "-k", archive, destDir], (err) => {
      if (err) return reject(err);
      resolve();
    });
  });
}

function defaultDeps(): ResolveBrowserDeps {
  return {
    platform: process.platform,
    arch: process.arch,
    cacheRoot: path.join(app.getPath("userData"), "chromium-mac-arm64"),
    bundledPath: chromium.path,
    fetchText: defaultFetchText,
    download: defaultDownload,
    extract: defaultExtract,
  };
}

/** Уже скачанная ревизия, если она на месте и бинарник цел. */
function findCachedBinary(cacheRoot: string): string | null {
  let entries: string[];
  try {
    entries = fs.readdirSync(cacheRoot);
  } catch {
    return null;
  }

  for (const entry of entries.sort().reverse()) {
    const binary = path.join(cacheRoot, entry, BINARY_INSIDE_ARCHIVE);
    if (fs.existsSync(binary)) return binary;
  }
  return null;
}

export async function resolveBrowserPath(
  overrides: Partial<ResolveBrowserDeps> = {}
): Promise<string> {
  const deps: ResolveBrowserDeps = { ...defaultDeps(), ...overrides };

  if (!needsNativeArmBrowser(deps.platform, deps.arch)) return deps.bundledPath;

  const cached = findCachedBinary(deps.cacheRoot);
  if (cached) return cached;

  const revision = await deps.fetchText(`${SNAPSHOTS_BASE}/${MAC_ARM_BRANCH}/LAST_CHANGE`);
  if (!/^\d+$/.test(revision)) {
    throw new Error(`Не удалось определить ревизию Chromium для arm64: получено "${revision}"`);
  }

  const revisionDir = path.join(deps.cacheRoot, revision);
  await fsp.mkdir(revisionDir, { recursive: true });

  // Качаем во временный файл: если скачивание оборвётся, в кеше не останется
  // наполовину распакованной сборки, которую следующий запуск примет за готовую.
  const tmpArchive = path.join(
    await fsp.mkdtemp(path.join(os.tmpdir(), "bhorc-sda-chromium-")),
    ARCHIVE_NAME
  );

  console.log(`Скачиваем arm64-сборку Chromium (ревизия ${revision})...`);
  await deps.download(
    `${SNAPSHOTS_BASE}/${MAC_ARM_BRANCH}/${revision}/${ARCHIVE_NAME}`,
    tmpArchive
  );
  await deps.extract(tmpArchive, revisionDir);
  await fsp.rm(path.dirname(tmpArchive), { recursive: true, force: true });

  const binary = path.join(revisionDir, BINARY_INSIDE_ARCHIVE);
  if (!fs.existsSync(binary)) {
    await fsp.rm(revisionDir, { recursive: true, force: true });
    throw new Error(`В скачанном архиве Chromium нет бинарника: ${binary}`);
  }

  console.log(`arm64-сборка Chromium готова: ${binary}`);
  return binary;
}

export default resolveBrowserPath;
