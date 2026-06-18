import downloadImage from "../../someFuncs/downloadImage";
import fs from "fs/promises";
import puppeteerDefault, { Browser, Page } from "puppeteer";
import puppeteer from "puppeteer-extra";
import puppeteerStealth from "puppeteer-extra-plugin-stealth";
puppeteer.use(require("puppeteer-extra-plugin-minmax")());
puppeteer.use(puppeteerStealth());
import SteamAccountInterface from "../../../interfaces/SteamAccount/SteamAccountInterface";
import Manager from "../../manager/manager";
import application from "../../application/application";
import SteamAccountChannels from "../../../interfaces/IpcChannels/SteamAccountChannels";
import path from "path";
import LocalState from "./LocalState";
import { ProxyGeo, localeForCountry, acceptLanguageFor } from "../Functions/getProxyGeo";
const chromium = require('chromium');
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

  constructor(params: SteamAccountInterface) {
    this.isOpen = false;
    this.workStatus = "notworking";
    this.params = params;
    this.profileDir = path
      .join(__dirname, `./browser_profiles/${params.id}`)
      .replaceAll("\\", "/");
    this.browser = null;
    this.page = null;
    this.proxy = undefined;
    this.locale = null;
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
        // Без прокси аватар НЕ качаем: иначе запрос к CDN Steam уйдёт с реального IP.
        if (this.params.secondary.avatarUrl && this.proxy) {
          try {
            const proxyUrl = `http://${this.proxy.username}:${this.proxy.password}@${this.proxy.server}`;
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
  setupProxy(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      try {
        const links = Manager.GetSteamAccountLinkedData(this.params.id);
        if (links.proxy) {
          this.proxy = {
            server: `${links.proxy.host}:${links.proxy.port}`,
            username: links.proxy.username,
            password: links.proxy.password,
          };
        }
        resolve();
      } catch (err) {
        return reject(err);
      }
    });
  }
  start(webCookies: string[] = [], geo?: ProxyGeo | null): Promise<void> {
    return new Promise<void>(async (resolve, reject) => {
      try {
        console.log("path: ", chromium.path);
        // Локаль под гео прокси — нужна ДО запуска (флаг --lang), задаётся в generateChromeFlags.
        this.locale = geo && geo.countryCode ? localeForCountry(geo.countryCode) : null;
        const timezone = geo ? geo.timezone : null;
        this.workStatus = "load";
        application.sendToMain(SteamAccountChannels.GET_BROWSER_STARTUS, {
          status: this.workStatus,
          id: this.params.id,
        });
        // Прокси нужен ДО createProfile: иначе аватар качается с CDN Steam
        // напрямую с реального IP (downloadImage получает proxyUrl=null).
        await this.setupProxy();
        await fs.access(this.profileDir).catch(async (err) => {
          if (err.code == "ENOENT") await this.createProfile();
          else return reject(err);
        });

        this.browser = await puppeteer.launch({
          userDataDir: this.profileDir,
          headless: false,
          executablePath: chromium.path,
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

        // Новые вкладки/попапы тоже аутентифицируем на прокси (иначе их запросы упрутся в 407).
        this.browser.on("targetcreated", async (target) => {
          try {
            if (target.type() === "page" && this.proxy) {
              const newPage = await target.page();
              if (newPage) {
                await newPage.authenticate({
                  username: this.proxy.username,
                  password: this.proxy.password,
                });
              }
            }
          } catch (e) {
            console.log(`${this.params.id} - не удалось аутентифицировать новую вкладку: ${e}`);
          }
        });

        this.page = await this.browser.newPage();
        if (this.proxy)
          await this.page.authenticate({
            username: this.proxy?.username,
            password: this.proxy?.password,
          });
        // Подгоняем таймзону браузера под гео прокси (защита от фингерпринт-нестыковки с ПК).
        // timezone приходит уже разрешённым (с кешем) из proxyManager.
        if (timezone) {
          try {
            await this.page.emulateTimezone(timezone);
            console.log(`${this.params.id} - таймзона браузера: ${timezone}`);
          } catch (tzErr) {
            console.log(`${this.params.id} - ошибка установки таймзоны: ${tzErr}`);
          }
        }
        // Accept-Language под гео прокси (уменьшает фингерпринт-нестыковку с ПК).
        if (this.locale) {
          try {
            await this.page.setExtraHTTPHeaders({
              "Accept-Language": acceptLanguageFor(this.locale),
            });
            console.log(`${this.params.id} - локаль браузера: ${this.locale}`);
          } catch (langErr) {
            console.log(`${this.params.id} - ошибка установки локали: ${langErr}`);
          }
        }
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
    // Локаль браузера под гео прокси (синхронно с Accept-Language и таймзоной).
    if (this.locale) args.push(`--lang=${this.locale}`);

    if (this.proxy) args.push(`--proxy-server=${this.proxy?.server}`);
    console.log(args);
    return args;
  }
  async focus() {
    try {
      const newPage = await this.browser?.newPage();
      await newPage?.goto("https://pinkest.dev");
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
