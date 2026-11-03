import fs from "fs";
import path from "path";
import nock from "nock";
import request from "request";
import SteamCommunity from "steamcommunity";
import { getTradeState, parseTradeEligibility, tradeStateFromEligibility } from "../loadSteamAccountData";
import { setMainLanguage } from "../../../../i18n";

// Сообщения проверяем на русском: ru — прежний текст без изменений (SDA-18).
beforeAll(() => setMainLanguage("ru"));

// Настоящий steamcommunity + request с jar, Steam подменён nock: так проверяются
// followRedirect, Set-Cookie, jar и редирект на /login, а не только наш разбор.
const enc = (o: object) => encodeURIComponent(JSON.stringify(o));
// Так Steam реально отдаёт cookie (проверено на живом аккаунте 27.10.2026).
const LIVE_ALLOWED = { allowed: 1, allowed_at_time: 0, steamguard_required_days: 15, new_device_cooldown_days: 0, time_checked: 1793131843 };

function community() {
    const c = new SteamCommunity({ request: request.defaults({}) });
    c.setCookies(["steamLoginSecure=76561198000000000%7C%7Cfake"]);
    return c;
}

function steamReplies(value: object | null, opts: { location?: string; onlyWithoutCookie?: boolean } = {}) {
    return nock("https://steamcommunity.com")
        .get("/market/eligibilitycheck/")
        .query({ goto: "/" })
        .reply(function () {
            const headers: Record<string, string | string[]> = { Location: opts.location || "https://steamcommunity.com/" };
            const hasCookie = /webTradeEligibility/.test(String(this.req.headers.cookie || ""));
            if (value && !(opts.onlyWithoutCookie && hasCookie)) {
                headers["Set-Cookie"] = [`webTradeEligibility=${enc(value)}; path=/market; secure`];
            }
            return [302, "", headers];
        });
}

beforeAll(() => nock.disableNetConnect());
afterEach(() => nock.cleanAll());
afterAll(() => nock.enableNetConnect());

describe("trade-статус через eligibilitycheck", () => {
    it("разбирает cookie", () => {
        expect(parseTradeEligibility(enc(LIVE_ALLOWED))).toMatchObject({ allowed: 1 });
        expect(parseTradeEligibility("not-json")).toBeNull();
        expect(parseTradeEligibility(undefined)).toBeNull();
    });

    it.each([
        ["разрешено", { allowed: 1 }, true],
        ["трейд-бан", { allowed: 0, reason: 1 << 4 }, false],
        ["новое устройство", { allowed: 0, reason: 1 << 11, allowed_at_time: 1793736643 }, false],
        ["Steam Guard < 15 дней", { allowed: 0, reason: 1 << 7 }, false],
        ["ограниченный аккаунт", { allowed: 0, reason: 1 << 3 }, false],
        ["только маркет: нет покупок за год", { allowed: 0, reason: (1 << 14) | (1 << 5) }, true],
        ["только маркет: новый способ оплаты", { allowed: 0, reason: 1 << 9 }, true],
    ])("%s", (_name, eligibility, expected) => {
        expect(tradeStateFromEligibility(eligibility)).toBe(expected);
    });

    it.each([
        ["без причины", { allowed: 0 }],
        ["временный сбой", { allowed: 0, reason: 1 }],
        ["проблема с cookie", { allowed: 0, reason: 1 << 10 }],
        ["неизвестный новый бит", { allowed: 0, reason: 1 << 17 }],
        ["только маркет + неизвестный бит", { allowed: 0, reason: (1 << 14) | (1 << 20) }],
    ])("статус неизвестен (%s) — исключение, чтобы оставить прежний", (_name, eligibility) => {
        expect(() => tradeStateFromEligibility(eligibility)).toThrow("статус неизвестен");
    });

    it("ходит на свою проверку Steam без редиректа и читает живой ответ", async () => {
        const scope = steamReplies(LIVE_ALLOWED);
        await expect(getTradeState(community())).resolves.toBe(true);
        expect(scope.isDone()).toBe(true);
    });

    it("берёт свежий вердикт, даже если старая cookie уже лежит в jar", async () => {
        const c = community();
        steamReplies({ allowed: 1 });
        await expect(getTradeState(c)).resolves.toBe(true);
        // Худший случай: Steam ставит cookie, только если запрос пришёл без неё.
        steamReplies({ allowed: 0, reason: 1 << 4 }, { onlyWithoutCookie: true });
        await expect(getTradeState(c)).resolves.toBe(false);
    });

    it("сессия истекла (редирект на /login) — отклоняет", async () => {
        steamReplies(null, { location: "https://steamcommunity.com/login/home/?goto=market" });
        await expect(getTradeState(community())).rejects.toThrow("Not Logged In");
    });

    it("нет cookie в ответе — отклоняет", async () => {
        steamReplies(null);
        await expect(getTradeState(community())).rejects.toThrow("webTradeEligibility");
    });

    it("в коде приложения нет захардкоженного трейд-линка", () => {
        const root = path.join(__dirname, "../../../../..");
        const offenders: string[] = [];
        const walk = (d: string) => {
            for (const e of fs.readdirSync(d, { withFileTypes: true })) {
                const full = path.join(d, e.name);
                if (e.isDirectory()) { if (e.name !== "__tests__") walk(full); }
                else if (/\.tsx?$/.test(e.name) && /tradeoffer\/new\/\?partner=/.test(fs.readFileSync(full, "utf8"))) offenders.push(full);
            }
        };
        ["electron", "src"].forEach((dir) => walk(path.join(root, dir)));
        expect(offenders).toEqual([]);
    });
});
