import SteamCommunity from "steamcommunity";
import { getChangableSecondaries, parseMarketPage, currencyFromAmountText, currencyFromCode } from "../loadSteamAccountData";
import { setMainLanguage } from "../../../../i18n";

beforeAll(() => setMainLanguage("en"));

function communityWithResponse(body: string, error: Error | null = null, statusCode = 200) {
    return {
        httpRequestGet: jest.fn((_options, callback) => callback(error, { statusCode, statusMessage: "Unavailable" }, body)),
    };
}

// Синтетическая страница /market/ по образцу живой (SDA-38); все значения придуманы.
const walletInfo = (fields: Record<string, unknown> = {}) => JSON.stringify({
    wallet_currency: 18, wallet_country: "UA", wallet_state: "", wallet_fee: "1", wallet_fee_minimum: "100",
    wallet_fee_percent: "0.05", wallet_publisher_fee_percent_default: "0.10", wallet_market_minimum: "100",
    wallet_currency_increment: "100", wallet_fee_base: "0", wallet_balance: "5099", wallet_delayed_balance: "0",
    wallet_max_balance: "8500000", wallet_trade_max_balance: "7650000", success: 1, rwgrsn: -2, ...fields,
});
function marketPage({ loggedIn = "true", wallet = walletInfo(), amount = "50,99₴", extra = "" }:
    { loggedIn?: string | null, wallet?: string | null, amount?: string | null, extra?: string } = {}) {
    return `<html><head><script type="text/javascript">${loggedIn === null ? "" : ` var g_bLoggedIn = ${loggedIn};`}` +
        `${wallet === null ? "" : ` var g_rgWalletInfo = ${wallet};`} </script></head><body>` +
        (amount === null ? "" : `<a id="marketWalletBalance" href="https://store.steampowered.com/account/">Wallet balance <span id="marketWalletBalanceAmount">${amount}</span></a>`) +
        `${extra}</body></html>`;
}

describe("Баланс Steam со страницы /market/ (SDA-38)", () => {
    it.each([
        ["гривны, запятая", walletInfo(), "50,99₴", 50.99, "₴"],
        ["доллары, точка, знак впереди", walletInfo({ wallet_currency: 1, wallet_balance: "1234" }), "$12.34", 12.34, "$"],
        ["евро без копеек", walletInfo({ wallet_currency: 3, wallet_balance: "500" }), "5,--€", 5, "€"],
        ["рубли с разделителем тысяч", walletInfo({ wallet_currency: 5, wallet_balance: "123450" }), "1 234,50 pуб.", 1234.5, "₽"],
        ["нулевой баланс", walletInfo({ wallet_balance: "0" }), "0,00₴", 0, "₴"],
        ["баланс числом", walletInfo({ wallet_balance: 250 }), "2,50₴", 2.5, "₴"],
    ])("%s", (_name, wallet, amount, balance, currency) => {
        expect(parseMarketPage(marketPage({ wallet, amount })).wallet).toEqual({ error: null, balance, currency });
    });

    it.each([
        [18, "₴"], [1, "$"], [2, "£"], [3, "€"], [5, "₽"], [37, "₸"], [20, "CAD"], [4, "CHF"], [33, ""], [999, ""],
    ])("валюта по ECurrencyCode %s, если на странице нет суммы текстом", (code, currency) => {
        expect(currencyFromCode(code)).toBe(currency);
        const wallet = walletInfo({ wallet_currency: code });
        expect(parseMarketPage(marketPage({ wallet, amount: null })).wallet).toEqual({ error: null, balance: 50.99, currency });
    });

    it.each([
        ["50,99₴", "₴"], ["$12.34", "$"], ["$50.99 USD", "$"], ["CDN$ 12.34", "CDN$"], ["5,--€", "€"],
        ["12,34 pуб.", "₽"], ["R$ 1.234,56", "R$"], ["¥ 1,234", "¥"], ["", ""],
    ])("знак валюты из текста %s", (text, currency) => {
        expect(currencyFromAmountText(text)).toBe(currency);
    });

    it("текст суммы с HTML-сущностями", () => {
        expect(parseMarketPage(marketPage({ amount: "50,99&#8372;" })).wallet.currency).toBe("₴");
    });

    it.each([
        ["нет блока кошелька", marketPage({ wallet: null, amount: null })],
        ["кошелёк без валюты", marketPage({ wallet: walletInfo({ wallet_currency: 0 }), amount: null })],
        ["кошелёк без баланса", marketPage({ wallet: walletInfo({ wallet_balance: undefined }), amount: null })],
    ])("вошёл, но данных кошелька нет (%s) — без баланса и без ошибки", (_name, body) => {
        expect(parseMarketPage(body).wallet).toEqual({ error: null, balance: null, currency: null });
    });

    it("не вошёл — ошибка для подсказки, статусы КТ и ТП неизвестны", () => {
        const page = parseMarketPage(marketPage({ loggedIn: "false", wallet: null, amount: null }));
        expect(page.wallet).toEqual({ error: expect.stringContaining("not see this session as logged in"), balance: null, currency: null });
        expect(page.ktLocked).toBeNull();
        expect(page.tpState).toBeNull();
    });

    it.each([
        ["незнакомая страница", marketPage({ loggedIn: null })],
        ["битый JSON кошелька", marketPage({ wallet: '{"wallet_balance":"5099",}' })],
    ])("%s — ошибка, а не пустой баланс", (_name, body) => {
        expect(parseMarketPage(body).wallet).toEqual({ error: expect.stringContaining("unexpected format"), balance: null, currency: null });
    });

    it("КТ и ТП с той же страницы", () => {
        expect(parseMarketPage(marketPage())).toMatchObject({ ktLocked: false, tpState: true });
        const locked = marketPage({ extra: '<div class="market_warning_header">Your account is currently locked</div>' });
        expect(parseMarketPage(locked)).toMatchObject({ ktLocked: true, tpState: false });
        const later = marketPage({ extra: '<div class="market_warning_header"><span class="market_timecanuse_header">Dec 1, 2026</span></div>' });
        expect(parseMarketPage(later)).toMatchObject({ ktLocked: false, tpState: "Dec 1, 2026" });
    });

    it("getChangableSecondaries делает один запрос — /market/, а не магазин", async () => {
        const community = communityWithResponse(marketPage());
        expect(await getChangableSecondaries(community as unknown as SteamCommunity))
            .toEqual({ steam: { balance: 50.99, currency: "₴", error: null } });
        expect(community.httpRequestGet).toHaveBeenCalledTimes(1);
        expect(community.httpRequestGet).toHaveBeenCalledWith({ uri: "https://steamcommunity.com/market/" }, expect.any(Function));
    });

    it.each([
        ["", new Error("fixture network error"), 200, "fixture network error"],
        ["", null, 503, "503: Unavailable"],
        [marketPage({ loggedIn: "false", wallet: null }), null, 200, "logged in"],
    ])("сохраняет ошибку Steam в результате строкой", async (body, error, statusCode, text) => {
        const community = communityWithResponse(body, error, statusCode);
        const result = await getChangableSecondaries(community as unknown as SteamCommunity);
        expect(result).toEqual({ steam: { balance: null, currency: null, error: expect.any(String) } });
        expect(result.steam.error).toContain(text);
        expect(community.httpRequestGet).toHaveBeenCalledTimes(1);
    });

    // changableSecondary уходит в рендерер внутри списка аккаунтов (STEAM_ACCOUNT_GET).
    // V8 в Electron 17 (9.8) неверно читает обратные ссылки IPC-сообщения на объекты, впервые
    // записанные после объекта Error: ссылка указывает на соседний объект (на каждый Error — на
    // один дальше). Так proxy второго аккаунта на том же прокси приходил группой первого
    // ("(#1) :"), а smaFile.maFile — чужим объектом. Поэтому живых Error здесь быть не должно.
    it("не кладёт в результат объект Error", async () => {
        const community = communityWithResponse("", new Error("read ECONNRESET"), 200);
        const result = await getChangableSecondaries(community as unknown as SteamCommunity);
        const errors: string[] = [];
        (function walk(value: unknown, path: string) {
            if (value instanceof Error) errors.push(path);
            if (value && typeof value === "object") for (const [k, v] of Object.entries(value)) walk(v, `${path}.${k}`);
        })(result, "$");
        expect(errors).toEqual([]);
        expect(result.steam.error).toBe("Error: read ECONNRESET");
    });
});
