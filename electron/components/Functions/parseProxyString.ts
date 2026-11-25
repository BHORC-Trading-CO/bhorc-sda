import ProxySetupInterface from "../../interfaces/Proxy/ProxySetupInterface";
import { canonicalProxyHost, isIpAddress, isProxyPort } from "./proxyAddress";

// Разбор строки прокси. Без импортов Node: файл берут и рендерер (поля форм), и main (импорт списка),
// чтобы в окне и в хранилище был один и тот же прокси (SDA-64). Форматы:
//   логин:пароль@host:port   (в пароле могут быть ":" и "@")
//   host:port:логин:пароль   и   host:port
//   http://логин:пароль@host:port   (https:// тоже: так пишут HTTP-прокси; логин и пароль %-кодированы)
// IPv6 — в скобках. Строку, которую можно прочитать двояко, не угадываем: сохранился бы чужой пароль.

export type ProxyRejectReason = "format" | "scheme" | "ambiguous" | "address";
export type ProxyParseResult = { proxy: ProxySetupInterface, reason?: undefined } | { proxy?: undefined, reason: ProxyRejectReason };

export function parseProxy(value: string): ProxyParseResult {
    const text = value.trim();
    const url = /^([a-z][a-z0-9+.-]*):\/\/(.*)$/i.exec(text);
    if (url) return /^https?$/i.test(url[1]) ? parseUrl(url[2].replace(/\/$/, "")) : { reason: "scheme" };

    const login = loginFirst(text);
    const host = hostFirst(text);
    if (login?.proxy && host) return { reason: "ambiguous" };
    if (login?.proxy) return login;
    if (host) return isReversible(host) ? { reason: "ambiguous" } : { proxy: host };
    return login ?? { reason: "format" };
}

/** Поля для форм: пустые, пока строка не прочитана однозначно. */
export default function parseProxyString(value: string): ProxySetupInterface {
    return parseProxy(value).proxy ?? { host: "", port: "", username: "", password: "" };
}

/** Строка, которая читается обратно в тот же прокси. */
export function formatProxyString({ host, port, username, password }: ProxySetupInterface): string {
    const plain = username || password ? `${username}:${password}@${host}:${port}` : `${host}:${port}`;
    const read = parseProxy(plain).proxy;
    if (read && read.host === host && read.port === port && read.username === username && read.password === password) return plain;
    const credentials = username || password ? `${encodeURIComponent(username)}:${encodeURIComponent(password)}@` : "";
    return `http://${credentials}${host}:${port}`;
}

function parseUrl(text: string): ProxyParseResult {
    const at = text.lastIndexOf("@");
    const address = parseAddress(text.slice(at + 1));
    if (!address) return { reason: "address" };
    if (at === -1) return { proxy: { ...address, username: "", password: "" } };
    const [username, password] = splitOnce(text.slice(0, at));
    if (password === null || (!username && !password)) return { reason: "format" };
    try {
        return { proxy: { ...address, username: decodeURIComponent(username), password: decodeURIComponent(password) } };
    } catch {
        return { reason: "format" };
    }
}

// null — это не "логин:пароль@…".
function loginFirst(text: string): ProxyParseResult | null {
    const at = text.lastIndexOf("@");
    if (at === -1) return null;
    const [username, password] = splitOnce(text.slice(0, at));
    if (!username || !password) return { reason: "format" };
    const address = parseAddress(text.slice(at + 1));
    return address ? { proxy: { ...address, username, password } } : { reason: "address" };
}

function hostFirst(text: string): ProxySetupInterface | null {
    const match = /^(\[[^\]]+\]|[^:@\s]+):([0-9]+)(?::([^:]+):(.+))?$/.exec(text);
    if (!match) return null;
    const [, host, port, username = "", password = ""] = match;
    // Имя без точки здесь не принимаем: "user:1234" — это, скорее, недописанные логин и пароль.
    if (!looksLikeHost(host) || !isProxyPort(port)) return null;
    return { host, port, username, password };
}

// "a.test:8080:b.test:9090": может быть и логин:пароль:host:port. Если адресом похоже только начало, вопроса нет.
function isReversible({ host, username, password }: ProxySetupInterface): boolean {
    return looksLikeHost(username) && isProxyPort(password) && !(isIpAddress(host) && !isIpAddress(username));
}

function looksLikeHost(host: string): boolean {
    return isIpAddress(host) || host === "localhost" || (host.includes(".") && canonicalProxyHost(host) !== null);
}

function parseAddress(text: string): { host: string, port: string } | null {
    const match = /^(\[[^\]]+\]|[^:]+):([0-9]+)$/.exec(text);
    if (!match || canonicalProxyHost(match[1]) === null || !isProxyPort(match[2])) return null;
    return { host: match[1], port: match[2] };
}

function splitOnce(text: string): [string, string | null] {
    const colon = text.indexOf(":");
    return colon === -1 ? [text, null] : [text.slice(0, colon), text.slice(colon + 1)];
}
