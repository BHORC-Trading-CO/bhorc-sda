import fs from "fs";
import path from "path";
import SteamCommunity from "steamcommunity";
import { getTradeState, parseTradeEligibility } from "../loadSteamAccountData";

// ALLOWED — так Steam реально отдаёт cookie (проверено на живом аккаунте 27.10.2026).
// BLOCKED — синтетический пример запрета: allowed=0 и время, когда трейд откроется.
const ALLOWED = "webTradeEligibility=%7B%22allowed%22%3A1%2C%22allowed_at_time%22%3A0%2C%22steamguard_required_days%22%3A15%2C%22new_device_cooldown_days%22%3A0%2C%22time_checked%22%3A1793131843%7D; expires=Wed, 27-Oct-2027 20:00:00 GMT; path=/market; secure";
const BLOCKED = "webTradeEligibility=%7B%22allowed%22%3A0%2C%22reason%22%3A16384%2C%22allowed_at_time%22%3A1793736643%2C%22steamguard_required_days%22%3A15%2C%22new_device_cooldown_days%22%3A7%7D; path=/market";

function communityWith(setCookie: string[] | undefined, error: Error | null = null, statusCode = 302) {
    return {
        httpRequestGet: jest.fn((_options, callback) =>
            callback(error, { statusCode, headers: setCookie ? { "set-cookie": setCookie } : {} }, "")
        ),
    };
}

describe("trade-статус через eligibilitycheck", () => {
    it("разбирает cookie webTradeEligibility", () => {
        expect(parseTradeEligibility([ "browserid=1; path=/", ALLOWED ])).toMatchObject({ allowed: 1, allowed_at_time: 0 });
        expect(parseTradeEligibility(BLOCKED)).toMatchObject({ allowed: 0, reason: 16384, allowed_at_time: 1793736643 });
        expect(parseTradeEligibility(undefined)).toBeNull();
        expect(parseTradeEligibility(["webTradeEligibility=not-json"])).toBeNull();
    });

    it("трейд разрешён / запрещён по полю allowed", async () => {
        expect(await getTradeState(communityWith([ALLOWED]) as unknown as SteamCommunity)).toBe(true);
        expect(await getTradeState(communityWith([BLOCKED]) as unknown as SteamCommunity)).toBe(false);
    });

    it("ходит только на свою проверку Steam, без чужого трейд-линка", async () => {
        const community = communityWith([ALLOWED]);
        await getTradeState(community as unknown as SteamCommunity);
        const options = community.httpRequestGet.mock.calls[0][0];
        expect(options.uri).toBe("https://steamcommunity.com/market/eligibilitycheck/?goto=%2F");
        expect(options.followRedirect).toBe(false);
        expect(options.uri).not.toMatch(/partner=|tradeoffer\/new/);
    });

    it("без cookie или при ошибке отклоняет промис, чтобы getSecondaries оставил прежний статус", async () => {
        await expect(getTradeState(communityWith(undefined) as unknown as SteamCommunity)).rejects.toThrow("webTradeEligibility");
        await expect(getTradeState(communityWith(undefined, new Error("Not Logged In")) as unknown as SteamCommunity)).rejects.toThrow("Not Logged In");
    });

    it("в коде приложения нет захардкоженного трейд-линка", () => {
        const root = path.join(__dirname, "../../../../..");
        const offenders: string[] = [];
        for (const dir of ["electron", "src"]) {
            const walk = (d: string) => {
                for (const e of fs.readdirSync(d, { withFileTypes: true })) {
                    const full = path.join(d, e.name);
                    if (e.isDirectory()) { if (e.name !== "__tests__") walk(full); }
                    else if (/\.tsx?$/.test(e.name) && /tradeoffer\/new\/\?partner=/.test(fs.readFileSync(full, "utf8"))) offenders.push(full);
                }
            };
            walk(path.join(root, dir));
        }
        expect(offenders).toEqual([]);
    });
});
