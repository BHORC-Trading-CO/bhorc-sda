import downloadImage from "../../someFuncs/downloadImage";
import sanitizeAvatarUrl from "../../Functions/sanitizeAvatarUrl";
import fs from "fs/promises";
import puppeteerDefault, { Browser, Page, Target } from "puppeteer";
import puppeteer from "puppeteer-extra";
import puppeteerStealth from "puppeteer-extra-plugin-stealth";
puppeteer.use(require("puppeteer-extra-plugin-minmax")());
const stealth = puppeteerStealth();
// Эвейжен iframe.contentWindow для srcdoc-iframe до вставки в DOM подменяет
// contentWindow прокси на ВЕРХНИЙ window. Скрипты фингерпринтинга (FingerprintJS
// на cs.money и др.) пишут в "iframe" тестовый текст ("word word …",
// "mmMwWLliI0fiflO&1") и ставят body ширину 4000px — а попадает это в саму
// страницу: мусор в футере и растянутая вёрстка. Нужен он только для старого
// headless-бага Chromium, мы запускаем headful — отключаем.
stealth.enabledEvasions.delete("iframe.contentWindow");
puppeteer.use(stealth);
import { app } from "electron";
import SteamAccountInterface from "../../../interfaces/SteamAccount/SteamAccountInterface";
import Manager from "../../Manager/Manager";
import buildProxyUrl from "../../Proxy/proxyUrl";
import ProxyUnavailableError from "../../Proxy/ProxyUnavailableError";
import { t } from "../../../i18n";
import application from "../../application/application";
import SteamAccountChannels from "../../../interfaces/IpcChannels/SteamAccountChannels";
import path from "path";
import LocalState from "./LocalState";
import BrowserSettingsStorage from "../../newStorage/BrowserSettingsStorage";
import { effectiveStartLinks, launchExtensionPaths } from "../../Browser/browserSettings";
import { ProxyGeo, localeForCountry, acceptLanguageFor } from "../Functions/getProxyGeo";
import resolveBrowserPath from "./resolveBrowserPath";
import { ensureSecureDnsOff, writeLocalState } from "./secureDnsPref";
const sharp = require("sharp");

type StartCancelReason = "superseded" | "stopped" | "routeChanged";
export class BrowserStartCancelledError extends Error {
  constructor(public readonly reason: StartCancelReason) {
    super(`Browser start cancelled: ${reason}`);
    this.name = "BrowserStartCancelledError";
  }
}
export const BROWSER_CLOSE_TIMEOUT_MS = 3000;
/** Сколько ждать аватар при создании профиля: он не должен держать запуск браузера. */
export const AVATAR_TIMEOUT_MS = 10000;
/**
 * SDA-33: сколько ждать вкладки прошлого сеанса после запуска (Chromium открывает их не сразу)
 * и как часто проверять. Ждём, только если сеанс есть на диске; обычно ожидание кончается, как
 * только вкладки появились и их число перестало расти. Полный срок уходит, лишь когда сеанс на
 * диске есть, а вернулись одни пустые вкладки (например, после аварийного закрытия Chromium
 * показывает «Восстановить страницы?» вместо восстановления). Не появились за срок —
 * восстанавливать нечего.
 */
export const RESTORE_WAIT_MS = 5000;
export const RESTORE_POLL_MS = 200;
/**
 * SDA-33: попытки убрать папку сеанса (переименованием, см. forgetPreviousTabs). Закрывающийся
 * Chromium (на Windows — и антивирус) может держать файлы: пробуем несколько раз с короткой паузой.
 */
export const SESSION_REMOVE_ATTEMPTS = 4;
export const SESSION_REMOVE_RETRY_MS = 250;
const SESSION_REMOVE_RETRY_CODES = ["EBUSY", "EPERM", "ENOTEMPTY"];
/**
 * SDA-33: папки сеанса Chromium в Default. Sessions — открытая (с Chrome 85), Sessions_Encrypted —
 * зашифрованная (с Chrome 148, crbug.com/479420496): сначала пишутся обе и читается открытая, позже
 * источником становится зашифрованная. Убираем обе, других имён не трогаем.
 */
export const SESSION_FOLDERS = ["Sessions", "Sessions_Encrypted"] as const;
export type SessionFolder = typeof SESSION_FOLDERS[number];
/**
 * SDA-33: брошенная папка сеанса — Default/<папка сеанса>.sda-discard-<pid>-<время>. Chromium её не
 * читает, это мусор до удаления. Удаляются только имена с этими префиксами.
 */
export function sessionDiscardPrefix(folder: SessionFolder): string {
  return `${folder}.sda-discard-`;
}

/** Пустая вкладка (about:blank или «Новая вкладка»): восстановленной не считается (SDA-33). */
export function isBlankTabUrl(url: string): boolean {
  return (
    url === "" ||
    /^about:blank([?#]|$)/.test(url) ||
    /^chrome:\/\/(newtab|new-tab-page)/.test(url) ||
    url.startsWith("chrome-search://local-ntp")
  );
}

/**
 * Вкладка прошлого сеанса: не пустая и не страница расширения. Приветствие или настройки
 * расширения открывает само расширение, а не восстановление сеанса (SDA-33).
 */
export function isRestoredTabUrl(url: string): boolean {
  return !isBlankTabUrl(url) && !url.startsWith("chrome-extension://");
}

/**
 * Адрес вкладки по данным браузера (target), а не по загруженному документу: у восстановленной
 * вкладки, которая ещё не загрузилась, документ пустой, а адрес уже тот, что вернётся.
 */
function tabUrl(tab: Page): string {
  return tab.target().url() || tab.url();
}

export default class Chrome {
  private startAttempt: { reason?: StartCancelReason } | null = null;
  profileDir: string;
  params: SteamAccountInterface;
  browser: Browser | null;
  page: Page | null;
  proxy: { server: string; username: string; password: string } | undefined;
  workStatus: "working" | "notworking" | "load";
  isOpen: boolean;
  /** Локаль браузера под гео прокси (для --lang / Accept-Language). Задаётся в start(). */
  locale: string | null;
  /** Таймзона под гео прокси. Задаётся в start(), нужна и для попапов. */
  timezone: string | null;

  constructor(params: SteamAccountInterface) {
    this.isOpen = false;
    this.workStatus = "notworking";
    this.params = params;
    // Профили живут в userData, а НЕ рядом с бандлом (__dirname): в сборке это
    // папка установки Squirrel — путь слишком длинный (Chrome не может перенести
    // распакованное расширение в Default/Extensions, MAX_PATH), и при обновлении
    // приложения профили стирались вместе со старой app-x.y.z.
    this.profileDir = path
      .join(app.getPath("userData"), `browser_profiles/${params.id}`)
      .replaceAll("\\", "/");
    this.browser = null;
    this.page = null;
    this.proxy = undefined;
    this.locale = null;
    this.timezone = null;
  }

  /**
   * Стабильный per-account отпечаток "железа". Все профили на одном ПК делят
   * реальные hardwareConcurrency/deviceMemory — это связывает аккаунты между собой
   * и с ПК. Выдаём детерминированные (по id) правдоподобные значения, чтобы
   * аккаунты не выглядели идентичными. Значение стабильно между запусками.
   */
  private accountFingerprint(): { hardwareConcurrency: number; deviceMemory: number } {
    let hash = 0;
    for (let i = 0; i < this.params.id.length; i++) {
      hash = (hash * 31 + this.params.id.charCodeAt(i)) >>> 0;
    }
    const cores = [4, 8, 12, 16];
    const memory = [8, 16];
    return {
      hardwareConcurrency: cores[hash % cores.length],
      deviceMemory: memory[(hash >>> 3) % memory.length],
    };
  }

  /**
   * Приводит отпечаток страницы к гео прокси и per-account значениям:
   * таймзона, Accept-Language, navigator.hardwareConcurrency/deviceMemory.
   * Применяется и к главной странице, и к попапам/новым вкладкам, иначе
   * на попапах остаётся системная TZ/локаль (нестыковка фингерпринта).
   */
  private async applyFingerprint(page: Page): Promise<void> {
    const fp = this.accountFingerprint();
    try {
      await page.evaluateOnNewDocument((hc: number, dm: number) => {
        // configurable: true — главная страница может получить init-скрипт дважды
        // (явный вызов + targetcreated); без этого повторный defineProperty бросит.
        Object.defineProperty(navigator, "hardwareConcurrency", { get: () => hc, configurable: true });
        Object.defineProperty(navigator, "deviceMemory", { get: () => dm, configurable: true });
      }, fp.hardwareConcurrency, fp.deviceMemory);
    } catch (e) {
      console.log(`${this.params.id} - не удалось задать navigator-отпечаток: ${e}`);
    }
    if (this.timezone) {
      try {
        await page.emulateTimezone(this.timezone);
      } catch (tzErr) {
        console.log(`${this.params.id} - ошибка установки таймзоны: ${tzErr}`);
      }
    }
    if (this.locale) {
      try {
        await page.setExtraHTTPHeaders({
          "Accept-Language": acceptLanguageFor(this.locale),
        });
      } catch (langErr) {
        console.log(`${this.params.id} - ошибка установки локали: ${langErr}`);
      }
    }
  }

  /** Вкладка до загрузки: авторизация на прокси (иначе 407) и отпечаток под гео прокси. */
  private async prepareTab(tab: Page): Promise<void> {
    if (this.proxy) {
      await tab.authenticate({
        username: this.proxy.username,
        password: this.proxy.password,
      });
    }
    await this.applyFingerprint(tab);
  }

  /**
   * Плагины puppeteer-extra (stealth, minmax) настраивают вкладку по событию targetcreated, а
   * подписываются на него уже после запуска. Вкладки, открытые до этого (первая пустая вкладка
   * браузера и восстановленные из прошлого сеанса, SDA-33), они не видели — вызываем их хук сами.
   * Только для таких вкладок: второй прогон stealth на той же странице оставил бы следы. Ошибку
   * плагина, как и сам puppeteer-extra, только пишем в лог.
   */
  private async applyPluginHooks(tab: Page): Promise<void> {
    for (const plugin of puppeteer.plugins) {
      try {
        await plugin.onPageCreated(tab as any);
      } catch (pluginErr) {
        console.log(`${this.params.id} - плагин ${plugin.name} не настроил вкладку: ${pluginErr}`);
      }
    }
  }

  /**
   * SDA-33: вкладки прошлого сеанса Chromium открывает не сразу после запуска. Ждём до
   * RESTORE_WAIT_MS, пока появится непустая вкладка и число вкладок перестанет расти.
   */
  private async waitForRestoredTabs(browser: Browser, assertCurrent: () => void): Promise<Page[]> {
    let previousCount = -1;
    for (let waited = 0; ; waited += RESTORE_POLL_MS) {
      const tabs = await browser.pages();
      assertCurrent();
      const restored = tabs.some((tab) => isRestoredTabUrl(tabUrl(tab)));
      if ((restored && tabs.length === previousCount) || waited >= RESTORE_WAIT_MS) return tabs;
      previousCount = tabs.length;
      await new Promise((resolve) => setTimeout(resolve, RESTORE_POLL_MS));
    }
  }

  /** Последняя начатая подготовка профиля: следующая ждёт её окончания. */
  private profilePreparation: Promise<void> = Promise.resolve();
  /**
   * Закрытия браузеров этого аккаунта, которые ещё идут (SDA-33): stop() отпускает this.browser
   * сразу, а Chromium ещё держит профиль. Подготовка профиля ждёт их. Ожидание конечно:
   * closeBrowser сдаётся через BROWSER_CLOSE_TIMEOUT_MS и убивает процесс.
   */
  private browserClosing: Promise<void> | null = null;

  /**
   * Готовит папку профиля к запуску: перенос со старого места, создание, настройка DoH (SDA-26).
   *
   * Запуск можно отменить новым запуском, но начатое отменённый не бросает: копирование старого
   * профиля или запись стартовых файлов он доводит до конца уже после отмены. Если бы новый
   * запуск готовил профиль одновременно, эти хвосты легли бы поверх уже подготовленного профиля
   * (в том числе поверх Local State с выключенным DoH) прямо перед стартом браузера. Поэтому
   * подготовки идут строго по очереди: новая начинается, только когда предыдущая закончилась, и
   * сама заканчивается проверкой настройки DoH и, если вкладки прошлого сеанса не нужны (SDA-33),
   * их удалением. После этого запуск файлов профиля не пишет. Начинается подготовка, только когда
   * прошлый браузер аккаунта закрылся.
   *
   * Результат (SDA-33): могут ли при запуске вернуться вкладки прошлого сеанса — включено
   * восстановление и сеанс есть на диске, или выключено, но папку сеанса удалить не удалось.
   */
  private prepareProfile(assertCurrent: () => void, restoreTabs: boolean): Promise<boolean> {
    const run = this.profilePreparation.then(async () => {
      await this.browserClosing;
      assertCurrent();
      await this.migrateLegacyProfile();
      assertCurrent();
      await fs.access(this.profileDir).catch(async (err) => {
        if (err.code == "ENOENT") await this.createProfile();
        else throw err;
      });
      assertCurrent();
      // DNS-over-HTTPS шёл бы мимо прокси, с реального IP. Не удалось записать настройку —
      // браузер не запускаем.
      await ensureSecureDnsOff(this.profileDir);
      // Брошенные папки сеанса, которые не успели удалить (сбой между переименованием и удалением), —
      // при любой настройке: это мусор, а не вкладки.
      this.sweepDiscardedSessions();
      if (restoreTabs) return this.previousSessionOnDisk();
      return !(await this.forgetPreviousTabs(assertCurrent));
    });
    // Ошибка или отмена одной подготовки не должна рвать очередь.
    this.profilePreparation = run.then(() => undefined, () => undefined);
    return run;
  }

  /**
   * SDA-33: есть ли на диске вкладки прошлого сеанса — в любой из папок сеанса. Нет — ждать их после
   * запуска незачем. Брошенные папки сюда не входят.
   */
  private async previousSessionOnDisk(): Promise<boolean> {
    for (const folder of SESSION_FOLDERS) {
      try {
        if ((await fs.readdir(`${this.profileDir}/Default/${folder}`)).length > 0) return true;
      } catch (err) {
        // Папки нет — из неё возвращать нечего. Другая ошибка — не знаем, поэтому ждём.
        if ((err as NodeJS.ErrnoException).code !== "ENOENT") return true;
      }
    }
    return false;
  }

  /**
   * SDA-33: Chromium 154 (проверено на macOS) после browser.close() при следующем запуске сам
   * открывает вкладки прошлого сеанса — даже без настройки «продолжить с того же места»;
   * session.restore_on_startup и -ApplePersistenceIgnoreState этого не отключают. Не открывает,
   * только если в профиле нет папки Default/Sessions. Новее Chromium может читать сеанс из
   * Default/Sessions_Encrypted, поэтому убираем обе папки (SESSION_FOLDERS) перед запуском — и
   * браузер начинает с одной пустой вкладки, а мы открываем стартовые страницы.
   *
   * Порядок — как в SESSION_FOLDERS: сначала Sessions, её чтение измерено на Chromium 154, и
   * одного её удаления там хватает; Sessions_Encrypted — запас на новые версии. Запуск, отменённый
   * между ними, вторую не трогает (проверка перед каждой попыткой). Не удалось убрать хотя бы одну —
   * одна строка в лог: имя папки и код ошибки, без пути (в тексте ошибки был бы путь с именем
   * пользователя), и запускаем дальше: из-за истории вкладок браузер не должен не открыться.
   * Возвращает, убраны ли все папки сеанса.
   */
  private async forgetPreviousTabs(assertCurrent: () => void): Promise<boolean> {
    const failures: string[] = [];
    for (const folder of SESSION_FOLDERS) {
      const code = await this.dropSessionFolder(folder, assertCurrent);
      if (code !== null) failures.push(`${folder}: ${code || "unknown"}`);
    }
    if (!failures.length) return true;
    console.log(
      `${this.params.id} - не удалось убрать вкладки прошлого сеанса (${failures.join(", ")}), ` +
        `этот запуск — как с восстановлением вкладок`
    );
    return false;
  }

  /**
   * SDA-33: одна папка сеанса — одним переименованием, а не рекурсивным удалением: fs.rm читает
   * папку и удаляет файлы по одному, и отменённый посреди него запуск продолжал бы удалять.
   * Переименование — один системный вызов: папка либо цела, либо ушла целиком. Повторы — свои:
   * перед каждой попыткой проверяем, что запуск ещё актуален; отменённый (Stop, новый Start —
   * возможно, уже с восстановлением) больше ничего не трогает. Брошенную папку удаляем потом, не
   * дожидаясь. Результат: null — папка убрана или её нет, иначе код ошибки.
   */
  private async dropSessionFolder(folder: SessionFolder, assertCurrent: () => void): Promise<string | null> {
    for (let attempt = 1; ; attempt++) {
      assertCurrent();
      const discarded = `${sessionDiscardPrefix(folder)}${process.pid}-${Date.now()}`;
      try {
        await fs.rename(`${this.profileDir}/Default/${folder}`, `${this.profileDir}/Default/${discarded}`);
        this.removeDiscardedSessions([discarded]);
        return null;
      } catch (err) {
        const code = (err as NodeJS.ErrnoException).code || "";
        if (code === "ENOENT") return null;
        if (attempt >= SESSION_REMOVE_ATTEMPTS || !SESSION_REMOVE_RETRY_CODES.includes(code)) return code;
        await new Promise((resolve) => setTimeout(resolve, SESSION_REMOVE_RETRY_MS));
      }
    }
  }

  /**
   * SDA-33: удаляет брошенные папки сеанса. Best effort и без ожидания: запуск их не ждёт, удаление
   * может закончиться и после Stop (их никто не читает), ошибки не пишем (в тексте был бы путь).
   */
  private removeDiscardedSessions(names: string[]): void {
    for (const name of names) {
      fs.rm(`${this.profileDir}/Default/${name}`, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  /** SDA-33: находит в Default брошенные папки сеанса (точные префиксы, больше ничего) и удаляет их. */
  private sweepDiscardedSessions(): void {
    const prefixes = SESSION_FOLDERS.map(sessionDiscardPrefix);
    fs.readdir(`${this.profileDir}/Default`)
      .then((names) => this.removeDiscardedSessions(names.filter((name) => prefixes.some((prefix) => name.startsWith(prefix)))))
      .catch(() => undefined);
  }

  /**
   * Одноразовая миграция профиля со старого места (рядом с бандлом, __dirname)
   * в userData. Best effort: rename в пределах диска, иначе рекурсивная копия;
   * при неудаче профиль просто создастся заново (куки Steam подставляются на старте).
   */
  private async migrateLegacyProfile(): Promise<void> {
    const legacyDir = path
      .join(__dirname, `./browser_profiles/${this.params.id}`)
      .replaceAll("\\", "/");
    if (legacyDir === this.profileDir) return;
    try {
      await fs.access(this.profileDir);
      return; // профиль на новом месте уже есть
    } catch {}
    try {
      await fs.access(legacyDir);
    } catch {
      return; // старого профиля нет — мигрировать нечего
    }
    try {
      await fs.mkdir(path.dirname(this.profileDir), { recursive: true });
      await fs.rename(legacyDir, this.profileDir);
      console.log(`${this.params.id} - профиль перенесён из ${legacyDir}`);
    } catch {
      try {
        await fs.cp(legacyDir, this.profileDir, { recursive: true });
        console.log(`${this.params.id} - профиль скопирован из ${legacyDir}`);
      } catch (copyErr) {
        console.log(`${this.params.id} - не удалось перенести старый профиль: ${copyErr}`);
      }
    }
  }
  createProfile(): Promise<void> {
    return new Promise<void>(async (resolve, reject) => {
      try {
        await fs.mkdir(`${this.profileDir}/Default`, { recursive: true });
        await fs.mkdir(`${this.profileDir}/Avatars`, { recursive: true });
        // Только через writeLocalState: файл сразу получает выключенный DoH (SDA-26), даже если
        // этот запуск уже отменён и пишет позже нового.
        await writeLocalState(this.profileDir, LocalState(this.params.secondary.nickname));
        // Аватар — косметика профиля. Недопустимый или недоступный URL пропускаем.
        // С прокси качаем через него; без прокси — напрямую.
        const avatarUrl = this.params.secondary?.avatarUrl;
        if (avatarUrl && sanitizeAvatarUrl(avatarUrl) === avatarUrl) {
          const avatar = (async () => {
            const proxyUrl = this.proxyUrl();
            await downloadImage(
              avatarUrl,
              `${this.profileDir}/Avatars/avatar_generic_small.png`,
              proxyUrl
            );
            await new Promise<void>((res, rej) => {
              sharp(`${this.profileDir}/Avatars/avatar_generic_small.png`)
                .resize(192, 192)
                .toFile(`${this.profileDir}/Avatars/avatar_generic.png`, (err: any) =>
                  err ? rej(err) : res()
                );
            });
          })();
          // У скачивания аватара нет своего таймаута, а подготовка профиля идёт по очереди:
          // зависший аватар держал бы все следующие запуски браузера этого аккаунта.
          // Ждём недолго; опоздавший аватар допишет только свои файлы в Avatars.
          let timer: ReturnType<typeof setTimeout> | undefined;
          const timedOut = new Promise<"timeout">((res) => { timer = setTimeout(() => res("timeout"), AVATAR_TIMEOUT_MS); });
          try {
            const outcome = await Promise.race([avatar, timedOut]);
            if (outcome === "timeout") console.log(`${this.params.id} - аватар пропущен: не скачался за ${AVATAR_TIMEOUT_MS / 1000} с`);
          } catch (avatarErr) {
            console.log(`${this.params.id} - аватар пропущен: ${avatarErr}`);
          } finally {
            clearTimeout(timer);
            avatar.catch(() => undefined); // опоздавшая ошибка никому не нужна
          }
        }
        resolve();
      } catch (err) {
        return reject(err);
      }
    });
  }
  /** URL прокси для сетевых запросов профиля (аватар). null — прокси не привязан. */
  private proxyUrl(): string | null {
    const links = Manager.GetSteamAccountLinkedData(this.params.id);
    if (links.proxyState === "missing") throw new ProxyUnavailableError(links.proxyId);
    return buildProxyUrl(links.proxy);
  }
  setupProxy(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      try {
        const links = Manager.GetSteamAccountLinkedData(this.params.id);
        if (links.proxyState === "missing") {
          this.proxy = undefined;
          throw new ProxyUnavailableError(links.proxyId);
        }
        // Присваиваем всегда, в т.ч. undefined: иначе после отвязки прокси в объекте
        // остался бы прошлый и браузер стартовал бы через уже не привязанный прокси.
        this.proxy = links.proxy
          ? {
            server: `${links.proxy.host}:${links.proxy.port}`,
            username: links.proxy.username,
            password: links.proxy.password,
          }
          : undefined;
        resolve();
      } catch (err) {
        return reject(err);
      }
    });
  }
  start(webCookies: string[] = [], geo?: ProxyGeo | null): Promise<void> {
    if (this.browser) return Promise.resolve();
    this.cancelStart("superseded");
    const attempt: { reason?: StartCancelReason } = {};
    this.startAttempt = attempt;
    const assertCurrent = () => {
      if (attempt.reason) throw new BrowserStartCancelledError(attempt.reason);
    };
    this.workStatus = "load";
    application.sendToMain(SteamAccountChannels.GET_BROWSER_STARTUS, {
      status: this.workStatus, id: this.params.id,
    });
    return new Promise<void>(async (resolve, reject) => {
      try {
        await this.setupProxy();
        assertCurrent();
        const executablePath = await resolveBrowserPath();
        assertCurrent();
        console.log("path: ", executablePath);
        // Локаль под гео прокси — нужна ДО запуска (флаг --lang), задаётся в generateChromeFlags.
        this.locale = geo && geo.countryCode ? localeForCountry(geo.countryCode) : null;
        this.timezone = geo ? geo.timezone : null;
        // Прокси резолвим ДО createProfile: если он привязан, аватар должен
        // качаться через него, а не напрямую (downloadImage получает proxyUrl).
        await this.setupProxy();
        assertCurrent();
        // Возвращать ли вкладки прошлого сеанса (SDA-33), читаем один раз: от этого зависят и
        // подготовка профиля, и то, что открывается после запуска.
        const restoreTabs = BrowserSettingsStorage.Get().restoreTabs;
        // Перенос старого профиля, создание и настройки (SDA-26, SDA-33) — строго по очереди с
        // другими запусками этого же профиля, см. prepareProfile.
        const previousTabsMayReturn = await this.prepareProfile(assertCurrent, restoreTabs);
        assertCurrent();
        // То же значение настройки, что и для подготовки профиля. Не previousTabsMayReturn: в запасном
        // режиме (папки сеанса не удалось убрать) Chromium не просим восстанавливать.
        const args = this.generateChromeFlags(restoreTabs);
        const launchedBrowser = await puppeteer.launch({
          userDataDir: this.profileDir,
          headless: false,
          executablePath,
          args,
          // С расширениями (SDA-6) убираем дефолтный флаг puppeteer --disable-extensions, иначе
          // --load-extension не сработает. Stealth (evasion defaultArgs) тоже его убирает, но
          // на плагин не полагаемся.
          ...(args.some((arg) => arg.startsWith("--load-extension="))
            ? { ignoreDefaultArgs: ["--disable-extensions"] }
            : {}),
        });
        if (attempt.reason) {
          await this.closeBrowserReleasingProfile(launchedBrowser);
          assertCurrent();
        }
        // Вкладки, открытые до того, как плагины puppeteer-extra подписались на targetcreated
        // (см. applyPluginHooks). Снимок — до первого await после запуска: вкладки, открытые
        // позже, плагины уже видят сами. Из этого же снимка берутся пустые вкладки, которые
        // приложение может занять или закрыть: открытые позже — чужие (пользователя, расширения).
        const startupTargets = new Set<Target>(launchedBrowser.targets());
        this.browser = launchedBrowser;

        this.workStatus = "working";
        application.sendToMain(SteamAccountChannels.GET_BROWSER_STARTUS, {
          status: this.workStatus,
          id: this.params.id,
        });

        this.browser.on("disconnected", () => {
          if (this.browser !== launchedBrowser) return;
          this.browser = null;
          this.page = null;
          this.workStatus = "notworking";
          application.sendToMain(SteamAccountChannels.GET_BROWSER_STARTUS, {
            status: this.workStatus,
            id: this.params.id,
          });
        });

        // Новые вкладки/попапы: аутентифицируем на прокси (иначе 407) и приводим
        // отпечаток (TZ/локаль/navigator) к гео прокси, как у главной страницы.
        this.browser.on("targetcreated", async (target) => {
          try {
            if (target.type() === "page") {
              const newPage = await target.page();
              if (newPage) await this.prepareTab(newPage);
            }
          } catch (e) {
            console.log(`${this.params.id} - не удалось настроить новую вкладку: ${e}`);
          }
        });

        // SDA-33. Вкладки, которые уже есть: пустая, которую браузер открывает сам, и, если вкладки
        // прошлого сеанса могут вернуться, они (их недолго ждём).
        const tabs = previousTabsMayReturn
          ? await this.waitForRestoredTabs(launchedBrowser, assertCurrent)
          : await launchedBrowser.pages();
        assertCurrent();
        // Пустые вкладки самого браузера — только из снимка при запуске.
        const blankTabs = tabs.filter((tab) => startupTargets.has(tab.target()) && isBlankTabUrl(tabUrl(tab)));
        const restoredTabs = tabs.filter((tab) => isRestoredTabUrl(tabUrl(tab)));
        // Вкладки вернулись — стартовые страницы не открываем, иначе они копились бы с каждым
        // запуском. Вернуться им неоткуда — открываем всегда.
        const openStartPages = !previousTabsMayReturn || !restoredTabs.length;
        // Первая пустая вкладка достаётся первой стартовой странице, остальные пустые закрываем:
        // лишних about:blank не остаётся.
        const reusedTab = openStartPages ? blankTabs[0] : undefined;
        for (const tab of blankTabs) {
          if (tab === reusedTab) continue;
          tab.close().catch((closeErr) => {
            console.log(`${this.params.id} - не удалось закрыть пустую вкладку: ${closeErr}`);
          });
        }
        // Восстановленные вкладки в большинстве открылись раньше, чем мы подписались на
        // targetcreated: настраиваем их как новые (повтор для тех, что подписку застали, безвреден).
        // Ошибка одной вкладки не роняет запуск.
        for (const tab of restoredTabs) {
          assertCurrent();
          try {
            if (startupTargets.has(tab.target())) await this.applyPluginHooks(tab);
            await this.prepareTab(tab);
          } catch (tabErr) {
            console.log(`${this.params.id} - не удалось настроить восстановленную вкладку: ${tabErr}`);
          }
        }
        assertCurrent();

        // Вкладка, через которую ставятся cookie Steam: первая стартовая или первая восстановленная.
        // Cookie общие для всего профиля и видны во всех его вкладках.
        let page: Page;
        if (openStartPages) {
          page = reusedTab || (await launchedBrowser.newPage());
          assertCurrent();
          this.page = page;
          // Пустую вкладку браузера плагины не видели (см. applyPluginHooks), новую — видели.
          if (reusedTab && startupTargets.has(reusedTab.target())) await this.applyPluginHooks(reusedTab);
          if (this.proxy)
            await page.authenticate({
              username: this.proxy?.username,
              password: this.proxy?.password,
            });
          // Приводим отпечаток главной страницы к гео прокси и per-account значениям
          // (таймзона, Accept-Language, navigator.hardwareConcurrency/deviceMemory).
          assertCurrent();
          await this.applyFingerprint(page);
          assertCurrent();
        } else {
          page = restoredTabs[0];
          this.page = page;
        }
        if (this.params.useSteamCookies) await this.addSteamCookies(webCookies);
        assertCurrent();
        // Восстановленные вкладки начали грузиться раньше, чем мы их настроили: без пароля прокси
        // (407), с настоящими navigator-значениями и без свежих cookie. Перезагружаем, загрузку не ждём.
        for (const tab of restoredTabs) {
          tab.reload().catch((reloadErr) => {
            console.log(`${this.params.id} - восстановленная вкладка не перезагрузилась: ${reloadErr}`);
          });
        }
        if (!openStartPages) return resolve();
        // Стартовые ссылки со страницы Browser (SDA-6). Первая — в этой вкладке, где выставлены
        // cookie Steam (раньше тут всегда был steamcommunity.com/my/, пустой список — он же).
        const [firstLink, ...otherLinks] = effectiveStartLinks(BrowserSettingsStorage.Get().startLinks);
        // Как и остальные вкладки: загрузку не ждём, ошибку (DNS, прокси, таймаут) только пишем
        // в лог — браузер уже открыт, страница ошибки видна во вкладке, остальные ссылки открываются.
        page.goto(firstLink).catch((pageErr) => {
          console.log(`${this.params.id} - первая стартовая страница не загрузилась: ${pageErr}`);
        });
        // Остальные — новыми вкладками по порядку. Прокси и отпечаток настраиваем до загрузки,
        // загрузку не ждём: медленная страница не держит следующие. Ошибка вкладки не роняет запуск.
        // Запуск, отменённый сменой маршрута или новым Start, больше вкладок не открывает (SDA-21).
        for (const link of otherLinks) {
          assertCurrent();
          try {
            const tab = await launchedBrowser.newPage();
            await this.prepareTab(tab);
            tab.goto(link).catch((tabErr) => {
              console.log(`${this.params.id} - стартовая вкладка не загрузилась: ${tabErr}`);
            });
          } catch (tabErr) {
            console.log(`${this.params.id} - не удалось открыть стартовую вкладку: ${tabErr}`);
          }
        }
        // Новая вкладка встаёт на передний план; возвращаем первую — с аккаунтом Steam.
        if (otherLinks.length) await page.bringToFront().catch(() => {});
        assertCurrent();
        resolve();
      } catch (err) {
        const failure = attempt.reason ? new BrowserStartCancelledError(attempt.reason) : err;
        // Navigation/auth/cookie errors after launch leave the user's window open.
        if (!attempt.reason && !this.browser) await this.stop().catch(() => undefined);
        return reject(failure);
      } finally {
        if (this.startAttempt === attempt) this.startAttempt = null;
      }
    });
  }
  generateChromeFlags(restoreLastSession = false) {
    const args: string[] = [];
    //args.push(`--user-data-dir=${this.profileDir}`);
    //args.push('--app=https://www.google.com/');
    args.push(`--window-size=1920,1080`);
    args.push(`--gaia-profile-info`);
    args.push(`--no-default-browser-check`);
    args.push(`--suppress-message-center-popups`);
    // SDA-33, включено «Восстанавливать вкладки»: Chrome 160 (сборка для Windows, замер в CI) без
    // этого флага вкладки прошлого сеанса не открывает вовсе; Chromium 154 открывает и без него.
    if (restoreLastSession) args.push(`--restore-last-session`);
    // Защита от утечки реального IP через WebRTC: UDP только через прокси.
    // HTTP-прокси UDP не передаёт, поэтому WebRTC не сможет раскрыть реальный IP.
    args.push(`--force-webrtc-ip-handling-policy=disable_non_proxied_udp`);
    args.push(`--enforce-webrtc-ip-permission-check`);
    // QUIC (HTTP/3) идёт по UDP и обходит HTTP-прокси -> отключаем, чтобы весь трафик шёл по TCP через прокси.
    args.push(`--disable-quic`);
    // Фоновый трафик Chromium (safe-browsing, update-ping, metrics, DNS-prefetch и т.п.)
    // может уходить в обход прокси/с реального IP. Глушим всё лишнее (defense-in-depth).
    args.push(`--disable-background-networking`);
    args.push(`--disable-component-update`);
    args.push(`--disable-domain-reliability`);
    args.push(`--disable-client-side-phishing-detection`);
    args.push(`--disable-sync`);
    args.push(`--disable-breakpad`);
    args.push(`--metrics-recording-only`);
    args.push(`--no-pings`);
    args.push(`--dns-prefetch-disable`);
    // Локаль браузера под гео прокси (синхронно с Accept-Language и таймзоной).
    if (this.locale) args.push(`--lang=${this.locale}`);

    if (this.proxy) args.push(`--proxy-server=${this.proxy?.server}`);
    console.log(args);
    // Распакованные расширения со страницы Browser (SDA-6): включённые, папка которых проходит
    // проверку сейчас. Пропущенные пишутся в лог, запуск не падает.
    const extensionPaths = launchExtensionPaths(BrowserSettingsStorage.Get().extensions);
    if (extensionPaths.length) {
      args.push(`--disable-extensions-except=${extensionPaths.join(",")}`);
      args.push(`--load-extension=${extensionPaths.join(",")}`);
    }
    return args;
  }
  async focus() {
    try {
      // Локальная пустая страница: трюк для фокуса окна не должен делать
      // сетевой запрос на сторонний домен (раньше открывался сайт автора оригинала).
      const newPage = await this.browser?.newPage();
      await newPage?.goto("about:blank");
      await (newPage as any).minimize();
      await (newPage as any).maximize();
    } catch (err) {
      console.log(err);
    }
  }
  private async closeBrowser(browser: Browser) {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        browser.close(),
        new Promise<never>((resolve, reject) => {
          timeout = setTimeout(() => reject(new Error(t("errors.browserCloseTimeout"))), BROWSER_CLOSE_TIMEOUT_MS);
        })
      ]);
    } catch (err) {
      // Puppeteer may lose its connection while the child is still browsing.
      browser.process()?.kill("SIGKILL");
      throw err;
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  }
  /** Закрывает браузер и до конца закрытия держит подготовку профиля (см. browserClosing). */
  private closeBrowserReleasingProfile(browser: Browser): Promise<void> {
    const closing = this.closeBrowser(browser);
    const released: Promise<void> = Promise.all([this.browserClosing, closing.catch(() => undefined)]).then(() => {
      if (this.browserClosing === released) this.browserClosing = null;
    });
    this.browserClosing = released;
    return closing;
  }
  private cancelStart(reason: StartCancelReason) {
    if (this.startAttempt && !this.startAttempt.reason) this.startAttempt.reason = reason;
  }
  async stop(reason: StartCancelReason = "stopped"): Promise<void> {
    this.cancelStart(reason);
    const browser = this.browser;
    this.browser = null;
    this.page = null;
    this.isOpen = false;
    this.workStatus = "notworking";
    application.sendToMain(SteamAccountChannels.GET_BROWSER_STARTUS, {
      status: this.workStatus, id: this.params.id,
    });
    if (browser) await this.closeBrowserReleasingProfile(browser);
  }
  addSteamCookies(webCookies: string[] = []): Promise<void> {
    return new Promise<void>(async (resolve, reject) => {
      try {
        // webCookies — это cookie для steamcommunity.com (aud: web:community),
        // полученные через getCommunityWebCookies. steamLoginSecure доменно-специфичен,
        // поэтому ставим строго на домен steamcommunity.com.
        const url = "https://steamcommunity.com/";
        const cookies: { url: string; name: string; value: string }[] = [];
        for (const cookieStr of webCookies) {
          const eqIndex = cookieStr.indexOf("=");
          if (eqIndex === -1) continue;
          const name = cookieStr.slice(0, eqIndex).trim();
          const value = cookieStr.slice(eqIndex + 1).trim();
          if (!name || !value) continue;
          cookies.push({ url, name, value });
        }
        if (cookies.length) await this.page?.setCookie(...cookies);

        resolve();
      } catch (err) {
        return reject(err);
      }
    });
  }
}
