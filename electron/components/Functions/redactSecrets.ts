// Страховка от утечки секретов в консоль (терминал main-процесса и DevTools окон).
// Вызовы console.* с секретами мы вычищаем, но любой новый console.log(steamAccount)
// снова выведет пароль, maFile и токены. Поэтому console во всех процессах обёрнут:
// значения секретных ключей заменяются на "[redacted]", а в строках маскируются JWT,
// логины/пароли в адресах прокси, steamLoginSecure и secret= из otpauth-ссылок.

export const REDACTED = "[redacted]";

const SECRET_KEYS = new Set(
    [
        "password", "mailPassword", "username",
        "maFile", "smaFile", "shared_secret", "identity_secret", "revocation_code", "secret_1",
        "Session", "session", "AccessToken", "RefreshToken", "_accessToken", "_refreshToken", "accessToken", "refreshToken",
        "SessionID", "sessionid", "steamLoginSecure", "cookies", "cookie", "webCookies",
        "familyViewPin", "pin", "activation_code", "secretKey", "key", "tmApiKey", "marketApiKey", "token", "access_token",
    ].map((k) => k.toLowerCase())
);

const STRING_PATTERNS: [RegExp, string][] = [
    [/eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g, "[redacted-jwt]"],
    [/(\b[a-z][a-z0-9+.-]*:\/\/)[^\s:@\/]+:[^\s@\/]+@/gi, `$1${REDACTED}@`],
    [/(^|[\s"'(=])[^\s:@\/"'()=]+:[^\s:@\/"'()]+@(?=[\w.-]+:\d+)/g, `$1${REDACTED}@`],
    [/(steamLoginSecure=)[^;\s"']+/gi, `$1${REDACTED}`],
    [/([?&]secret=)[^&\s"']+/gi, `$1${REDACTED}`],
];

const MAX_DEPTH = 6;
const MAX_KEYS = 200;

export function redactString(text: string): string {
    return STRING_PATTERNS.reduce((acc, [pattern, replacement]) => acc.replace(pattern, replacement), text);
}

export function redactSecrets(value: unknown, depth = 0, seen: WeakSet<object> = new WeakSet()): unknown {
    if (typeof value === "string") return redactString(value);
    if (value === null || typeof value !== "object") return value;
    if (value instanceof Error) {
        const copy = new Error(redactString(value.message));
        copy.name = value.name;
        copy.stack = value.stack ? redactString(value.stack) : undefined;
        return copy;
    }
    if (seen.has(value)) return "[Circular]";
    if (depth >= MAX_DEPTH) return "[Object]";
    seen.add(value);
    if (Array.isArray(value)) return value.slice(0, MAX_KEYS).map((item) => redactSecrets(item, depth + 1, seen));
    if (typeof (value as { byteLength?: unknown }).byteLength === "number") return `[Binary ${(value as { byteLength: number }).byteLength}]`;

    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value).slice(0, MAX_KEYS)) {
        let item: unknown;
        try {
            item = (value as Record<string, unknown>)[key];
        } catch (err) {
            continue;
        }
        if (typeof item === "function") continue;
        out[key] = SECRET_KEYS.has(key.toLowerCase()) && item !== null && item !== undefined && item !== ""
            ? REDACTED
            : redactSecrets(item, depth + 1, seen);
    }
    return out;
}

const METHODS = ["log", "info", "warn", "error", "debug", "trace"] as const;
const INSTALLED = Symbol.for("bhorc-sda.consoleRedaction");

export function installConsoleRedaction(target: Console = console): void {
    const marked = target as Console & { [INSTALLED]?: boolean };
    if (marked[INSTALLED]) return;
    for (const method of METHODS) {
        const original = target[method];
        if (typeof original !== "function") continue;
        target[method] = (...args: unknown[]) => {
            let safe: unknown[];
            try {
                safe = args.map((arg) => redactSecrets(arg));
            } catch (err) {
                safe = ["[log dropped: redaction failed]"];
            }
            return (original as (...a: unknown[]) => void).apply(target, safe);
        };
    }
    marked[INSTALLED] = true;
}
