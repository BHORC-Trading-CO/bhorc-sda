/**
 * Дымовой тест браузера аккаунта на собранном приложении.
 *
 * Проверяет то, что юнит-тесты проверить не могут (в них puppeteer заменён заглушкой):
 *   1. в сборке есть бинарник Chromium и он стартует с теми же плагинами и флагами,
 *      что и браузер аккаунта (SDA-30: на Windows сборка выходила без chrome.exe);
 *   2. страница грузится через прокси с логином и паролем;
 *   3. новая вкладка и попап не роняют браузер (SDA-42: «нажимаю + — браузер падает»).
 *
 * В сеть не ходит: «сайт» отдаёт сам локальный прокси на 127.0.0.1, аккаунтов Steam нет.
 * Модули берутся из node_modules собранного приложения, то есть проверяется ровно то,
 * что получит пользователь.
 *
 * Запуск: npm run package && node scripts/smokePackagedBrowser.js
 *   --modules <dir>   взять модули из другой папки node_modules (например, из проекта)
 *   --chrome <path>   другой бинарник браузера (на darwin/arm64 в сборке его нет:
 *                     приложение качает нативную сборку при первом запуске)
 *   SDA_SMOKE_DUMPIO=1  печатать stdout/stderr самого браузера
 *   SDA_SMOKE_TRACE=1   печатать появление и закрытие вкладок
 *
 * Флаги и обработчик новых вкладок повторяют electron/components/SteamAccount/Chrome/Chrome.ts
 * (generateChromeFlags, targetcreated, applyFingerprint). При изменениях там — обновить и здесь.
 */

const fs = require("fs");
const http = require("http");
const os = require("os");
const path = require("path");
const { execFile } = require("child_process");

const PROXY_USER = "smoke";
const PROXY_PASS = "smoke-pass";
const SITE = "http://sda-smoke.test";
const OVERALL_TIMEOUT_MS = 180000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const results = [];
function check(name, ok, detail = "", { optional = false } = {}) {
  results.push({ name, ok: !!ok, optional });
  const mark = ok ? "PASS" : optional ? "SKIP" : "FAIL";
  console.log(`${mark} ${name}${detail ? ` - ${detail}` : ""}`);
  return !!ok;
}

function argValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

/** Прокси с Basic-авторизацией, который сам отвечает за «сайт» sda-smoke.test. */
function startProxy() {
  const expected = "Basic " + Buffer.from(`${PROXY_USER}:${PROXY_PASS}`).toString("base64");
  const seen = { challenged: 0, served: 0 };
  const server = http.createServer((req, res) => {
    if (req.headers["proxy-authorization"] !== expected) {
      seen.challenged += 1;
      res.writeHead(407, { "Proxy-Authenticate": 'Basic realm="sda-smoke"', "Content-Length": 0 });
      return res.end();
    }
    seen.served += 1;
    const body =
      `<!doctype html><title>sda-smoke</title><body><p id="ok">ok ${req.url}</p>` +
      `<a id="popup" href="${SITE}/popup" target="_blank">popup</a></body>`;
    res.writeHead(200, { "Content-Type": "text/html", "Content-Length": Buffer.byteLength(body) });
    res.end(body);
  });
  // HTTPS-туннели тесту не нужны: фоновые запросы браузера наружу не выпускаем.
  server.on("connect", (_req, socket) => {
    // Браузер может оборвать соединение сам; без обработчика это уронит процесс теста.
    socket.on("error", () => undefined);
    socket.end("HTTP/1.1 403 Forbidden\r\n\r\n");
  });
  server.on("clientError", (_err, socket) => socket.destroy());
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve({ server, seen, port: server.address().port }));
  });
}

/** Те же флаги, что generateChromeFlags() в Chrome.ts (без расширений и --lang). */
function chromeFlags(proxyPort) {
  return [
    "--window-size=1920,1080",
    "--gaia-profile-info",
    "--no-default-browser-check",
    "--suppress-message-center-popups",
    "--force-webrtc-ip-handling-policy=disable_non_proxied_udp",
    "--enforce-webrtc-ip-permission-check",
    "--disable-quic",
    "--disable-background-networking",
    "--disable-component-update",
    "--disable-domain-reliability",
    "--disable-client-side-phishing-detection",
    "--disable-sync",
    "--disable-breakpad",
    "--metrics-recording-only",
    "--no-pings",
    "--dns-prefetch-disable",
    `--proxy-server=127.0.0.1:${proxyPort}`,
  ];
}

/** То же, что applyFingerprint() в Chrome.ts. */
async function applyFingerprint(page) {
  await page.evaluateOnNewDocument(
    (hc, dm) => {
      Object.defineProperty(navigator, "hardwareConcurrency", { get: () => hc, configurable: true });
      Object.defineProperty(navigator, "deviceMemory", { get: () => dm, configurable: true });
    },
    8,
    16
  );
  await page.emulateTimezone("Europe/Kyiv");
  await page.setExtraHTTPHeaders({ "Accept-Language": "uk-UA,uk;q=0.9,en;q=0.8" });
}

/**
 * Настоящее нажатие Ctrl+T / Cmd+T в окне браузера — та же команда, что кнопка «+».
 * Получается не везде (нужен активный рабочий стол и право слать клавиши), поэтому
 * результат — только «удалось ли нажать»; жив ли браузер, проверяется отдельно.
 */
function pressNewTabShortcut() {
  return new Promise((resolve) => {
    if (process.platform === "win32") {
      const script =
        "$w = New-Object -ComObject WScript.Shell; " +
        "if ($w.AppActivate('Chromium')) { Start-Sleep -Milliseconds 400; $w.SendKeys('^t'); exit 0 } else { exit 3 }";
      return execFile("powershell", ["-NoProfile", "-Command", script], { timeout: 15000 }, (err) => resolve(!err));
    }
    if (process.platform === "darwin") {
      const script =
        'tell application "System Events" to tell (first process whose name is "Chromium") to set frontmost to true\n' +
        "delay 0.4\n" +
        'tell application "System Events" to keystroke "t" using command down';
      return execFile("/usr/bin/osascript", ["-e", script], { timeout: 15000 }, (err) => resolve(!err));
    }
    resolve(false);
  });
}

async function main() {
  const { findPackagedAppDirs } = require("./verifyPackagedApp");
  const modulesDir = path.resolve(argValue("--modules") || path.join(findPackagedAppDirs()[0], "node_modules"));
  const fromModules = (name) => require(path.join(modulesDir, name));
  console.log(`Модули: ${modulesDir}`);

  const executablePath = argValue("--chrome") || process.env.SDA_SMOKE_CHROME || fromModules("chromium").path;
  if (!check("бинарник Chromium есть", executablePath && fs.existsSync(executablePath), String(executablePath))) {
    return;
  }

  // Плагины подключаются так же, как в Chrome.ts.
  const puppeteer = fromModules("puppeteer-extra");
  puppeteer.use(fromModules("puppeteer-extra-plugin-minmax")());
  const stealth = fromModules("puppeteer-extra-plugin-stealth")();
  stealth.enabledEvasions.delete("iframe.contentWindow");
  puppeteer.use(stealth);

  const proxy = await startProxy();
  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), "bhorc-sda-smoke-profile-"));
  let browser;
  let disconnected = false;
  const handlerErrors = [];

  try {
    browser = await puppeteer.launch({
      userDataDir: profileDir,
      headless: false,
      executablePath,
      args: chromeFlags(proxy.port),
      dumpio: process.env.SDA_SMOKE_DUMPIO === "1",
    });
    check("браузер стартовал", true, await browser.version());
    browser.on("disconnected", () => (disconnected = true));
    if (process.env.SDA_SMOKE_TRACE === "1") {
      const started = Date.now();
      const trace = (event) => (target) =>
        console.log(`  [${((Date.now() - started) / 1000).toFixed(2)}] ${event} ${target.type()} ${target.url().slice(0, 70)}`);
      browser.on("targetcreated", trace("+"));
      browser.on("targetdestroyed", trace("-"));
      browser.on("disconnected", () => console.log("  !! браузер отключился"));
    }

    // Тот же обработчик, что в Chrome.ts: авторизация на прокси и отпечаток для новых вкладок.
    browser.on("targetcreated", async (target) => {
      try {
        if (target.type() !== "page") return;
        const newPage = await target.page();
        if (!newPage) return;
        await newPage.authenticate({ username: PROXY_USER, password: PROXY_PASS });
        await applyFingerprint(newPage);
      } catch (err) {
        handlerErrors.push(String(err));
      }
    });

    const alive = async (page) =>
      !disconnected &&
      browser.isConnected() &&
      browser.process().exitCode === null &&
      (await page.evaluate(() => 1 + 1).catch(() => 0)) === 2;

    const page = await browser.newPage();
    await page.authenticate({ username: PROXY_USER, password: PROXY_PASS });
    await applyFingerprint(page);
    await page.goto(`${SITE}/first`, { waitUntil: "load", timeout: 30000 });
    const text = await page.$eval("#ok", (el) => el.textContent);
    // Через прокси браузер шлёт абсолютный адрес, поэтому в тексте он целиком.
    check("страница загрузилась через прокси с авторизацией", text === `ok ${SITE}/first`, `текст: ${text}, 407: ${proxy.seen.challenged}`);

    // «+» в полоске вкладок открывает chrome://newtab; создаём такую же вкладку через DevTools.
    const session = await browser.target().createCDPSession();
    for (const url of ["chrome://newtab/", "chrome://new-tab-page/", "about:blank"]) {
      const before = (await browser.pages()).length;
      let created = true;
      await session.send("Target.createTarget", { url }).catch((err) => {
        created = false;
        handlerErrors.push(`createTarget ${url}: ${err}`);
      });
      await sleep(3000);
      const after = disconnected ? 0 : (await browser.pages()).length;
      check(`новая вкладка ${url}: браузер жив`, created && (await alive(page)), `вкладок было ${before}, стало ${after}`);
      if (disconnected) break;
    }

    if (!disconnected) {
      const before = (await browser.pages()).length;
      const pressed = await pressNewTabShortcut();
      await sleep(3000);
      const after = disconnected ? 0 : (await browser.pages()).length;
      check("нажатие Ctrl+T / Cmd+T дошло до окна браузера", pressed && after > before, `вкладок было ${before}, стало ${after}`, { optional: true });
      check("после Ctrl+T / Cmd+T браузер жив", await alive(page));
    }

    if (!disconnected) {
      const popupTarget = browser.waitForTarget((t) => t.url().startsWith(`${SITE}/popup`), { timeout: 20000 });
      await page.bringToFront();
      await page.click("#popup");
      const popup = await (await popupTarget).page();
      await popup.waitForSelector("#ok", { timeout: 20000 });
      const popupText = await popup.$eval("#ok", (el) => el.textContent);
      check("попап открылся и загрузился через прокси", popupText === `ok ${SITE}/popup`, `текст: ${popupText}`);
      check("после попапа браузер жив", await alive(page));
    }

    check("браузер не отключался за время теста", !disconnected);
    check("обработчик новых вкладок отработал без ошибок", handlerErrors.length === 0, handlerErrors.join(" | "));
  } finally {
    if (browser) {
      await Promise.race([browser.close().catch(() => undefined), sleep(5000)]);
      const child = browser.process();
      if (child && child.exitCode === null) child.kill("SIGKILL");
    }
    proxy.server.close();
    fs.rmSync(profileDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 });
  }
}

const guard = setTimeout(() => {
  console.error(`FAIL тест не уложился в ${OVERALL_TIMEOUT_MS / 1000} с`);
  process.exit(1);
}, OVERALL_TIMEOUT_MS);

main()
  .catch((err) => check("тест выполнился без исключений", false, err && err.stack ? err.stack : String(err)))
  .finally(() => {
    clearTimeout(guard);
    const failed = results.filter((r) => !r.ok && !r.optional);
    const skipped = results.filter((r) => !r.ok && r.optional);
    console.log(`\nИтого: ${results.length - failed.length - skipped.length} PASS, ${failed.length} FAIL, ${skipped.length} SKIP`);
    process.exit(failed.length ? 1 : 0);
  });
