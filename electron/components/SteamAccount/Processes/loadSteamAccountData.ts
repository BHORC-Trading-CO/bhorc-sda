import SteamCommunity from "steamcommunity";
import { Response } from "request";
import SecondaryInterface from "../../../interfaces/SteamAccount/SecondaryInterface";
import ChangableSecondaryInterface from "../../../interfaces/SteamAccount/ChangableSecondaryInterface";

export async function getSecondaries(community: SteamCommunity, prev?: SecondaryInterface): Promise<SecondaryInterface> {
    // Дедуп запросов: раньше профиль /profiles/{id}/ дёргался ТРИЖДЫ (ник, уровень, аватар),
    // а /market/ — ДВАЖДЫ (kt, tp). Одинаковые запросы залпом быстро выбивали 429 rate-limit,
    // и один упавший запрос ронял весь блок (аватар/ник исчезали целиком). Теперь каждую
    // страницу тянем один раз и парсим из неё все поля.
    //
    // Профиль критичен (без него нет ника/аватара) — если он не пришёл, пробрасываем ошибку.
    // А статусы market/trade — best-effort: под 429 они не должны ронять уже полученный
    // профиль, поэтому при ошибке оставляем прежние значения (или нейтральные дефолты).
    const profileBody = await getProfilePage(community);

    let ktState = prev ? prev.ktState : false;
    let tpState = prev ? prev.tpState : true;
    try {
        const marketBody = await getMarketPage(community);
        ktState = parseKtState(marketBody);
        tpState = parseTpState(marketBody);
    } catch (err) {
        console.log(`getSecondaries: market-статус не обновлён (${err}), оставляю прежний`);
    }

    let tradeState = prev ? prev.tradeState : false;
    try {
        tradeState = await getTradeState(community);
    } catch (err) {
        console.log(`getSecondaries: trade-статус не обновлён (${err}), оставляю прежний`);
    }

    return {
        nickname: parseUsername(profileBody),
        level: parseLevel(profileBody),
        avatarUrl: parseAvatarURL(profileBody),
        ktState,
        tpState,
        tradeState
    };
}

// Тянет HTML профиля один раз; используется для ника/уровня/аватара.
function getProfilePage(community: SteamCommunity): Promise<string> {
    return httpGetBody(community, `https://steamcommunity.com/profiles/${community.steamID}/`);
}

// Тянет HTML раздела маркета один раз; используется для kt/tp статусов.
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

const DEFAULT_AVATAR_URL = "https://avatars.akamai.steamstatic.com/fef49e7fa7e1997310d705b2a6158ff8dc1cdfeb.jpg";

function parseAvatarURL(body: string): string {
    // Актуальная разметка Steam: аватар в хедере профиля лежит в
    // <div class="playerAvatar profile_header_size ..."> ... <picture>
    //   <source srcset="https://avatars.fastly.steamstatic.com/..._full.jpg"> ...
    // Берём первый srcset после маркера хедера.
    const headerIdx = body.indexOf("playerAvatar profile_header_size");
    if (headerIdx >= 0) {
        const srcset = /srcset="([^"]+)"/.exec(body.slice(headerIdx));
        if (srcset) {
            // srcset может содержать несколько URL через запятую с дескрипторами — берём первый URL
            return srcset[1].split(",")[0].trim().split(/\s+/)[0];
        }
    }
    // Фолбэк на старую разметку (на случай, если где-то ещё встретится)
    if (body.includes("user_avatar playerAvatar offline")) {
        return body.split('user_avatar playerAvatar offline">')[1].split('"')[1].split(">")[0];
    }
    return DEFAULT_AVATAR_URL;
}

export async function getChangableSecondaries(community: SteamCommunity): Promise<ChangableSecondaryInterface> {
    const promises = [getSteamBalance(community)]
    const result = await Promise.allSettled(promises);
    const changableSecondary: ChangableSecondaryInterface = {
        steam: {
            error: result[0].status === 'rejected' ? result[0].reason : null,
            balance: result[0].status === 'fulfilled' ? result[0].value.balance : null,
            currency: result[0].status === 'fulfilled' ? result[0].value.currency : null
        }
    }
    return changableSecondary;
}

function parseLevel(body: string): number {
    if (body.includes('class="friendPlayerLevelNum"')) {
        return Number(body.split('class="friendPlayerLevelNum">')[1].split("</span>")[0]);
    }
    return 0;
}

async function getSteamBalance(community: SteamCommunity): Promise<{ balance: number, currency: string }> {
    return new Promise<{ balance: number, currency: string }>((resolve, reject) => {
        community.httpRequestGet({
            uri: "https://store.steampowered.com/account/"
        }, (err: SteamCommunity.CallbackError, response: Response, body: Response["body"]) => {
            if (err) return reject(err);
            if (response.statusCode == 200) {
                try {
                    if (body.includes('id="header_wallet_balance"'))
                        var balanceInfo: string = body.split('<a class="global_action_link" id="header_wallet_balance" href="https://store.steampowered.com/account/store_transactions/">')[1].split("</a>")[0];
                    else
                        if (body.includes('<div class="accountData price">'))
                            var balanceInfo: string = body.split('<div class="accountData price">')[1].split("</div>")[0];
                        else
                            return reject(Error("Не удалось получить баланс"));
                    const balance: number = formatBalance(balanceInfo);
                    const currency: string = formatCurrency(balanceInfo);
                    resolve({ balance: balance, currency: currency });
                } catch (err) {
                    reject(err);
                }
            } else {
                reject(new Error(`${response.statusCode}: ${response.statusMessage}`));
            }
        });
    });
}

function formatCurrency(balanceInfo: string): string {
    var rawCurrency = balanceInfo.replace(/\d+,+\d+|\d+\.+\d+|\d+/, "");
    switch (rawCurrency) {
        case " pуб.":
            return "₽";
        case "$ USD":
            return "$";
        default:
            return rawCurrency;
    }
}

function formatBalance(balanceInfo: string): number {
    var rawBalance = /\d+,+\d+|\d+\.+\d+|\d+/.exec(balanceInfo);
    if (rawBalance)
        return parseFloat(rawBalance[0].replace(",", "."));
    throw new Error("Не получилось отформатировать");
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

export interface TradeEligibility {
    allowed: number;
    allowed_at_time?: number;
    reason?: number;
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
// (временный сбой Steam, проблема с cookie, allowed=0 без причины): getSecondaries
// тогда оставит прежнее значение.
export function tradeStateFromEligibility(eligibility: TradeEligibility): boolean {
    if (eligibility.allowed === 1) return true;
    const reason = eligibility.reason || 0;
    if (reason & TRADE_BLOCKING_REASONS) return false;
    // Трейды доступны, только если ВСЕ причины из списка «только маркет». Временный сбой,
    // проблема с cookie, пустая причина и биты, которых Valve ещё не было, — статус неизвестен.
    if (reason === 0 || reason & (REASON_TEMPORARY_FAILURE | REASON_INVALID_COOKIE) || reason & ~MARKET_ONLY_REASONS) {
        throw new Error(`eligibilitycheck: allowed=0, reason=${reason}, статус неизвестен`);
    }
    return true;
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

export async function getTradeState(community: SteamCommunity): Promise<boolean> {
    // /market/ уже прогнал аккаунт через ту же проверку, и cookie может лежать в jar.
    // Убираем её, чтобы вердикт был свежим, а не прочитанным из прошлого запроса.
    const jar = (community as unknown as { _jar?: CookieJarLike })._jar;
    for (const c of eligibilityCookies(community)) jar?._jar?.store?.removeCookie(c.domain, c.path, c.key, () => undefined);

    return new Promise<boolean>((resolve, reject) => {
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
                return reject(new Error(`eligibilitycheck ${response.statusCode}: нет cookie webTradeEligibility`));
            }
            try {
                resolve(tradeStateFromEligibility(eligibility));
            } catch (e) {
                reject(e);
            }
        });
    });
}