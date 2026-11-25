/**
 * Годный shared_secret: base64 не короче 16 байт (у Steam 20 байт, 28 знаков) или 40 hex-знаков.
 * Из пустого или нечитаемого ключа библиотека собирает правдоподобный, но неверный код (SDA-62).
 * Без Buffer: проверку использует и окно.
 */
export default function isGuardSecret(value: unknown): value is string {
    if (typeof value !== "string" || !/^[A-Za-z0-9+/_-]+={0,2}$/.test(value.trim())) return false;
    const digits = value.trim().replace(/=+$/, "").length;
    return digits % 4 !== 1 && Math.floor(digits * 3 / 4) >= 16;
}
