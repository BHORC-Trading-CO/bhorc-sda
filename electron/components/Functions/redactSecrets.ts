// Страховка от утечки секретов в консоль (терминал main-процесса и DevTools окон).
// Вызовы console.* с секретами мы вычищаем, но любой новый console.log(steamAccount)
// снова выведет пароль, maFile и токены. Поэтому console во всех процессах обёрнут:
// значения секретных ключей заменяются на "[redacted]", а в строках маскируются JWT,
// логины/пароли в адресах прокси, steamLoginSecure, secret= из otpauth и key=/token=.
//
// Для разработчиков: DevTools показывает источником каждого лога этот файл. Чтобы видеть
// настоящее место вызова, добавьте redactSecrets.ts в Ignore List (Settings > Ignore List).

export const REDACTED = "[redacted]";

// Сравниваем без регистра и без "_"/"-": shared_secret, sharedSecret и SharedSecret — одно и то же.
const normalizeKey = (key: string) => key.toLowerCase().replace(/[_-]/g, "");
const SECRET_KEYS = new Set(
    [
        "password", "mailPassword", "username",
        "maFile", "smaFile", "shared_secret", "identity_secret", "revocation_code", "secret_1",
        "Session", "AccessToken", "RefreshToken", "SessionID", "steamLoginSecure", "cookies", "cookie", "webCookies",
        "familyViewPin", "pin", "activation_code", "secretKey", "key", "apiKey", "tmApiKey", "marketApiKey",
        "token", "access_token", "authorization", "proxy-authorization",
    ].map(normalizeKey)
);

const PROXY_TOKEN = /^[^:@\/]+:[^@\/]+@[\w.-]+:\d+/;
const STRING_PATTERNS: [RegExp, string | ((match: string) => string)][] = [
    [/eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g, "[redacted-jwt]"],
    // Схема ограничена по длине: без этого регулярка квадратична на длинных строках вида "a.a.a.".
    [/(\b[a-z][a-z0-9+.-]{0,31}:\/\/)[^\s:@\/]+:[^\s@\/]+@/gi, `$1${REDACTED}@`],
    // "login:password@host:port" без схемы (формат массового импорта прокси): проверяем по токенам,
    // чтобы не было бэктрекинга по всей строке.
    [/[^\s"'()=,]+/g, (token: string) => (PROXY_TOKEN.test(token) ? token.replace(/^[^@]+@/, `${REDACTED}@`) : token)],
    [/(steamLoginSecure=)[^;\s"']+/gi, `$1${REDACTED}`],
    [/([?&](?:secret|key|access_token|token)=)[^&\s"']+/gi, `$1${REDACTED}`],
];

const MAX_DEPTH = 6;
const MAX_ITEMS = 200;
const MAX_NODES = 5000;

export function redactString(text: string): string {
    return STRING_PATTERNS.reduce(
        (acc, [pattern, replacement]) => acc.replace(pattern, replacement as string),
        text
    );
}

interface Walk {
    ancestors: object[];
    nodes: number;
}

function redactValue(value: unknown, depth: number, walk: Walk): unknown {
    if (typeof value === "string") return redactString(value);
    if (value === null || typeof value !== "object") return value;
    if (value instanceof Date || value instanceof RegExp) return value;
    if (typeof URL !== "undefined" && value instanceof URL) return redactString(value.href);
    if (walk.ancestors.includes(value)) return "[Circular]";
    if (depth >= MAX_DEPTH) return "[Object]";
    if (++walk.nodes > MAX_NODES) return "[Truncated]";
    if (typeof (value as { byteLength?: unknown }).byteLength === "number") return `[Binary ${(value as { byteLength: number }).byteLength}]`;

    walk.ancestors.push(value);
    try {
        if (value instanceof Error) {
            const copy = new Error(redactString(String(value.message)));
            copy.name = value.name;
            copy.stack = value.stack ? redactString(value.stack) : undefined;
            // code, errno, eresult и т.п. нужны для отладки — копируем, тоже через маскировку.
            Object.assign(copy, redactObjectFields(value, depth, walk));
            const cause = (value as { cause?: unknown }).cause;
            if (cause !== undefined) (copy as { cause?: unknown }).cause = redactValue(cause, depth + 1, walk);
            return copy;
        }
        if (Array.isArray(value)) {
            const out = value.slice(0, MAX_ITEMS).map((item) => redactValue(item, depth + 1, walk));
            if (value.length > MAX_ITEMS) out.push(`…ещё ${value.length - MAX_ITEMS}`); // i18n-ok: только лог
            return out;
        }
        if (value instanceof Map) {
            return new Map([...value.entries()].slice(0, MAX_ITEMS).map(([k, v]) => [
                k,
                typeof k === "string" && SECRET_KEYS.has(normalizeKey(k)) ? REDACTED : redactValue(v, depth + 1, walk),
            ]));
        }
        if (value instanceof Set) return new Set([...value].slice(0, MAX_ITEMS).map((v) => redactValue(v, depth + 1, walk)));
        return redactObjectFields(value, depth, walk);
    } finally {
        walk.ancestors.pop();
    }
}

function redactObjectFields(value: object, depth: number, walk: Walk): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value).slice(0, MAX_ITEMS)) {
        let item: unknown;
        try {
            item = (value as Record<string, unknown>)[key];
        } catch (err) {
            continue;
        }
        if (typeof item === "function") continue;
        out[key] = SECRET_KEYS.has(normalizeKey(key)) && item !== null && item !== undefined && item !== ""
            ? REDACTED
            : redactValue(item, depth + 1, walk);
    }
    return out;
}

export function redactSecrets(value: unknown): unknown {
    return redactValue(value, 0, { ancestors: [], nodes: 0 });
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

// Единственный осознанный вывод секретов: резервная копия ответа Steam с секретами
// аутентификатора, когда записать её на диск не удалось (см. setupGuard). Пишем мимо
// обёртки console, иначе revocation_code придёт в лог как "[redacted]" и потеряется.
export function writeUnredacted(label: string, value: unknown): void {
    const stream = typeof process !== "undefined" ? process.stdout : undefined;
    const text = `${label}\n${JSON.stringify(value, null, 2)}\n`;
    if (stream && typeof stream.write === "function") stream.write(text);
}
