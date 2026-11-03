import SteamCommunity from "steamcommunity";
import { getChangableSecondaries } from "../loadSteamAccountData";

function communityWithResponse(body: string, error: Error | null = null, statusCode = 200) {
    return {
        httpRequestGet: jest.fn((_options, callback) => callback(error, { statusCode, statusMessage: "Unavailable" }, body)),
    };
}

describe("Баланс Steam после удаления TM", () => {
    it.each([
        ['<a class="global_action_link" id="header_wallet_balance" href="https://store.steampowered.com/account/store_transactions/">12,50 pуб.</a>', 12.5, "₽"],
        ['<div class="accountData price">8.25$ USD</div>', 8.25, "$"],
    ])("сохраняет разбор баланса и делает только запрос Steam", async (body, balance, currency) => {
        const community = communityWithResponse(String(body));
        expect(await getChangableSecondaries(community as unknown as SteamCommunity))
            .toEqual({ steam: { balance, currency, error: null } });
        expect(community.httpRequestGet).toHaveBeenCalledTimes(1);
        expect(community.httpRequestGet).toHaveBeenCalledWith({ uri: "https://store.steampowered.com/account/" }, expect.any(Function));
    });

    it.each([
        ["", new Error("fixture network error"), 200, "fixture network error"],
        ["", null, 503, "503: Unavailable"],
        ["<html>no wallet</html>", null, 200, "Error: "],
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
