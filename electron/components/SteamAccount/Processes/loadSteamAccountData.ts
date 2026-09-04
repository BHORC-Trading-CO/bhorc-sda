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

function parseUsername(body: string): string {
    if (body.includes("data-miniprofile")) {
        return body.split("data-miniprofile")[1].split(">")[1].split("<")[0];
    }
    return "";
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

export async function getChangableSecondaries(community: SteamCommunity, marketApiKey: string): Promise<ChangableSecondaryInterface> {
    const promises = [getSteamBalance(community), getMarketBalance(marketApiKey, community)]
    const result = await Promise.allSettled(promises);
    const changableSecondary: ChangableSecondaryInterface = {
        market: {
            error: result[1].status === 'rejected' ? result[1].reason : null,
            balance: result[1].status === 'fulfilled' ? result[1].value.balance : null,
            currency: result[1].status === 'fulfilled' ? result[1].value.currency : null
        },
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

async function getMarketBalance(marketApiKey: string, community: SteamCommunity): Promise<{ balance: number, currency: string }> {
    return new Promise<{ balance: number, currency: string }>((resolve, reject) => {
        if (!marketApiKey) {
            return reject('Апи ключ маркета не установлен');
        }
        community.httpRequestGet({
            uri: `https://market.csgo.com/api/v2/get-money?key=${marketApiKey}`
        }, (err: SteamCommunity.CallbackError, response: Response, body: Response["body"]) => {
            if (err) return reject(err);
            if (response.statusCode == 200) {
                const balance = JSON.parse(body);
                resolve({ balance: balance.money, currency: balance.currency });
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

async function getTradeState(community: SteamCommunity): Promise<boolean> {
    return new Promise<boolean>((resolve, reject) => {
        community.httpRequestGet({
            uri: "https://steamcommunity.com/tradeoffer/new/?partner=1019092302&token=1hP4HPB2"
        }, (err: SteamCommunity.CallbackError, response: Response, _body: Response["body"]) => {
            if (err) {
                if (err.message.includes("You cannot trade") || err.message.includes("Steam Guard"))
                    resolve(false);
                return reject(err);
            }
            if (response.statusCode == 200) {
                resolve(true);
            } else {
                reject(new Error(`${response.statusCode}: ${response.statusMessage}`));
            }
        });
    });
}