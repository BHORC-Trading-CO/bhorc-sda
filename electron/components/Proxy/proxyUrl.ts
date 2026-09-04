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
export default function proxyUrl(
    proxy?: { host: string; port: string | number; username: string; password: string } | null
): string | null {
    if (!proxy || !proxy.host || !proxy.port) return null;
    const user = encodeURIComponent(proxy.username || "");
    const pass = encodeURIComponent(proxy.password || "");
    return `http://${user}:${pass}@${proxy.host}:${proxy.port}`;
}
