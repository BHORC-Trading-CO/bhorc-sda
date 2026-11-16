/**
 * Проверяет, что npm-пакет chromium действительно скачал браузер, и докачивает его, если нет.
 *
 * Зачем: node-chromium качает браузер в postinstall, но его install.js ловит любую ошибку
 * (сеть, обрыв, битый архив в кеше) и только пишет её в консоль. npm install при этом
 * завершается успешно, а npm 7+ ещё и прячет вывод postinstall-скриптов. В итоге сборка
 * выходит без chrome.exe, и браузер аккаунта не стартует (SDA-30).
 *
 * Запуск: npm run ensure:chromium (CI делает это сразу после npm install).
 */

const MAX_ATTEMPTS = 3;

/**
 * @param {{ platform: string, arch: string, chromium: { path: string | undefined, install: () => Promise<void> }, log?: (m: string) => void }} deps
 * @returns {Promise<{ ok: boolean, path?: string, skipped?: boolean, attempts: number }>}
 */
async function ensureChromium(deps) {
  const log = deps.log || console.log;

  if (deps.platform === "darwin" && deps.arch === "arm64") {
    // См. electron/components/SteamAccount/Chrome/resolveBrowserPath.ts.
    log("darwin/arm64: приложение качает нативную сборку Chromium при первом запуске, бинарник из пакета не нужен");
    return { ok: true, skipped: true, attempts: 0 };
  }

  let attempts = 0;
  while (true) {
    const binary = deps.chromium.path;
    if (binary) {
      log(`Chromium на месте: ${binary}`);
      return { ok: true, path: binary, attempts };
    }
    if (attempts >= MAX_ATTEMPTS) return { ok: false, attempts };

    attempts += 1;
    log(`Бинарника Chromium нет, качаем (попытка ${attempts} из ${MAX_ATTEMPTS})`);
    try {
      // Сам install() ошибку не пробрасывает, поэтому результат проверяем по chromium.path.
      await deps.chromium.install();
    } catch (err) {
      log(`Установка Chromium упала: ${err && err.message ? err.message : err}`);
    }
  }
}

async function main() {
  const result = await ensureChromium({
    platform: process.platform,
    arch: process.arch,
    chromium: require("chromium"),
  });

  if (!result.ok) {
    console.error(
      `Не удалось скачать Chromium за ${result.attempts} попытки. ` +
        `Проверьте доступ к storage.googleapis.com и запустите npm run ensure:chromium ещё раз.`
    );
    process.exit(1);
  }
}

if (require.main === module) main();

module.exports = { ensureChromium, MAX_ATTEMPTS };
