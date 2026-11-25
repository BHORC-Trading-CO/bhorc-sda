// Срок жизни refresh-токена Steam (SDA-59). Steam выдаёт его примерно на 200 дней; просроченный
// или отозванный токен на GenerateAccessTokenForApp получает AccessDenied, и раньше пользователь
// видел только «Error: AccessDenied».

// EResult, которыми Steam отвечает на мёртвый refresh-токен: AccessDenied, Revoked, Expired.
const DEAD_TOKEN_RESULTS = new Set([15, 26, 27]);
const DEAD_TOKEN_NAMES = new Set(["AccessDenied", "Revoked", "Expired"]);

/** exp из JWT refresh-токена в миллисекундах; null, если токен не JWT или exp нет. */
export function refreshTokenExpiresAt(token: unknown): number | null {
    if (typeof token !== "string") return null;
    const payload = token.split(".")[1];
    if (!payload) return null;
    try {
        const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
        return typeof data?.exp === "number" && Number.isFinite(data.exp) ? data.exp * 1000 : null;
    } catch {
        return null;
    }
}

/** Токен с exp в прошлом. Без exp не судим: решает Steam. */
export function isRefreshTokenExpired(token: unknown, now: number = Date.now()): boolean {
    const expiresAt = refreshTokenExpiresAt(token);
    return expiresAt !== null && expiresAt <= now;
}

/** Ошибка steam-session о мёртвом токене (eresult или имя EResult в сообщении). */
export function isDeadTokenError(err: unknown): boolean {
    if (!err || typeof err !== "object") return false;
    const { eresult, message } = err as { eresult?: unknown; message?: unknown };
    if (typeof eresult === "number" && DEAD_TOKEN_RESULTS.has(eresult)) return true;
    return typeof message === "string" && DEAD_TOKEN_NAMES.has(message.trim());
}
