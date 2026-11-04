import sanitizeAvatarUrl from '../Functions/sanitizeAvatarUrl';

// Только известные CDN и путь economy/image. Без query, userinfo, портов,
// escape-последовательностей и нормализации /../; неизвестное остаётся заглушкой.
const ECONOMY_ICON = /^https:\/\/(?:community\.(?:(?:akamai|fastly|cloudflare)\.)?steamstatic\.com|steamcommunity-a\.akamaihd\.net|steamcommunity\.com)\/economy\/image\/[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*$/;

export function sanitizeConfirmationIconUrl(value: unknown): string | null {
    if (typeof value !== 'string' || !value || value.length > 4096) return null;
    if (sanitizeAvatarUrl(value) === value) return value;
    const match = ECONOMY_ICON.exec(value);
    return match && match[0] === value ? value : null;
}

