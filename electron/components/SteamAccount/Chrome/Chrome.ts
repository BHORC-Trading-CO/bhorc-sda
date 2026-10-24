import downloadImage from "../../someFuncs/downloadImage";
import fs from "fs/promises";
import puppeteerDefault, { Browser, Page } from "puppeteer";
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
import Manager from "../../manager/manager";
import buildProxyUrl from "../../Proxy/proxyUrl";
import application from "../../application/application";
import SteamAccountChannels from "../../../interfaces/IpcChannels/SteamAccountChannels";
import path from "path";
import LocalState from "./LocalState";
import { ProxyGeo, localeForCountry, acceptLanguageFor } from "../Functions/getProxyGeo";
import resolveBrowserPath from "./resolveBrowserPath";
const sharp = require("sharp");

export default class Chrome {
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
        await fs.writeFile(
          `${this.profileDir}/Local State`,
          LocalState(this.params.secondary.nickname)
        );
        // Аватар — косметика профиля. Если URL пустой/недоступен, профиль всё равно создаём.
        // С прокси качаем через него; без прокси — напрямую.
        if (this.params.secondary.avatarUrl) {
          try {
            const proxyUrl = this.proxyUrl();
            await downloadImage(
              this.params.secondary.avatarUrl,
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
          } catch (avatarErr) {
            console.log(`${this.params.id} - аватар пропущен: ${avatarErr}`);
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
    if (!this.proxy) return null;
    const [host, port] = this.proxy.server.split(":");
    return buildProxyUrl({ host, port, username: this.proxy.username, password: this.proxy.password });
  }
  setupProxy(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      try {
        const links = Manager.GetSteamAccountLinkedData(this.params.id);
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
    return new Promise<void>(async (resolve, reject) => {
      try {
        const executablePath = await resolveBrowserPath();
        console.log("path: ", executablePath);
        // Локаль под гео прокси — нужна ДО запуска (флаг --lang), задаётся в generateChromeFlags.
        this.locale = geo && geo.countryCode ? localeForCountry(geo.countryCode) : null;
        this.timezone = geo ? geo.timezone : null;
        this.workStatus = "load";
        application.sendToMain(SteamAccountChannels.GET_BROWSER_STARTUS, {
          status: this.workStatus,
          id: this.params.id,
        });
        // Прокси резолвим ДО createProfile: если он привязан, аватар должен
        // качаться через него, а не напрямую (downloadImage получает proxyUrl).
        await this.setupProxy();
        await this.migrateLegacyProfile();
        await fs.access(this.profileDir).catch(async (err) => {
          if (err.code == "ENOENT") await this.createProfile();
          else return reject(err);
        });

        this.browser = await puppeteer.launch({
          userDataDir: this.profileDir,
          headless: false,
          executablePath,
          args: this.generateChromeFlags(),
        });

        this.workStatus = "working";
        application.sendToMain(SteamAccountChannels.GET_BROWSER_STARTUS, {
          status: this.workStatus,
          id: this.params.id,
        });

        this.browser.on("disconnected", () => {
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
              if (newPage) {
                if (this.proxy) {
                  await newPage.authenticate({
                    username: this.proxy.username,
                    password: this.proxy.password,
                  });
                }
                await this.applyFingerprint(newPage);
              }
            }
          } catch (e) {
            console.log(`${this.params.id} - не удалось настроить новую вкладку: ${e}`);
          }
        });

        this.page = await this.browser.newPage();
        if (this.proxy)
          await this.page.authenticate({
            username: this.proxy?.username,
            password: this.proxy?.password,
          });
        // Приводим отпечаток главной страницы к гео прокси и per-account значениям
        // (таймзона, Accept-Language, navigator.hardwareConcurrency/deviceMemory).
        await this.applyFingerprint(this.page);
        if (this.params.useSteamCookies) await this.addSteamCookies(webCookies);
        await this.page.goto("https://steamcommunity.com/my/");
      } catch (err) {
        return reject(err);
      }
    });
  }
  generateChromeFlags() {
    const args: string[] = [];
    //args.push(`--user-data-dir=${this.profileDir}`);
    //args.push('--app=https://www.google.com/');
    args.push(`--window-size=1920,1080`);
    args.push(`--gaia-profile-info`);
    args.push(`--no-default-browser-check`);
    args.push(`--suppress-message-center-popups`);
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
  stop(): Promise<void> {
    return new Promise<void>(async (resolve, reject) => {
      try {
        if (this.browser) await this.browser.close();
        this.isOpen = false;
        this.workStatus = "notworking";
        application.sendToMain(SteamAccountChannels.GET_BROWSER_STARTUS, {
          status: this.workStatus,
          id: this.params.id,
        });
        resolve();
      } catch (err) {
        return reject(err);
      }
    });
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
