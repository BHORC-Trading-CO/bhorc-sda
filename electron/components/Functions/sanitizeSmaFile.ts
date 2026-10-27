import SmaFileInterface from "../../interfaces/SteamAccount/SmaFileInterface";
import MaFileInterface from "../../interfaces/SteamAccount/MaFileInterface";
import SessionInterface from "../../interfaces/SteamAccount/SessionInterface";
import ProxySetupInterface from "../../interfaces/Proxy/ProxySetupInterface";
import sanitizeAvatarUrl from "./sanitizeAvatarUrl";
import { getSteamID64 } from "./steamAccountSearch";

type Data = Record<string, unknown>;

function object(value: unknown): Data {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new Error("Неправильный объект в smaFile");
    }
    return value as Data;
}

function own(data: Data, key: string): unknown {
    return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : undefined;
}

function string(data: Data, key: string, fallback = ""): string {
    const value = own(data, key);
    if (value === undefined) return fallback;
    if (typeof value !== "string") throw new Error(`Неправильное поле ${key}`);
    return value;
}

function primitive(value: unknown): boolean {
    return value === null || typeof value === "string" || typeof value === "boolean" ||
        (typeof value === "number" && Number.isFinite(value));
}

function safeKey(key: string): boolean {
    return !!key && !key.includes(".") && !["__proto__", "prototype", "constructor"].includes(key);
}

function identifier(value: unknown): string {
    if (typeof value === "string") return value;
    if (typeof value === "number" && Number.isInteger(value) && value >= 0) return String(value);
    if (value && typeof value === "object") {
        // json-bigint читает старые числовые идентификаторы как BigNumber.
        const chunks = own(value as Data, "c");
        if (Array.isArray(chunks) && chunks.length > 0 && chunks.every(chunk =>
            Number.isSafeInteger(chunk) && chunk >= 0 && chunk < 1e14)) {
            const digits = getSteamID64({ Session: { SteamID: { c: chunks } } } as any);
            const exponent = own(value as Data, "e");
            const sign = own(value as Data, "s");
            if (sign !== undefined && sign !== 1) throw new Error("Отрицательный идентификатор maFile");
            if (exponent === undefined) return digits;
            // BigNumber удаляет хвостовые нулевые чанки. Восстанавливаем их по экспоненте,
            // ограничивая длину недоверенного числа и не принимая дробные идентификаторы.
            if (typeof exponent === "number" && Number.isInteger(exponent) && exponent >= 0 && exponent < 100 &&
                !/[1-9]/.test(digits.slice(exponent + 1))) {
                return digits.padEnd(exponent + 1, "0").slice(0, exponent + 1);
            }
        }
    }
    throw new Error("Неправильный числовой идентификатор maFile");
}

function sanitizeSession(value: unknown): SessionInterface {
    const source = object(value);
    const result: SessionInterface = {};
    for (const key of ["SessionID", "SteamLoginSecure", "WebCookie", "SteamRememberLogin", "AccessToken", "RefreshToken"] as const) {
        if (own(source, key) !== undefined) result[key] = string(source, key);
    }
    if (own(source, "SteamLogin") !== undefined) {
        result.SteamLogin = source.SteamLogin === null ? null : string(source, "SteamLogin");
    }
    const steamID = own(source, "SteamID");
    if (steamID !== undefined && steamID !== null) result.SteamID = identifier(steamID);
    return result;
}

function sanitizeMaFile(value: unknown): MaFileInterface {
    const source = object(value);
    const result: Data = {};
    // Не теряем скалярные расширения других SDA-инструментов, но не переносим деревья и опасные ключи.
    for (const key of Object.keys(source)) {
        if (safeKey(key) && key !== "Session" && primitive(source[key])) result[key] = source[key];
    }
    for (const key of ["shared_secret", "revocation_code", "uri", "account_name", "identity_secret", "secret_1", "device_id"]) {
        if (own(source, key) !== undefined) result[key] = string(source, key);
    }
    for (const key of ["serial_number", "token_gid"]) {
        if (own(source, key) !== undefined) result[key] = identifier(source[key]);
    }
    if (own(source, "server_time") !== undefined && !(typeof source.server_time === "string" ||
        (typeof source.server_time === "number" && Number.isFinite(source.server_time)))) {
        throw new Error("Неправильное поле server_time");
    }
    if (own(source, "status") !== undefined && !(typeof source.status === "number" && Number.isFinite(source.status))) {
        throw new Error("Неправильное поле status");
    }
    if (own(source, "fully_enrolled") !== undefined && typeof source.fully_enrolled !== "boolean") {
        throw new Error("Неправильное поле fully_enrolled");
    }
    if (own(source, "Session") !== undefined && source.Session !== null) result.Session = sanitizeSession(source.Session);
    return result as unknown as MaFileInterface;
}

export function sanitizeProxySetup(value: unknown): ProxySetupInterface {
    const source = object(value);
    const host = string(source, "host");
    const rawPort = own(source, "port");
    const port = typeof rawPort === "number" ? String(rawPort) : string(source, "port");
    // host/port встраиваются в URL прокси; разделители URL и unix-сокеты здесь недопустимы.
    if (!host || /[\s/\\?#@%]/.test(host) ||
        !/^[0-9]{1,5}$/.test(port) || Number(port) < 1 || Number(port) > 65535) {
        throw new Error("Неправильный адрес прокси");
    }
    // URL проверяет также IPv6, IDN и абсолютные DNS-имена с точкой на конце.
    try {
        const address = new URL(`http://${host}:${port}`);
        if (!address.hostname || address.username || address.password || address.pathname !== "/") throw new Error();
    } catch {
        throw new Error("Неправильный адрес прокси");
    }
    return { host, port, username: string(source, "username"), password: string(source, "password") };
}

export default function sanitizeSmaFile(value: unknown): SmaFileInterface {
    const source = object(value);
    const secondary = object(own(source, "secondary"));
    const accountName = string(source, "accountName");
    const password = string(source, "password");
    if (!accountName || !password) throw new Error("Не указаны логин или пароль аккаунта");
    const pin = own(source, "familyViewPin");
    if (pin !== undefined && pin !== null && !(typeof pin === "number" && Number.isInteger(pin) && pin >= 0 && pin <= 9999)) {
        throw new Error("Неправильный familyViewPin");
    }
    const result: SmaFileInterface = {
        accountName,
        password,
        maFile: sanitizeMaFile(own(source, "maFile")),
        familyViewPin: pin == null ? null : pin as number,
        useSteamCookies: own(source, "useSteamCookies") === true,
        secondary: {
            nickname: string(secondary, "nickname"),
            avatarUrl: sanitizeAvatarUrl(own(secondary, "avatarUrl")),
            level: typeof own(secondary, "level") === "number" && Number.isFinite(secondary.level) ? secondary.level as number : 0,
            ktState: own(secondary, "ktState") === true,
            tpState: typeof own(secondary, "tpState") === "string" ? secondary.tpState as string : own(secondary, "tpState") !== false,
            tradeState: own(secondary, "tradeState") === true,
        },
    };
    for (const key of ["profileName", "mail", "mailPassword"] as const) {
        if (own(source, key) !== undefined) result[key] = string(source, key);
    }
    if (own(source, "proxy") !== undefined && source.proxy !== null) result.proxy = sanitizeProxySetup(source.proxy);
    return result;
}
