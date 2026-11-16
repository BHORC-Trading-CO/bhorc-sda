import { randomBytes } from "crypto";
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
 * Единственный способ записать Local State профиля. Что бы ни пришло на вход, в файле окажется
 * выключенный secure DNS, и окажется целиком: пишем во временный файл со своим именем и
 * переименовываем.
 *
 * Зачем так строго: запуск браузера можно отменить новым запуском, и отменённый ещё дописывает
 * свои файлы. Если бы он писал Local State сам (как раньше createProfile), его запись легла бы
 * поверх уже выставленной настройки, и браузер стартовал бы с DoH по умолчанию. Теперь любая
 * запись, чья бы ни оказалась последней, даёт файл с выключенным DoH.
 */
export async function writeLocalState(profileDir: string, content: string | null): Promise<void> {
  const file = path.join(profileDir, LOCAL_STATE_FILE);
  await fsp.mkdir(profileDir, { recursive: true });
  // Имя своё у каждой записи: общий временный файл второй писатель обрезал бы под первым.
  const tmp = `${file}.sda-tmp-${process.pid}-${randomBytes(6).toString("hex")}`;
  try {
    await fsp.writeFile(tmp, withSecureDnsOff(content));
    await fsp.rename(tmp, file);
  } catch (err) {
    await fsp.rm(tmp, { force: true }).catch(() => undefined);
    throw err;
  }
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

  if (withSecureDnsOff(current) === current) return;
  await writeLocalState(profileDir, current);
}
