export const DEFAULT_AVATAR_URL = "https://avatars.akamai.steamstatic.com/fef49e7fa7e1997310d705b2a6158ff8dc1cdfeb.jpg";

// Проверяем исходную строку: URL-парсер иначе скроет обходы через /../, пробелы и экранирование.
const STEAM_AVATAR_URL = /^https:\/\/avatars\.(?:akamai|fastly|cloudflare)\.steamstatic\.com\/[0-9a-f]{40}(?:_medium|_full)?\.jpg$/;

export default function sanitizeAvatarUrl(url: unknown): string {
    // Принимаем только полное совпадение без нормализации исходного URL.
    const match = typeof url === "string" ? STEAM_AVATAR_URL.exec(url) : null;
    return match && match[0] === url ? url as string : DEFAULT_AVATAR_URL;
}
