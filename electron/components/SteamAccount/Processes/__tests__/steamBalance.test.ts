import SteamCommunity from "steamcommunity";
import { getChangableSecondaries, parseMarketPage, currencyFromAmountText, currencyFromCode, amountTextMinorUnits } from "../loadSteamAccountData";
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
type PageOptions = { loggedIn?: string | null, wallet?: string | null, wallets?: string[], amount?: string | null, market?: boolean, extra?: string };
function marketPage({ loggedIn = "true", wallet = walletInfo(), wallets, amount = "50,99₴", market = true, extra = "" }: PageOptions = {}) {
    const assignments = (wallets || (wallet === null ? [] : [wallet])).map((w) => ` var g_rgWalletInfo = ${w};`).join("");
    return `<html><head><script type="text/javascript">${loggedIn === null ? "" : ` var g_bLoggedIn = ${loggedIn};`}` +
        `${assignments} </script></head><body>` +
        (amount === null ? "" : `<a id="marketWalletBalance" href="https://store.steampowered.com/account/">Wallet balance <span id="marketWalletBalanceAmount">${amount}</span></a>`) +
        (market ? '<div class="market_fixture_block"></div>' : "") +
        `${extra}</body></html>`;
}
const wallet = (body: string) => parseMarketPage(body).wallet;
const UNRECOGNIZED = { error: expect.stringContaining("unexpected format"), balance: null, currency: null };

describe("Баланс Steam со страницы /market/ (SDA-38)", () => {
    it.each([
        ["гривны, запятая", walletInfo(), "50,99₴", 50.99, "₴"],
        ["доллары, точка, знак впереди", walletInfo({ wallet_currency: 1, wallet_balance: "1234" }), "$12.34", 12.34, "$"],
        ["евро без копеек", walletInfo({ wallet_currency: 3, wallet_balance: "500" }), "5,--€", 5, "€"],
        ["евро именованной сущностью", walletInfo({ wallet_currency: 3, wallet_balance: "5099" }), "50,99&euro;", 50.99, "€"],
        ["рубли с разделителем тысяч", walletInfo({ wallet_currency: 5, wallet_balance: "123450" }), "1 234,50 pуб.", 1234.5, "₽"],
        ["нулевой баланс", walletInfo({ wallet_balance: "0" }), "0,00₴", 0, "₴"],
        ["баланс числом", walletInfo({ wallet_balance: 250 }), "2,50₴", 2.5, "₴"],
        ["success: true", walletInfo({ success: true }), "50,99₴", 50.99, "₴"],
    ])("%s", (_name, info, amount, balance, currency) => {
        expect(wallet(marketPage({ wallet: info, amount }))).toEqual({ error: null, balance, currency });
    });

    it("кошелёк на несколько строк", () => {
        const multiline = JSON.stringify(JSON.parse(walletInfo()), null, 2);
        expect(multiline).toContain("\n");
        expect(wallet(marketPage({ wallet: multiline }))).toEqual({ error: null, balance: 50.99, currency: "₴" });
    });

    it.each([
        [18, "₴"], [1, "$"], [2, "£"], [3, "€"], [5, "₽"], [37, "₸"], [20, "CAD"], [4, "CHF"], [33, "#33"], [999, "#999"],
    ])("валюта по ECurrencyCode %s, если на странице нет суммы текстом; неизвестный код — сам код, а не пусто", (code, currency) => {
        expect(currencyFromCode(code)).toBe(currency);
        expect(wallet(marketPage({ wallet: walletInfo({ wallet_currency: code }), amount: null }))).toEqual({ error: null, balance: 50.99, currency });
    });

    it("знак со страницы — только если её сумма совпадает с wallet_balance, иначе по коду валюты", () => {
        expect(wallet(marketPage({ wallet: walletInfo({ wallet_balance: "100" }), amount: "50,99$" }))).toEqual({ error: null, balance: 1, currency: "₴" });
        expect(wallet(marketPage({ wallet: walletInfo({ wallet_currency: 999 }), amount: "50,99 XYZ" }))).toEqual({ error: null, balance: 50.99, currency: "XYZ" });
        expect(wallet(marketPage({ wallet: walletInfo({ wallet_currency: 999 }), amount: "1,00 XYZ" }))).toEqual({ error: null, balance: 50.99, currency: "#999" });
    });

    it.each([
        ["50,99₴", 5099], ["$12.34", 1234], ["$1,234.56", 123456], ["1.234,56 R$", 123456], ["1 234,50 pуб.", 123450],
        ["5,--€", 500], ["¥ 1,234", 123400], ["12,5", 1250], ["0,00₴", 0], ["₴", null], ["", null],
    ])("сумма из текста %s", (text, cents) => {
        expect(amountTextMinorUnits(text)).toBe(cents);
    });

    it.each([
        ["50,99₴", "₴"], ["$12.34", "$"], ["$50.99 USD", "$"], ["CDN$ 12.34", "CDN$"], ["5,--€", "€"],
        ["12,34 pуб.", "₽"], ["R$ 1.234,56", "R$"], ["¥ 1,234", "¥"], ["", ""],
    ])("знак валюты из текста %s", (text, currency) => {
        expect(currencyFromAmountText(text)).toBe(currency);
    });

    it("текст суммы с числовой HTML-сущностью", () => {
        expect(wallet(marketPage({ amount: "50,99&#8372;" })).currency).toBe("₴");
    });

    // Ревью r1: каждое сомнение — ошибка в подсказке, а не уверенное число
    it.each([
        ["success: 0", marketPage({ wallet: walletInfo({ success: 0 }) }), "unavailable"],
        ["без success", marketPage({ wallet: walletInfo({ success: undefined }) }), "unavailable"],
        ["два кошелька не совпадают", marketPage({ wallets: [walletInfo({ wallet_currency: 1, wallet_balance: "100" }), walletInfo()] }), "unexpected format"],
        ["отрицательный баланс строкой", marketPage({ wallet: walletInfo({ wallet_balance: "-100" }) }), "unexpected format"],
        ["отрицательный баланс числом", marketPage({ wallet: walletInfo({ wallet_balance: -100 }) }), "unexpected format"],
        ["дробный баланс", marketPage({ wallet: walletInfo({ wallet_balance: 1.5 }) }), "unexpected format"],
        ["баланс в экспоненте", marketPage({ wallet: walletInfo({ wallet_balance: "1e3" }) }), "unexpected format"],
        ["баланс из 400 цифр", marketPage({ wallet: walletInfo({ wallet_balance: "9".repeat(400) }) }), "unexpected format"],
        ["валюта строкой", marketPage({ wallet: walletInfo({ wallet_currency: "18" }) }), "unexpected format"],
        ["валюта отрицательная", marketPage({ wallet: walletInfo({ wallet_currency: -18 }) }), "unexpected format"],
        ["баланс без валюты", marketPage({ wallet: walletInfo({ wallet_currency: 0 }), amount: null }), "unexpected format"],
        ["валюта без баланса", marketPage({ wallet: walletInfo({ wallet_balance: undefined }), amount: null }), "unexpected format"],
        ["битый JSON кошелька", marketPage({ wallet: '{"wallet_balance":"5099",}' }), "unexpected format"],
        ["кошелёк не объект", marketPage({ wallet: "[1]" }), "unexpected format"],
        ["нет блока кошелька на странице маркета", marketPage({ wallet: null }), "no wallet data"],
    ])("%s — ошибка", (_name, body, text) => {
        expect(wallet(body)).toEqual({ error: expect.stringContaining(text), balance: null, currency: null });
    });

    it("два одинаковых объявления кошелька — не противоречие", () => {
        expect(wallet(marketPage({ wallets: [walletInfo(), walletInfo()] }))).toEqual({ error: null, balance: 50.99, currency: "₴" });
    });

    it.each([
        ["валюта 0 и баланс 0", walletInfo({ wallet_currency: 0, wallet_balance: "0" })],
        ["нет ни валюты, ни баланса", walletInfo({ wallet_currency: undefined, wallet_balance: undefined })],
    ])("Steam явно говорит, что кошелька нет (%s) — без баланса и без ошибки", (_name, info) => {
        expect(wallet(marketPage({ wallet: info, amount: null }))).toEqual({ error: null, balance: null, currency: null });
    });

    it("не вошёл — ошибка для подсказки, статусы КТ и ТП неизвестны", () => {
        const page = parseMarketPage(marketPage({ loggedIn: "false", wallet: null, amount: null }));
        expect(page.wallet).toEqual({ error: expect.stringContaining("not see this session as logged in"), balance: null, currency: null });
        expect(page.ktLocked).toBeNull();
        expect(page.tpState).toBeNull();
    });

    // Ревью r1: вход и HTTP 200 — ещё не Торговая площадка (страница ошибки или техработ)
    it.each([
        ["вошёл, но вместо маркета «Temporarily unavailable»", '<script> var g_bLoggedIn = true; </script><h2>Temporarily unavailable</h2>'],
        ["кошелёк есть, а классов market_* нет", marketPage({ market: false })],
        ["классы market_* есть, а признаков кошелька нет", marketPage({ wallet: null, amount: null })],
        ["нет g_bLoggedIn", marketPage({ loggedIn: null })],
    ])("%s — ошибка «не та страница», ТП и КТ по тексту неизвестны", (_name, body) => {
        const page = parseMarketPage(body);
        expect(page.wallet).toEqual({ error: expect.stringContaining("not the Community Market"), balance: null, currency: null });
        expect(page.tpState).toBeNull();
        expect(page.ktLocked).toBeNull();
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
