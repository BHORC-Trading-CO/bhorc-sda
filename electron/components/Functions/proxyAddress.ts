// Адрес прокси: DNS-имя, IPv4 или IPv6 в скобках, и ничего больше (SDA-64). Строка host:port уходит
// в --proxy-server, а у Chromium это язык правил: "http=proxy.test:80" — прокси только для HTTP, весь
// HTTPS пошёл бы напрямую; ";" и "," отделяют другие правила; значение флага должно быть ASCII.
// Без импортов Node: файл берёт и рендерер (разбор строки в формах).

const LABEL = "[a-z0-9_](?:[a-z0-9_-]{0,61}[a-z0-9_])?";
const DNS_NAME = new RegExp(`^(?=.{1,254}$)${LABEL}(?:\\.${LABEL})*\\.?$`, "i");
const OCTET = "(?:25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)";
const IPV4 = new RegExp(`^${OCTET}(?:\\.${OCTET}){3}$`);

export function isIpAddress(host: string): boolean {
    if (IPV4.test(host)) return true;
    if (!/^\[[0-9a-f:.]+\]$/i.test(host)) return false;
    try {
        return new URL(`http://${host}/`).hostname.startsWith("[");
    } catch {
        return false;
    }
}

export function isProxyHost(host: string): boolean {
    if (isIpAddress(host)) return true;
    if (!DNS_NAME.test(host)) return false;
    // "1.2.3", "0x7f.1": имя с числовым концом браузеры читают как сокращённый IPv4.
    const last = host.replace(/\.$/, "").split(".").pop()!;
    return !/^(?:\d+|0x[0-9a-f]*)$/i.test(last);
}

export function isProxyPort(port: string): boolean {
    return /^[0-9]{1,5}$/.test(port) && Number(port) >= 1 && Number(port) <= 65535;
}

/** Host в том виде, в котором он хранится и уходит в клиенты (IDN — в punycode), или null. */
export function canonicalProxyHost(host: string): string | null {
    if (/^[\x00-\x7f]*$/.test(host)) return isProxyHost(host) ? host : null;
    if (/[\s/\\?#@%:[\]]/.test(host)) return null;
    try {
        const ascii = new URL(`http://${host}/`).hostname;
        return isProxyHost(ascii) ? ascii : null;
    } catch {
        return null;
    }
}
