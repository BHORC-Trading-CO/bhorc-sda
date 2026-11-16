import SteamCommunity from "steamcommunity";
import { Response } from "request";
import SecondaryInterface from "../../../interfaces/SteamAccount/SecondaryInterface";
import ChangableSecondaryInterface from "../../../interfaces/SteamAccount/ChangableSecondaryInterface";
import sanitizeAvatarUrl, { DEFAULT_AVATAR_URL } from "../../Functions/sanitizeAvatarUrl";
import { t } from "../../../i18n";

// Всё, что даёт одно обновление аккаунта: профиль и статусы (secondary) и баланс (changableSecondary).
export interface AccountData {
    secondary: SecondaryInterface;
    changableSecondary: ChangableSecondaryInterface;
}

type Identity = Pick<SecondaryInterface, "nickname" | "level" | "avatarUrl">;
type Wallet = ChangableSecondaryInterface["steam"];

// Одно обновление аккаунта (кнопка в строке, обновление сессии, создание аккаунта) — три запроса
// по очереди, каждый ровно один раз:
//  1. /miniprofile/<accountid>/json (~1 КБ) — ник, уровень, аватар. Отвечает и для закрытого
//     профиля. Страница профиля (~73 КБ) — только запасной путь, если miniprofile не ответил
//     ожидаемым JSON; при удачном miniprofile она не загружается.
//  2. /market/ (~1 МБ) — КТ (текст), ТП и баланс кошелька (g_rgWalletInfo) с одной страницы.
//  3. /market/eligibilitycheck/ — трейды и биты бана/блокировки для КТ.
// Раньше профиль тянулся трижды, а /market/ дважды — залпом это быстро выбивало 429.
//
// Профиль критичен (без него нет ника/аватара): если не пришли ни miniprofile, ни страница
// профиля, обновление падает целиком. Статусы и баланс — best-effort: неудачная проверка даёт
// «неизвестно» (null) или строку ошибки баланса, но не роняет уже полученный профиль.
export async function getAccountData(community: SteamCommunity): Promise<AccountData> {
    const identity = await getIdentity(community);

    let market: MarketPage | null = null;
    let marketError = "";
    try {
        market = parseMarketPage(await getMarketPage(community));
    } catch (err) {
        // Только строка, не объект Error: результат уходит в рендерер (см. getChangableSecondaries)
        marketError = String(err);
        console.log(`getAccountData: /market/ не загружен (${err}), КТ и ТП неизвестны`);
    }

    let trade: TradeStatus | null = null;
    try {
        trade = await getTradeState(community);
    } catch (err) {
        console.log(`getAccountData: trade-статус не получен (${err}), статус неизвестен`);
    }

    return {
        secondary: {
            ...identity,
            ktState: combineKtState(market ? market.ktLocked : null, trade ? trade.ktLocked : null),
            tpState: market ? market.tpState : null,
            tradeState: trade ? trade.tradeState : null,
        },
        changableSecondary: { steam: market ? market.wallet : walletError(marketError) },
    };
}

// Создание аккаунта (maFileLogin, setupGuard) сохраняет только secondary.
export async function getSecondaries(community: SteamCommunity): Promise<SecondaryInterface> {
    return (await getAccountData(community)).secondary;
}

// Только баланс (старт приложения, переход на страницу таблицы): одна загрузка /market/.
export async function getChangableSecondaries(community: SteamCommunity): Promise<ChangableSecondaryInterface> {
    let steam: Wallet;
    try {
        steam = parseMarketPage(await getMarketPage(community)).wallet;
    } catch (err) {
        // Только строка (как в ChangableSecondaryInterface), не объект Error: эти данные уходят
        // в рендерер внутри списка аккаунтов, а V8 в Electron 17 после Error неверно читает
        // обратные ссылки IPC-сообщения — proxy и smaFile следующих аккаунтов приходили чужими
        // объектами (см. steamBalance.test.ts).
        steam = walletError(String(err));
    }
    return { steam };
}

async function getIdentity(community: SteamCommunity): Promise<Identity> {
    const url = miniprofileUrl(community);
    if (url) {
        try {
            const identity = parseMiniprofile(await httpGetBody(community, url));
            if (identity) return identity;
            console.log("getAccountData: miniprofile ответил не тем JSON, беру страницу профиля");
        } catch (err) {
            // Прокси удалён — страница профиля упадёт так же, второй попытки не нужно.
            if ((err as { code?: string } | null)?.code === "PROXY_UNAVAILABLE") throw err;
            console.log(`getAccountData: miniprofile не загружен (${err}), беру страницу профиля`);
        }
    }
    const body = await getProfilePage(community);
    return { nickname: parseUsername(body), level: parseLevel(body), avatarUrl: parseAvatarURL(body) };
}

// accountid = SteamID64 − 76561197960265728; у SteamID из cookie он уже посчитан.
function miniprofileUrl(community: SteamCommunity): string | null {
    const accountid = community.steamID ? community.steamID.accountid : 0;
    return Number.isInteger(accountid) && accountid > 0
        ? `https://steamcommunity.com/miniprofile/${accountid}/json`
        : null;
}

// {"level":16,"persona_name":"…","avatar_url":"https://avatars.akamai.steamstatic.com/<40 hex>_full.jpg",…}
// Всё, что не похоже на такой ответ, — null: тогда берём страницу профиля.
export function parseMiniprofile(body: unknown): Identity | null {
    let data: unknown;
    try {
        data = typeof body === "string" ? JSON.parse(body) : null;
    } catch (err) {
        return null;
    }
    if (!data || typeof data !== "object" || Array.isArray(data)) return null;
    const { level, persona_name, avatar_url } = data as Record<string, unknown>;
    if (typeof level !== "number" || !Number.isInteger(level) || level < 0) return null;
    if (typeof persona_name !== "string" || !persona_name.trim()) return null;
    return { nickname: persona_name.trim(), level, avatarUrl: sanitizeAvatarUrl(avatar_url) };
}

// Тянет HTML профиля один раз; запасной путь для ника/уровня/аватара.
function getProfilePage(community: SteamCommunity): Promise<string> {
    return httpGetBody(community, `https://steamcommunity.com/profiles/${community.steamID}/`);
}

// Тянет HTML раздела маркета один раз; из него kt/tp статусы и баланс.
function getMarketPage(community: SteamCommunity): Promise<string> {
    return httpGetBody(community, "https://steamcommunity.com/market/");
}

function httpGetBody(community: SteamCommunity, uri: string): Promise<string> {
    return new Promise<string>((resolve, reject) => {
        try {
            community.httpRequestGet({ uri }, (err: SteamCommunity.CallbackError, response: Response, body: Response["body"]) => {
                if (err) return reject(err);
                if (response.statusCode == 200) return resolve(body);
                reject(new Error(`${response.statusCode}: ${response.statusMessage}`));
            });
        } catch (err) {
            return reject(err);
        }
    });
}

export function parseUsername(body: string): string {
    // Актуальная разметка Steam: <span class="actual_persona_name">Ник</span> в хедере профиля.
    // Раньше ник брался после первого data-miniprofile, но теперь этот атрибут висит на
    // блоке аватара, и парсер возвращал пробелы/табы вместо ника.
    const span = /class="actual_persona_name">([^<]*)</.exec(body);
    if (span) {
        const nickname = decodeHtmlEntities(span[1]).trim();
        if (nickname) return nickname;
    }
    // Фолбэк: g_rgProfileData = {"personaname":"..."} (JSON-экранирование)
    const json = /"personaname":"((?:[^"\\]|\\.)*)"/.exec(body);
    if (json) {
        try {
            return JSON.parse(`"${json[1]}"`).trim();
        } catch (err) {
            console.log(`parseUsername: не удалось разобрать personaname (${err})`);
        }
    }
    return "";
}

function decodeHtmlEntities(text: string): string {
    return text
        .replace(/&#x([0-9a-f]+);/gi, (_m, hex) => String.fromCodePoint(parseInt(hex, 16)))
        .replace(/&#(\d+);/g, (_m, dec) => String.fromCodePoint(parseInt(dec, 10)))
        .replace(/&quot;/g, '"')
        .replace(/&#39;|&apos;/g, "'")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&");
}

export function parseAvatarURL(body: string): string {
    // Актуальная разметка Steam: аватар в хедере профиля лежит в
    // <div class="playerAvatar profile_header_size ..."> ... <picture>
    //   <source srcset="https://avatars.fastly.steamstatic.com/..._full.jpg"> ...
    // В том же блоке бывает рамка аватара (profile_avatar_frame, картинка с
    // shared.*.steamstatic.com/community_assets/images/items/…), и её srcset идёт ПЕРВЫМ (SDA-32).
    // Поэтому берём первый URL внутри блока, который sanitizeAvatarUrl принимает как аватар.
    const header = divBlock(body, "playerAvatar profile_header_size");
    if (header) {
        const avatar = imageUrls(header).find((url) => sanitizeAvatarUrl(url) === url);
        if (avatar) return avatar;
    }
    // Фолбэк на старую разметку (на случай, если где-то ещё встретится)
    if (body.includes("user_avatar playerAvatar offline")) {
        const avatar = /user_avatar playerAvatar offline">\s*<img[^>]*src="([^"]+)"/.exec(body);
        return sanitizeAvatarUrl(avatar ? avatar[1] : undefined);
    }
    return DEFAULT_AVATAR_URL;
}

// <div>, в атрибутах которого стоит marker, вместе со всеми вложенными div. Незакрытый блок —
// null: иначе в «блок» попали бы аватары друзей ниже по странице.
function divBlock(body: string, marker: string): string | null {
    const at = body.indexOf(marker);
    if (at < 0) return null;
    const start = body.lastIndexOf("<div", at);
    if (start < 0) return null;
    const tags = /<(\/?)div\b[^>]*>/gi;
    tags.lastIndex = start;
    let depth = 0;
    for (let tag = tags.exec(body); tag; tag = tags.exec(body)) {
        depth += tag[1] ? -1 : 1;
        if (depth === 0) return body.slice(start, tags.lastIndex);
    }
    return null;
}

// Все URL из src и srcset по порядку; srcset может содержать несколько URL через запятую с дескрипторами.
function imageUrls(html: string): string[] {
    const urls: string[] = [];
    const attrs = /\b(srcset|src)="([^"]+)"/g;
    for (let attr = attrs.exec(html); attr; attr = attrs.exec(html)) {
        const values = attr[1] === "srcset" ? attr[2].split(",") : [attr[2]];
        for (const value of values) urls.push(value.trim().split(/\s+/)[0]);
    }
    return urls;
}

// Только свой уровень — из блока persona_level в шапке профиля. friendPlayerLevelNum есть и у
// друзей ниже по странице (на тестовом аккаунте их семь), и первым мог оказаться чужой (SDA-31).
// Своего блока нет (закрытый или не настроенный профиль) — уровень неизвестен (null).
export function parseLevel(body: string): number | null {
    const own = /class="[^"]*\bpersona_level\b[^"]*"[^>]*>(?:[^<]|<(?!\/div>))*?class="friendPlayerLevelNum"[^>]*>\s*(\d+)\s*</.exec(body);
    return own ? Number(own[1]) : null;
}

interface MarketPage {
    // null — по странице не понять (аккаунт не вошёл или страница незнакомая)
    ktLocked: boolean | null;
    tpState: boolean | string | null;
    wallet: Wallet;
}

// Разбирает /market/ целиком: КТ по тексту, ТП и кошелёк. Без входа маркет не показывает ни
// плашку, ни ограничения, поэтому статусы тогда неизвестны, а не «OK».
export function parseMarketPage(body: string): MarketPage {
    const login = /\bg_bLoggedIn\s*=\s*(true|false)\b/.exec(body);
    if (!login || login[1] !== "true") {
        const error = t(login ? "errors.balance.notLoggedIn" : "errors.balance.unrecognized");
        return { ktLocked: null, tpState: null, wallet: walletError(error) };
    }
    return { ktLocked: parseKtState(body), tpState: parseTpState(body), wallet: parseWallet(body) };
}

function walletError(error: string): Wallet {
    return { error, balance: null, currency: null };
}

// var g_rgWalletInfo = {"wallet_currency":18,…,"wallet_balance":"5099",…,"success":1,…};
// wallet_balance — в сотых долях валюты (5099 = 50,99), wallet_currency — ECurrencyCode Steam.
// Раньше баланс брали со store.steampowered.com/account/, но cookie приложения выписана только
// для steamcommunity.com: Steam отвечал редиректом на вход, и баланс не грузился ни у кого (SDA-38).
function parseWallet(body: string): Wallet {
    const block = /\bg_rgWalletInfo\s*=\s*(\{.*?\})\s*;/.exec(body);
    // Вошёл, но данных кошелька нет (вживую не проверено: у тестового аккаунта кошелёк есть) —
    // это не ошибка, а «баланса нет»: в таблице прочерк без значка.
    if (!block) return { error: null, balance: null, currency: null };
    let info: unknown;
    try {
        info = JSON.parse(block[1]);
    } catch (err) {
        return walletError(t("errors.balance.unrecognized"));
    }
    if (!info || typeof info !== "object") return walletError(t("errors.balance.unrecognized"));
    const { wallet_balance, wallet_currency } = info as Record<string, unknown>;
    const cents = typeof wallet_balance === "string" && /^\d+$/.test(wallet_balance) ? Number(wallet_balance)
        : typeof wallet_balance === "number" && Number.isInteger(wallet_balance) && wallet_balance >= 0 ? wallet_balance
            : null;
    const code = Number(wallet_currency);
    if (cents === null || !Number.isInteger(code) || code <= 0) return { error: null, balance: null, currency: null };
    return { error: null, balance: cents / 100, currency: currencyFromPage(body) || currencyFromCode(code) };
}

// <span id="marketWalletBalanceAmount">50,99₴</span> — знак валюты так, как его пишет сам Steam.
function currencyFromPage(body: string): string {
    const amount = /id="marketWalletBalanceAmount"[^>]*>([^<]*)</.exec(body);
    return amount ? currencyFromAmountText(decodeHtmlEntities(amount[1])) : "";
}

const CURRENCY_ALIASES: Record<string, string> = {
    "pуб.": "₽", // i18n-ok: так Steam пишет рубли на странице, это не текст интерфейса
    "$ USD": "$",
};

// Убирает из суммы число ("50,99", "1 234.56", "5,--") и оставляет знак валюты.
export function currencyFromAmountText(text: string): string {
    const symbol = text.replace(/\d[\d\s.,']*(?:--)?/g, " ").replace(/\s+/g, " ").trim();
    return CURRENCY_ALIASES[symbol] || symbol;
}

// ECurrencyCode Steam по номеру (33 у Steam не занят) -> ISO-код.
const CURRENCY_ISO = [
    "", "USD", "GBP", "EUR", "CHF", "RUB", "PLN", "BRL", "JPY", "NOK", "IDR", "MYR", "PHP", "SGD", "THB", "VND",
    "KRW", "TRY", "UAH", "MXN", "CAD", "AUD", "NZD", "CNY", "INR", "CLP", "PEN", "COP", "ZAR", "HKD", "TWD",
    "SAR", "AED", "", "ARS", "ILS", "BYN", "KZT", "KWD", "QAR", "CRC", "UYU",
];
const CURRENCY_SYMBOLS: Record<string, string> = {
    USD: "$", GBP: "£", EUR: "€", RUB: "₽", PLN: "zł", BRL: "R$", JPY: "¥", KRW: "₩",
    TRY: "₺", UAH: "₴", CNY: "¥", INR: "₹", KZT: "₸",
};

// Когда на странице нет суммы текстом: знак по коду валюты, для остальных валют — ISO-код.
export function currencyFromCode(code: number): string {
    const iso = CURRENCY_ISO[code] || "";
    return CURRENCY_SYMBOLS[iso] || iso;
}

function parseKtState(body: string): boolean {
    return body.includes("Your account is currently locked");
}

function parseTpState(body: string): boolean | string {
    if (body.includes("market_warning_header")) {
        if (body.includes("market_timecanuse_header")) {
            return body.split('market_timecanuse_header">')[1].split("</span>")[0];
        }
        return false;
    }
    return true;
}

// КТ: true, если об этом говорит хоть один признак — текст на /market/ или биты eligibility.
// «OK» (false) — только по eligibility: текст английский, на аккаунте с другим языком Steam его
// не будет, и его отсутствие ничего не доказывает. Иначе статус неизвестен (null).
export function combineKtState(textLocked: boolean | null, eligibilityLocked: boolean | null): boolean | null {
    if (textLocked === true || eligibilityLocked === true) return true;
    return eligibilityLocked === false ? false : null;
}

// Статус трейда берём из проверки, которую Steam делает перед Торговой площадкой:
// /market/eligibilitycheck/ ставит cookie webTradeEligibility с JSON вида
// {"allowed":1,"allowed_at_time":0,"steamguard_required_days":15,"new_device_cooldown_days":0,...}.
// Раньше статус узнавали, открывая новый трейд на захардкоженный трейд-линк чужого аккаунта
// из апстрима: все аккаунты ходили на один и тот же линк, и Steam мог связать их между собой.
//
// allowed описывает доступ к Торговой площадке, а не к трейдам. Поэтому решаем по битам
// reason (EMarketNotAllowedReasonFlags из steamclientpublic.h): трейды блокируют бан,
// ограниченный аккаунт, Steam Guard < 15 дней, сброс пароля, новое устройство и т.п.
// Остальные причины (нет покупок за год, новый способ оплаты, возврат, подарок в кошелёк)
// запрещают только маркет, а трейд-офферы работают.
const TRADE_ELIGIBILITY_URL = "https://steamcommunity.com/market/eligibilitycheck/?goto=%2F";
const TRADE_ELIGIBILITY_COOKIE_URL = "https://steamcommunity.com/market/eligibilitycheck/";

const REASON_TEMPORARY_FAILURE = 1 << 0;
const REASON_INVALID_COOKIE = 1 << 10;
const TRADE_BLOCKING_REASONS =
    (1 << 1) |  // AccountDisabled
    (1 << 2) |  // AccountLockedDown
    (1 << 3) |  // AccountLimited
    (1 << 4) |  // TradeBanned
    (1 << 6) |  // SteamGuardNotEnabled
    (1 << 7) |  // SteamGuardOnlyRecentlyEnabled
    (1 << 8) |  // RecentPasswordReset
    (1 << 11) | // UsingNewDevice
    (1 << 16);  // TradeCooldown (нет в заголовке Valve, встречается в живых ответах)
const MARKET_ONLY_REASONS =
    (1 << 5) |  // AccountNotTrusted
    (1 << 9) |  // NewPaymentMethod
    (1 << 12) | // RecentSelfRefund
    (1 << 13) | // NewPaymentMethodCannotBeVerified
    (1 << 14) | // NoRecentPurchases
    (1 << 15);  // AcceptedWalletGift
// Красная табличка (КТ) по битам — в отличие от текста на /market/, не зависит от языка аккаунта
// (SDA-31). Соответствие только по именам флагов Valve: на забаненном аккаунте не проверено.
const KT_REASONS =
    (1 << 1) |  // AccountDisabled
    (1 << 2) |  // AccountLockedDown
    (1 << 4);   // TradeBanned

export interface TradeEligibility {
    allowed: number;
    allowed_at_time?: number;
    reason?: number;
}

export interface TradeStatus {
    // true — трейды доступны, false — заблокированы, null — по ответу Steam не понять
    tradeState: boolean | null;
    // true — бан/блокировка/отключение (КТ), false — таких битов нет, null — по ответу не понять
    ktLocked: boolean | null;
}

export function parseTradeEligibility(raw: string | undefined | null): TradeEligibility | null {
    if (!raw) return null;
    try {
        const value = JSON.parse(decodeURIComponent(raw));
        return value && typeof value.allowed === "number" ? value : null;
    } catch (err) {
        return null;
    }
}

// true — трейды доступны, false — заблокированы; исключение — статус неизвестен
// (временный сбой Steam, проблема с cookie, allowed=0 без причины): tradeStatusFromEligibility
// превращает его в null, и таблица показывает «неизвестно».
export function tradeStateFromEligibility(eligibility: TradeEligibility): boolean {
    if (eligibility.allowed === 1) return true;
    const reason = eligibility.reason || 0;
    if (reason & TRADE_BLOCKING_REASONS) return false;
    // Трейды доступны, только если ВСЕ причины из списка «только маркет». Временный сбой,
    // проблема с cookie, пустая причина и биты, которых Valve ещё не было, — статус неизвестен.
    if (reason === 0 || reason & (REASON_TEMPORARY_FAILURE | REASON_INVALID_COOKIE) || reason & ~MARKET_ONLY_REASONS) {
        throw new Error(t("errors.tradeState.unknown", { reason }));
    }
    return true;
}

export function ktLockedFromEligibility(eligibility: TradeEligibility): boolean | null {
    if (eligibility.allowed === 1) return false;
    const reason = eligibility.reason || 0;
    if (reason & KT_REASONS) return true;
    // Временный сбой, проблема с cookie или пустая причина: по такому ответу бан не исключить.
    if (reason === 0 || reason & (REASON_TEMPORARY_FAILURE | REASON_INVALID_COOKIE)) return null;
    return false;
}

export function tradeStatusFromEligibility(eligibility: TradeEligibility): TradeStatus {
    let tradeState: boolean | null = null;
    try {
        tradeState = tradeStateFromEligibility(eligibility);
    } catch (err) {
        console.log(`getTradeState: ${err}`);
    }
    return { tradeState, ktLocked: ktLockedFromEligibility(eligibility) };
}

type CookieJarLike = {
    _jar?: {
        getCookiesSync(url: string): { key: string; value: string; domain: string; path: string }[];
        store?: { removeCookie(domain: string, path: string, key: string, cb: (err?: Error) => void): void };
    };
};

function eligibilityCookies(community: SteamCommunity) {
    const jar = (community as unknown as { _jar?: CookieJarLike })._jar;
    try {
        return (jar?._jar?.getCookiesSync(TRADE_ELIGIBILITY_COOKIE_URL) || []).filter((c) => c.key === "webTradeEligibility");
    } catch (err) {
        return [];
    }
}

// Отклоняется, если Steam не ответил или не поставил cookie; неоднозначный ответ — null в полях.
export async function getTradeState(community: SteamCommunity): Promise<TradeStatus> {
    // /market/ уже прогнал аккаунт через ту же проверку, и cookie может лежать в jar.
    // Убираем её, чтобы вердикт был свежим, а не прочитанным из прошлого запроса.
    const jar = (community as unknown as { _jar?: CookieJarLike })._jar;
    for (const c of eligibilityCookies(community)) jar?._jar?.store?.removeCookie(c.domain, c.path, c.key, () => undefined);

    return new Promise<TradeStatus>((resolve, reject) => {
        community.httpRequestGet({
            uri: TRADE_ELIGIBILITY_URL,
            followRedirect: false
        }, (err: SteamCommunity.CallbackError, response: Response) => {
            if (err) return reject(err);
            const fromHeader = ([] as string[])
                .concat(response.headers["set-cookie"] || [])
                .map((c) => c.match(/(?:^|;\s*)webTradeEligibility=([^;]*)/))
                .find(Boolean);
            // Только из этого ответа: cookie из jar перед запросом убрана, и подставлять
            // туда прошлый вердикт нельзя.
            const eligibility = parseTradeEligibility(fromHeader ? fromHeader[1] : null);
            if (!eligibility) {
                return reject(new Error(t("errors.tradeState.noCookie", { status: response.statusCode })));
            }
            resolve(tradeStatusFromEligibility(eligibility));
        });
    });
}
