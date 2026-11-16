import { execFile } from "child_process";
import fs from "fs";
import fsp from "fs/promises";
import https from "https";
import { pipeline } from "stream";
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
 * скачивании и дальше переиспользуется — так же, как node-chromium фиксирует
 * ревизию на момент npm install. Одинаковой версии на разных машинах это не
 * гарантирует: каждая берёт последнюю ревизию на момент своего скачивания.
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

/** Что в архиве снапшота лишнее для работы браузера (пути внутри архива). */
export const BROWSER_TEST_BINARIES = [path.join("chrome-win", "interactive_ui_tests.exe")];

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
  /** signal срабатывает, когда распаковку бросили по таймауту: её нужно остановить, если это возможно. */
  extract: (archive: string, destDir: string, signal?: AbortSignal) => Promise<void>;
  /** Сколько ждать распаковку. Битый архив extract-zip может не закончить никогда. */
  extractTimeoutMs: number;
}

/** Нет данных от сервера дольше этого — соединение считаем зависшим. */
export const NETWORK_IDLE_TIMEOUT_MS = 60_000;
export const EXTRACT_TIMEOUT_MS = 10 * 60_000;

/**
 * Нужна ли нативная arm64-сборка вместо той, что кладёт node-chromium.
 * Вынесено отдельно, чтобы условие было видно и в тестах.
 */
export function needsNativeArmBrowser(platform: string, arch: string): boolean {
  return platform === "darwin" && arch === "arm64";
}

type HttpGet = (url: string, callback: (res: any) => void) => { setTimeout: Function; destroy: Function; on: Function };
export interface NetworkOptions {
  get: HttpGet;
  idleTimeoutMs: number;
}
const defaultNetwork = (): NetworkOptions => ({ get: https.get as unknown as HttpGet, idleTimeoutMs: NETWORK_IDLE_TIMEOUT_MS });

/**
 * GET с редиректами и двумя таймаутами. Без них оборванное без RST соединение (сон, смена сети,
 * VPN) не завершилось бы никогда, а скачивание одно на все запуски браузера — зависли бы все
 * аккаунты до перезапуска приложения.
 *
 * - до заголовков ответа — обычный таймер: таймаут сокета начинает считать только после
 *   соединения и зависший DNS или connect не ловит;
 * - после заголовков — таймаут простоя сокета: тело может качаться минутами, важно, чтобы шло.
 */
export function httpsGet(
  url: string,
  onResponse: (res: any) => void,
  reject: (err: any) => void,
  redirectsLeft = 5,
  network: NetworkOptions = defaultNetwork()
) {
  const timeoutError = () =>
    new Error(t("errors.chromium.timeout", { url, seconds: Math.round(network.idleTimeoutMs / 1000) }));
  // Шаг, с которого ушли по редиректу, больше ничего не решает: его таймаут и его ошибки
  // не должны обрывать уже идущее скачивание со следующего адреса.
  let retired = false;
  let headersTimer: ReturnType<typeof setTimeout> | undefined;
  let req: ReturnType<HttpGet>;
  try {
    req = network.get(url, (res) => {
      clearTimeout(headersTimer);
      const status = res.statusCode || 0;
      if (status >= 300 && status < 400 && res.headers.location) {
        retired = true;
        res.resume();
        if (redirectsLeft <= 0) {
          req.destroy();
          return reject(new Error(t("errors.chromium.tooManyRedirects", { url })));
        }
        let next: string;
        try {
          // Location бывает относительным.
          next = new URL(res.headers.location, url).toString();
        } catch (err) {
          req.destroy();
          return reject(err);
        }
        req.destroy();
        return httpsGet(next, onResponse, reject, redirectsLeft - 1, network);
      }
      if (status !== 200) {
        retired = true;
        // Тело ответа с ошибкой не нужно: соединение закрываем сразу, иначе недосланное
        // тело держало бы его открытым уже без таймаута.
        req.destroy();
        return reject(new Error(t("errors.chromium.httpStatus", { url, status })));
      }
      onResponse(res);
    });
  } catch (err) {
    // Адрес, который нельзя открыть (например, редирект с https на http://), бросает сразу,
    // внутри колбэка ответа — без этого исключение ушло бы мимо промиса.
    return reject(err);
  }
  headersTimer = setTimeout(() => {
    if (!retired) req.destroy(timeoutError());
  }, network.idleTimeoutMs);
  req.setTimeout(network.idleTimeoutMs, () => {
    if (!retired) req.destroy(timeoutError());
  });
  req.on("error", (err: unknown) => {
    clearTimeout(headersTimer);
    if (!retired) reject(err);
  });
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

/**
 * Пишет тело ответа в файл и сообщает об исходе только после того, как файл закрыт.
 *
 * pipeline при ошибке сам уничтожает поток записи, но о результате сообщает раньше, чем
 * закроется дескриптор. На Windows в этот промежуток файл ещё открыт, временную папку убрать
 * нельзя (ENOTEMPTY — так упал тест на раннере Windows), и ошибка уборки заслонила бы
 * настоящую. Длину сверяем с Content-Length: обрезанный архив не должен дойти до распаковки.
 */
export function saveResponseToFile(res: any, destFile: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const expected = Number(res.headers && res.headers["content-length"]);
    const file = fs.createWriteStream(destFile);
    let closed = false;
    file.once("close", () => (closed = true));
    const afterClose = (done: () => void) => (closed ? done() : file.once("close", done));

    pipeline(res, file, (err) => {
      if (err) return afterClose(() => reject(err));
      afterClose(() => {
        if (!Number.isFinite(expected) || expected <= 0) return resolve();
        fs.stat(destFile, (statErr, stat) => {
          if (statErr) return reject(statErr);
          if (stat.size !== expected) {
            return reject(new Error(t("errors.chromium.sizeMismatch", { got: stat.size, expected })));
          }
          resolve();
        });
      });
    });
  });
}

function defaultDownload(url: string, destFile: string): Promise<void> {
  return new Promise((resolve, reject) => {
    // Когда тело уже пишется, исход решает только запись: она закрывает файл и лишь потом
    // сообщает об ошибке. Ошибка запроса пришла бы раньше, и временную папку начали бы
    // убирать при ещё открытом файле.
    let writing = false;
    httpsGet(
      url,
      (res) => {
        writing = true;
        saveResponseToFile(res, destFile).then(resolve, reject);
      },
      (err) => {
        if (!writing) reject(err);
      }
    );
  });
}

/**
 * Распаковываем через ditto, а не unzip: это родной для macOS инструмент,
 * который корректно переносит бандл .app вместе с правами и ad-hoc подписью.
 * Без валидной подписи arm64-бинарник просто не запустится.
 */
export function extractArchive(archive: string, destDir: string, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (process.platform !== "darwin") {
      // На Windows и Linux ditto нет; extract-zip сохраняет права из архива (бит
      // исполнения у chrome на Linux) и не зависит от того, что стоит в системе.
      // Остановить его нельзя: при отмене он может ещё дописывать файлы в свою папку,
      // поэтому у каждой попытки папка своя, а брошенные убираются перед следующим скачиванием.
      const extractZip = require("extract-zip");
      return extractZip(archive, { dir: destDir }, (err: Error | undefined) => {
        if (err) return reject(err);
        resolve();
      });
    }
    // signal убивает процесс ditto, если распаковку отменили по таймауту.
    execFile("/usr/bin/ditto", ["-x", "-k", archive, destDir], { signal }, (err) => {
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
    extractTimeoutMs: EXTRACT_TIMEOUT_MS,
  };
}

/** Папка готовой ревизии называется её номером; всё остальное в кеше — недоделанное. */
const REVISION_DIR = /^\d+$/;
const PARTIAL_MARK = ".partial-";

/** Уже скачанная ревизия, если она на месте и бинарник цел. */
function findCachedBinary(cacheRoot: string, binaryInsideArchive: string): string | null {
  let entries: string[];
  try {
    entries = fs.readdirSync(cacheRoot);
  } catch {
    return null;
  }

  // Только папки-номера: в «<ревизия>.partial-…» распаковка могла оборваться, а бинарник
  // в архиве идёт одним из первых — по его наличию недораспакованную сборку не отличить.
  for (const entry of entries.filter((name) => REVISION_DIR.test(name)).sort().reverse()) {
    const binary = path.join(cacheRoot, entry, binaryInsideArchive);
    if (fs.existsSync(binary)) return binary;
  }
  return null;
}

const PARTIAL_DIR = /^\d+\.partial-/;

/**
 * Убирает из кеша лишнее. Брошенные распаковки («<ревизия>.partial-…») — всегда. Папки ревизий —
 * только когда есть чем их заменить (keep): пока новая сборка не встала на место, старую не
 * трогаем, даже если сейчас она выглядит негодной.
 */
async function pruneCache(cacheRoot: string, keep: string | null): Promise<void> {
  let entries: string[] = [];
  try {
    entries = await fsp.readdir(cacheRoot);
  } catch {
    return;
  }
  for (const entry of entries) {
    const stale = PARTIAL_DIR.test(entry) || (keep !== null && entry !== keep && REVISION_DIR.test(entry));
    if (!stale) continue;
    // Не получилось убрать (файл занят) — не повод не запускать браузер.
    await fsp.rm(path.join(cacheRoot, entry), { recursive: true, force: true }).catch(() => undefined);
  }
}

/** rename папки с только что распакованными exe на Windows может упереться в антивирус. */
async function renameWithRetry(from: string, to: string): Promise<void> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fsp.rename(from, to);
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (attempt >= 5 || !["EPERM", "EBUSY", "EACCES"].includes(code || "")) throw err;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
}

function withTimeout<T>(work: Promise<T>, ms: number, onTimeout: () => Error): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(onTimeout()), ms);
    work.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (err) => { clearTimeout(timer); reject(err); }
    );
  });
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

  await fsp.mkdir(deps.cacheRoot, { recursive: true });
  // Брошенные распаковки прошлых запусков: место занимают, а готовыми не станут.
  // Папки ревизий здесь не трогаем: заменить их пока нечем.
  await pruneCache(deps.cacheRoot, null);

  const revisionDir = path.join(deps.cacheRoot, revision);
  // Распаковываем НЕ в папку ревизии: если приложение закроют посреди распаковки, в ней
  // остался бы бинарник без половины файлов, и следующие запуски брали бы эту сборку вечно.
  // Папка получает имя ревизии только целиком распакованной и проверенной.
  const partialDir = `${revisionDir}${PARTIAL_MARK}${process.pid}-${Date.now()}`;
  const tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), "bhorc-sda-chromium-"));
  const tmpArchive = path.join(tmpDir, snapshot.archiveName);

  console.log(`Скачиваем сборку Chromium ${snapshot.branch} (ревизия ${revision})...`);
  try {
    await deps.download(
      `${SNAPSHOTS_BASE}/${snapshot.branch}/${revision}/${snapshot.archiveName}`,
      tmpArchive
    );
    await fsp.mkdir(partialDir, { recursive: true });
    const abortExtract = new AbortController();
    await withTimeout(
      deps.extract(tmpArchive, partialDir, abortExtract.signal),
      deps.extractTimeoutMs,
      () => {
        abortExtract.abort();
        return new Error(t("errors.chromium.extractTimeout", { minutes: Math.max(1, Math.round(deps.extractTimeoutMs / 60_000)) }));
      }
    );

    if (!fs.existsSync(path.join(partialDir, snapshot.binaryInsideArchive))) {
      throw new Error(t("errors.chromium.binaryMissing", { binary: path.join(revisionDir, snapshot.binaryInsideArchive) }));
    }
    // В снапшоте для Windows лежит тестовый бинарник на ~390 МБ, браузеру он не нужен.
    for (const extra of BROWSER_TEST_BINARIES) {
      await fsp.rm(path.join(partialDir, extra), { force: true }).catch(() => undefined);
    }

    await fsp.rm(revisionDir, { recursive: true, force: true });
    await renameWithRetry(partialDir, revisionDir);
  } catch (err) {
    await fsp.rm(partialDir, { recursive: true, force: true }).catch(() => undefined);
    throw err;
  } finally {
    // Уборка не должна заслонить настоящую ошибку скачивания.
    await fsp.rm(tmpDir, { recursive: true, force: true }).catch(() => undefined);
  }

  // Прежние ревизии больше не нужны: каждая — сотни мегабайт.
  await pruneCache(deps.cacheRoot, revision);

  const binary = path.join(revisionDir, snapshot.binaryInsideArchive);
  console.log(`Сборка Chromium ${snapshot.branch} готова: ${binary}`);
  return binary;
}

export default resolveBrowserPath;
