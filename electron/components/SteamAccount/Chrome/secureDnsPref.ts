import fsp from "fs/promises";
import path from "path";

/**
 * DNS-over-HTTPS в браузере аккаунта (SDA-26).
 *
 * По умолчанию у Chromium режим «автоматически»: если системный DNS принадлежит известному
 * DoH-провайдеру (1.1.1.1, 8.8.8.8), браузер сам переходит на его DoH-сервер. Такие запросы
 * идут мимо прокси, то есть с реального IP.
 *
 * Выключается это настройкой dns_over_https.mode = "off" в файле Local State профиля — той же,
 * что переключатель «Использовать безопасный DNS» в настройках браузера. Проверено на
 * Chromium 154: с этой записью переключатель выключен и запись сохраняется после выхода;
 * флаги --disable-features=DnsOverHttps и DnsOverHttpsUpgrade на него не влияют.
 */
export const LOCAL_STATE_FILE = "Local State";

/** Содержимое Local State с выключенным secure DNS. Остальные настройки не трогает. */
export function withSecureDnsOff(localState: string | null): string {
  let state: Record<string, unknown> = {};
  if (localState) {
    try {
      const parsed = JSON.parse(localState);
      // Битый или не тот по форме файл Chromium всё равно отбросил бы и создал заново.
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) state = parsed;
    } catch {
      state = {};
    }
  }
  const current = state.dns_over_https;
  const rest = current && typeof current === "object" && !Array.isArray(current) ? (current as Record<string, unknown>) : {};
  state.dns_over_https = { ...rest, mode: "off" };
  return JSON.stringify(state);
}

/**
 * Выключает secure DNS в профиле перед запуском браузера. Вызывать, пока браузер этого профиля
 * не запущен: Chromium читает Local State на старте и переписывает его на выходе.
 * Ошибку записи пробрасываем: без этой настройки браузер запускать нельзя.
 */
export async function ensureSecureDnsOff(profileDir: string): Promise<void> {
  const file = path.join(profileDir, LOCAL_STATE_FILE);
  let current: string | null = null;
  try {
    current = await fsp.readFile(file, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }

  const next = withSecureDnsOff(current);
  if (next === current) return;

  await fsp.mkdir(profileDir, { recursive: true });
  // Через временный файл: оборванная запись не должна оставить половину Local State.
  const tmp = `${file}.sda-tmp`;
  await fsp.writeFile(tmp, next);
  await fsp.rename(tmp, file);
}
