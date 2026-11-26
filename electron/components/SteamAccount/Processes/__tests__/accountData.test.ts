import nock from "nock";
import request from "request";
import SteamCommunity from "steamcommunity";
import { getAccountData, parseMemberSince, parseMiniprofile, PROFILE_XML_RETRY } from "../loadSteamAccountData";
import { DEFAULT_AVATAR_URL } from "../../../Functions/sanitizeAvatarUrl";
import { setMainLanguage } from "../../../../i18n";

// One account refresh (SDA-38/31/32) against the real steamcommunity client; Steam is replaced
// by nock. All names, ids and avatar hashes below are invented.
const STEAM_ID = "76561198000000000";
const ACCOUNT_ID = 39734272; // STEAM_ID - 76561197960265728
const MINIPROFILE = `https://steamcommunity.com/miniprofile/${ACCOUNT_ID}/json`;
const MARKET = "https://steamcommunity.com/market/";
const ELIGIBILITY = "https://steamcommunity.com/market/eligibilitycheck/?goto=%2F";
const PROFILE = `https://steamcommunity.com/profiles/${STEAM_ID}/`;
const PROFILE_XML = `https://steamcommunity.com/profiles/${STEAM_ID}/?xml=1`;

const OWN_AVATAR = "https://avatars.akamai.steamstatic.com/a1b2c3d4e5f60718293a4b5c6d7e8f9012345678_full.jpg";
const FRAME = "https://shared.akamai.steamstatic.com/community_assets/images/items/000000/0000000000000000000000000000000000000000.png";
const FRIEND_AVATAR = "https://avatars.akamai.steamstatic.com/ffffffffffffffffffffffffffffffffffffffff_medium.jpg";

const miniprofile = (fields: Record<string, unknown> = {}) => JSON.stringify({
    level: 16, level_class: "friendPlayerLevel lvl_10", avatar_url: OWN_AVATAR, persona_name: "Fixture Name",
    favorite_badge: { name: "x" }, avatar_frame: FRAME, ...fields,
});

const WALLET = '{"wallet_currency":18,"wallet_country":"UA","wallet_balance":"5099","wallet_delayed_balance":"0","success":1,"rwgrsn":-2}';
const marketPage = ({ loggedIn = true, extra = "" } = {}) =>
    `<script type="text/javascript"> var g_bLoggedIn = ${loggedIn};${loggedIn ? ` var g_rgWalletInfo = ${WALLET};` : ""} </script>` +
    (loggedIn ? '<a id="marketWalletBalance" href="https://store.steampowered.com/account/">Wallet balance <span id="marketWalletBalanceAmount">50,99₴</span></a>' : "") +
    '<div class="market_fixture_block"></div>' + extra;

// Profile page with an avatar frame (first srcset), friends' levels before and after the own block.
const friendLevels = [667, 313].map((level) =>
    `<div class="friendBlock"><img src="${FRIEND_AVATAR}"><div class="friendPlayerLevel lvl_${level}"><span class="friendPlayerLevelNum">${level}</span></div></div>`).join("");
const profilePage = ({ ownLevel = 8 as number | null } = {}) => `
<div class="profile_header_content">
 <div class="playerAvatar profile_header_size offline" data-miniprofile="${ACCOUNT_ID}"> <div class="playerAvatarAutoSizeInner">
  <div class="profile_avatar_frame"> <picture> <source srcset="${FRAME}"></source> <img src="${FRAME}"> </picture> </div>
  <picture> <source media="(prefers-reduced-motion: reduce)" srcset="${OWN_AVATAR}"></source> <img srcset="${OWN_AVATAR}"> </picture>
 </div> </div>
 ${friendLevels}
 <div class="persona_name" style="font-size: 24px;"><span class="actual_persona_name">Page Name</span></div>
 ${ownLevel === null ? "" : `<div class="persona_name persona_level">Level <div class="friendPlayerLevel lvl_10"><span class="friendPlayerLevelNum">${ownLevel}</span></div></div>`}
</div>
${friendLevels}`;

// Profile XML (SDA-58): only <memberSince> matters, the rest is the usual shape.
const profileXml = (memberSince: string | null = "March 4, 2012") =>
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><profile><steamID64>${STEAM_ID}</steamID64>` +
    `<steamID><![CDATA[Fixture Name]]></steamID><privacyState>private</privacyState>` +
    (memberSince === null ? "" : `<memberSince>${memberSince}</memberSince>`) + `</profile>`;

const enc = (o: object) => encodeURIComponent(JSON.stringify(o));
function eligibility(value: object | null) {
    const headers: Record<string, string | string[]> = { Location: "https://steamcommunity.com/" };
    if (value) headers["Set-Cookie"] = [`webTradeEligibility=${enc(value)}; path=/market; secure`];
    return [302, "", headers] as [number, string, Record<string, string | string[]>];
}

function steam({ mini = [200, miniprofile()] as [number, string], market = [200, marketPage()] as [number, string],
    trade = { allowed: 1 } as object | null, profile = null as [number, string] | null,
    xml = [200, profileXml()] as [number, string] | null } = {}) {
    const scope = nock("https://steamcommunity.com");
    scope.get(`/miniprofile/${ACCOUNT_ID}/json`).reply(mini[0], mini[1]);
    scope.get("/market/").reply(market[0], market[1]);
    scope.get("/market/eligibilitycheck/").query({ goto: "/" }).reply(...eligibility(trade));
    if (profile) scope.get(`/profiles/${STEAM_ID}/`).reply(profile[0], profile[1]);
    if (xml) scope.get(`/profiles/${STEAM_ID}/`).query({ xml: "1" }).reply(xml[0], xml[1]);
    return scope;
}

// Real client with a session cookie; every requested URI is recorded.
function community() {
    const c = new SteamCommunity({ request: request.defaults({}) });
    c.setCookies([`steamLoginSecure=${STEAM_ID}%7C%7Cfake`]);
    const uris: string[] = [];
    const original = c.httpRequestGet.bind(c);
    jest.spyOn(c, "httpRequestGet").mockImplementation(((options: { uri: string }, callback: unknown) => {
        uris.push(options.uri);
        return original(options as never, callback as never);
    }) as never);
    return { c, uris };
}

function errorObjects(value: unknown, path = "$", out: string[] = []): string[] {
    if (value instanceof Error) out.push(path);
    if (value && typeof value === "object") for (const [k, v] of Object.entries(value)) errorObjects(v, `${path}.${k}`, out);
    return out;
}

beforeAll(() => {
    setMainLanguage("en");
    nock.disableNetConnect();
});
afterEach(() => nock.cleanAll());
afterAll(() => nock.enableNetConnect());

describe("one account refresh", () => {
    it("downloads the miniprofile, /market/, the eligibility check and the profile XML once each, and never the profile page or the store", async () => {
        const scope = steam();
        const { c, uris } = community();
        const data = await getAccountData(c);
        expect(uris).toEqual([MINIPROFILE, MARKET, ELIGIBILITY, PROFILE_XML]);
        expect(scope.isDone()).toBe(true);
        expect(data).toEqual({
            secondary: { nickname: "Fixture Name", level: 16, avatarUrl: OWN_AVATAR, ktState: false, tpState: true, tradeState: true, registeredAt: "2012-03-04" },
            changableSecondary: { steam: { balance: 50.99, currency: "₴", error: null } },
        });
    });

    it("keeps a miniprofile avatar only when it is a real Steam avatar", async () => {
        steam({ mini: [200, miniprofile({ avatar_url: FRAME })] });
        expect((await getAccountData(community().c)).secondary.avatarUrl).toBe(DEFAULT_AVATAR_URL);
    });

    it.each([
        ["malformed JSON", [200, "<html>not json</html>"]],
        ["JSON without a level", [200, miniprofile({ level: undefined })]],
        ["JSON without a name", [200, miniprofile({ persona_name: "" })]],
        ["an HTTP error", [500, ""]],
    ])("falls back to the profile page after %s: skips the avatar frame and friends' levels", async (_name, mini) => {
        steam({ mini: mini as [number, string], profile: [200, profilePage()] });
        const { c, uris } = community();
        const data = await getAccountData(c);
        expect(uris).toEqual([MINIPROFILE, PROFILE, MARKET, ELIGIBILITY, PROFILE_XML]);
        expect(data.secondary).toMatchObject({ nickname: "Page Name", level: 8, avatarUrl: OWN_AVATAR });
    });

    it("a private profile page without its own level block gives an unknown level, not a friend's", async () => {
        steam({ mini: [500, ""], profile: [200, profilePage({ ownLevel: null })] });
        expect((await getAccountData(community().c)).secondary.level).toBeNull();
    });

    // Review r1: an HTTP-200 page without the profile name must not overwrite nickname/avatar with empty values
    it("fails as a whole when the fallback profile page has no account name", async () => {
        const scope = nock("https://steamcommunity.com");
        scope.get(`/miniprofile/${ACCOUNT_ID}/json`).reply(500, "");
        scope.get(`/profiles/${STEAM_ID}/`).reply(200, "<html><body>Temporarily unavailable</body></html>");
        const { c, uris } = community();
        await expect(getAccountData(c)).rejects.toThrow("without the account name");
        expect(uris).toEqual([MINIPROFILE, PROFILE]);
    });

    it("fails as a whole when neither the miniprofile nor the profile page arrives", async () => {
        const scope = nock("https://steamcommunity.com");
        scope.get(`/miniprofile/${ACCOUNT_ID}/json`).reply(500, "");
        scope.get(`/profiles/${STEAM_ID}/`).reply(503, "");
        const { c, uris } = community();
        await expect(getAccountData(c)).rejects.toThrow("HTTP error 503");
        expect(uris).toEqual([MINIPROFILE, PROFILE]);
    });

    // SDA-58: the registration date never changes, so a known one costs no request
    it("does not download the profile XML when the registration date is already known", async () => {
        const scope = steam({ xml: null });
        const { c, uris } = community();
        const data = await getAccountData(c, "2015-06-07");
        expect(uris).toEqual([MINIPROFILE, MARKET, ELIGIBILITY]);
        expect(scope.isDone()).toBe(true);
        expect(data.secondary.registeredAt).toBe("2015-06-07");
    });

    it("downloads the profile XML again when the stored date is not a valid date", async () => {
        steam();
        const { c, uris } = community();
        expect((await getAccountData(c, "garbage")).secondary.registeredAt).toBe("2012-03-04");
        expect(uris).toContain(PROFILE_XML);
    });

    it.each([
        ["an HTTP error", [500, ""]],
        ["XML without memberSince (profile hidden from the owner)", [200, profileXml(null)]],
        ["an unrecognised date", [200, profileXml("4. März 2012")]],
    ])("%s gives an unknown registration date and keeps everything else", async (_name, xml) => {
        steam({ xml: xml as [number, string] });
        const data = await getAccountData(community().c);
        expect(data.secondary).toEqual({ nickname: "Fixture Name", level: 16, avatarUrl: OWN_AVATAR, ktState: false, tpState: true, tradeState: true, registeredAt: null });
        expect(data.changableSecondary.steam.balance).toBe(50.99);
    });

    // SDA-59: один 429 больше не оставляет дату неизвестной до следующего ручного обновления
    describe("profile XML answered 429", () => {
        const saved = PROFILE_XML_RETRY.delaysMs;
        beforeEach(() => { PROFILE_XML_RETRY.delaysMs = [1, 1]; });
        afterEach(() => { PROFILE_XML_RETRY.delaysMs = saved; });

        it("is retried after a pause and the date arrives", async () => {
            const scope = steam({ xml: [429, ""] });
            scope.get(`/profiles/${STEAM_ID}/`).query({ xml: "1" }).reply(200, profileXml());
            const { c, uris } = community();
            expect((await getAccountData(c)).secondary.registeredAt).toBe("2012-03-04");
            expect(uris.filter((uri) => uri === PROFILE_XML)).toHaveLength(2);
            expect(scope.isDone()).toBe(true);
        });

        it("gives up after the last retry; other errors are not retried", async () => {
            const scope = steam({ xml: [429, ""] });
            scope.get(`/profiles/${STEAM_ID}/`).query({ xml: "1" }).times(2).reply(429, "");
            const first = community();
            expect((await getAccountData(first.c)).secondary.registeredAt).toBeNull();
            expect(first.uris.filter((uri) => uri === PROFILE_XML)).toHaveLength(3);
            expect(scope.isDone()).toBe(true);

            steam({ xml: [500, ""] });
            const second = community();
            expect((await getAccountData(second.c)).secondary.registeredAt).toBeNull();
            expect(second.uris.filter((uri) => uri === PROFILE_XML)).toHaveLength(1);
        });
    });

    it("parseMemberSince reads the English formats Steam uses and nothing else", () => {
        const now = new Date(Date.UTC(2026, 10, 25));
        const xml = (text: string) => `<profile><memberSince>${text}</memberSince></profile>`;
        expect(parseMemberSince(xml("March 4, 2012"), now)).toBe("2012-03-04");
        expect(parseMemberSince(xml("September 12th, 2003"), now)).toBe("2003-09-12");
        expect(parseMemberSince(xml("4 March, 2012"), now)).toBe("2012-03-04");
        expect(parseMemberSince(xml("Dec 31, 2019"), now)).toBe("2019-12-31");
        expect(parseMemberSince(xml(" <![CDATA[ March 4, 2012 ]]> "), now)).toBe("2012-03-04");
        // the current year is left out by Steam
        expect(parseMemberSince(xml("November 2"), now)).toBe("2026-11-02");
        // SDA-61: New Year's night east of Greenwich — Steam still writes "this year" in UTC
        expect(parseMemberSince(xml("January 1"), new Date(Date.UTC(2026, 11, 31, 22, 30)))).toBe("2026-01-01");
        // garbage, impossible and future dates are unknown, not a guess
        for (const text of ["", "0", "Mar 2012", "February 30, 2012", "Smarch 4, 2012", "4. März 2012", "January 1, 2002", "December 30"]) {
            expect(parseMemberSince(xml(text), now)).toBeNull();
        }
        expect(parseMemberSince("<profile></profile>", now)).toBeNull();
        expect(parseMemberSince(undefined, now)).toBeNull();
    });

    it("parseMiniprofile accepts only the expected shape", () => {
        expect(parseMiniprofile(miniprofile({ persona_name: "  Spaced  " }))).toEqual({ nickname: "Spaced", level: 16, avatarUrl: OWN_AVATAR });
        expect(parseMiniprofile(miniprofile({ level: "16" }))).toBeNull();
        expect(parseMiniprofile(miniprofile({ level: -1 }))).toBeNull();
        expect(parseMiniprofile("[]")).toBeNull();
        expect(parseMiniprofile("null")).toBeNull();
        expect(parseMiniprofile(undefined)).toBeNull();
    });
});

describe("red flag (KT), Market and trade status", () => {
    // Bit names from Valve's EMarketNotAllowedReasonFlags; no banned account was available to check live.
    it.each([
        ["AccountDisabled", 1 << 1],
        ["AccountLockedDown", 1 << 2],
        ["TradeBanned", 1 << 4],
    ])("KT is set by the %s bit even without the English text on /market/", async (_name, reason) => {
        steam({ trade: { allowed: 0, reason } });
        const { secondary } = await getAccountData(community().c);
        expect(secondary).toMatchObject({ ktState: true, tradeState: false, tpState: true });
    });

    it("KT is still set by the English text on /market/", async () => {
        steam({ market: [200, marketPage({ extra: '<div class="market_warning_header">Your account is currently locked</div>' })] });
        expect((await getAccountData(community().c)).secondary).toMatchObject({ ktState: true, tpState: false, tradeState: true });
    });

    it("a limited account is not KT, but trades are blocked", async () => {
        steam({ trade: { allowed: 0, reason: 1 << 3 } });
        expect((await getAccountData(community().c)).secondary).toMatchObject({ ktState: false, tradeState: false });
    });

    it("failed checks give unknown statuses and a string balance error, never OK or an Error object", async () => {
        steam({ market: [500, ""], trade: null });
        const data = await getAccountData(community().c);
        expect(data.secondary).toMatchObject({ nickname: "Fixture Name", ktState: null, tpState: null, tradeState: null });
        expect(data.changableSecondary.steam).toEqual({ balance: null, currency: null, error: expect.stringContaining("HTTP error 500") });
        expect(errorObjects(data)).toEqual([]);
    });

    it("an ambiguous eligibility answer (temporary failure) leaves KT and trades unknown", async () => {
        steam({ trade: { allowed: 0, reason: 1 } });
        expect((await getAccountData(community().c)).secondary).toMatchObject({ ktState: null, tradeState: null, tpState: true });
    });

    // Review r1: logged in + HTTP 200 is not proof of a Market page; with failed eligibility this used to give TP OK
    it("a logged-in page that is not the Market gives unknown TP/KT and a balance error, not OK and a dash", async () => {
        steam({ market: [200, '<script> var g_bLoggedIn = true; </script><h2>Temporarily unavailable</h2>'], trade: null });
        const data = await getAccountData(community().c);
        expect(data.secondary).toMatchObject({ ktState: null, tpState: null, tradeState: null });
        expect(data.changableSecondary.steam).toEqual({ balance: null, currency: null, error: expect.stringContaining("not the Community Market") });
    });

    it("a malformed eligibility reason gives unknown trade and KT, not OK", async () => {
        steam({ trade: { allowed: 0, reason: "nonsense" } });
        expect((await getAccountData(community().c)).secondary).toMatchObject({ ktState: null, tradeState: null });
    });

    it("a logged-out /market/ makes the Market status unknown and the balance an error", async () => {
        steam({ market: [200, marketPage({ loggedIn: false })] });
        const data = await getAccountData(community().c);
        expect(data.secondary).toMatchObject({ tpState: null, ktState: false, tradeState: true });
        expect(data.changableSecondary.steam).toEqual({ balance: null, currency: null, error: expect.stringContaining("logged in") });
    });
});
