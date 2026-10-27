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
        ["", new Error("fixture network error"), 200],
        ["", null, 503],
        ["<html>no wallet</html>", null, 200],
    ])("сохраняет ошибку Steam в результате", async (body, error, statusCode) => {
        const community = communityWithResponse(body, error, statusCode);
        const result = await getChangableSecondaries(community as unknown as SteamCommunity);
        expect(result).toEqual({ steam: { balance: null, currency: null, error: expect.any(Error) } });
        expect(community.httpRequestGet).toHaveBeenCalledTimes(1);
    });
});
