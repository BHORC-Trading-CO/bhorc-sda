/**
 * Единая точка сборки URL прокси для ВСЕХ сетевых клиентов приложения
 * (steam-session, steamcommunity/request, загрузка аватара, гео-проверка).
 *
 * Правило приватности: если к аккаунту привязан прокси — весь его трафик обязан
 * идти через этот прокси, прямой запрос недопустим. Если прокси не привязан —
 * запросы идут с реального IP (осознанный выбор пользователя).
 *
 * Логин/пароль экранируем: символы @ : / в креденшелах ломают разбор URL и
 * запрос ушёл бы не туда (или мимо прокси).
 */
import ProxyUnavailableError from "./ProxyUnavailableError";
import { isProxyHost, isProxyPort } from "../Functions/proxyAddress";

/**
 * Адрес сохранённого прокси для сетевых клиентов и для --proxy-server браузера (SDA-64). Запись с любым
 * другим host (старая или правленная вручную) не работает вовсе, а не уходит в Chromium как правило.
 */
export function proxyEndpoint(proxy: { id?: string; host: string; port: string | number }): { host: string; port: string } {
    const host = String(proxy.host ?? "").trim();
    const port = String(proxy.port ?? "").trim();
    if (!isProxyHost(host) || !isProxyPort(port)) throw new ProxyUnavailableError(proxy.id);
    return { host, port };
}

export default function proxyUrl(
    proxy?: { id?: string; host: string; port: string | number; username: string; password: string } | null
): string | null {
    if (proxy == null) return null;
    const { host, port } = proxyEndpoint(proxy);
    const user = encodeURIComponent(proxy.username || "");
    const pass = encodeURIComponent(proxy.password || "");
    return `http://${user}:${pass}@${host}:${port}`;
}
