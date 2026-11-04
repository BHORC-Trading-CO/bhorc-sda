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

export default function proxyUrl(
    proxy?: { id?: string; host: string; port: string | number; username: string; password: string } | null
): string | null {
    if (proxy == null) return null;
    if (!proxy.host?.trim() || !String(proxy.port ?? "").trim() || !Number(proxy.port)) {
        throw new ProxyUnavailableError(proxy.id);
    }
    const user = encodeURIComponent(proxy.username || "");
    const pass = encodeURIComponent(proxy.password || "");
    return `http://${user}:${pass}@${proxy.host}:${proxy.port}`;
}
