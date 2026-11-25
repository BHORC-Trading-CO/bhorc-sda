// Вход по maFile при добавлении аккаунта (SDA-62): чужой maFile не сохраняется под введённым логином,
// мёртвый refresh-токен ведёт ко входу по паролю, и по паролю входим один раз.
const mockSteam: Record<string, any> = {};
jest.mock("steam-session", () => {
    const { EventEmitter } = require("events");
    return {
        EAuthTokenPlatformType: { MobileApp: 2 },
        EAuthSessionGuardType: { None: 1, EmailCode: 2, DeviceCode: 3, DeviceConfirmation: 4, EmailConfirmation: 5 },
        LoginSession: class extends EventEmitter {
            accessToken: string | undefined; refreshToken: string | undefined;
            steamID: any = { toString: () => mockSteam.passwordSteamId, getSteamID64: () => mockSteam.passwordSteamId };
            cancelLoginAttempt = jest.fn();
            submitSteamGuardCode = jest.fn(async (code: string) => { await mockSteam.submit?.(code); setImmediate(() => this.emit("authenticated")); });
            constructor() { super(); mockSteam.sessions.push(this); }
            refreshAccessToken() { return mockSteam.refresh(this); }
            async startWithCredentials(details: any) {
                mockSteam.passwordLogins.push(details);
                // Как библиотека: токен другого аккаунта поверх прежнего она не принимает
                if (this.refreshToken) throw new Error("This access token belongs to a different account from the set refresh token.");
                const result = mockSteam.passwordResult ?? { actionRequired: false };
                this.accessToken = "fresh-access"; this.refreshToken = "fresh-refresh";
                if (!result.actionRequired) setImmediate(() => this.emit(mockSteam.passwordEvent ?? "authenticated"));
                return result;
            }
        },
    };
});
jest.mock("steamcommunity", () => jest.fn(() => ({
    loggedIn: (cb: Function) => mockSteam.loggedIn(cb),
    parentalUnlock: (pin: string, cb: Function) => mockSteam.parentalUnlock(pin, cb),
})));
jest.mock("../../../application/application", () => ({ __esModule: true, default: { sendToMain: jest.fn() } }));
jest.mock("../../Functions/applyCommunityCookies", () => ({ __esModule: true, default: jest.fn().mockResolvedValue(undefined) }));
jest.mock("../../../application/askInfo/askMailCode", () => ({ __esModule: true, default: jest.fn() }));
jest.mock("../../../application/askInfo/askFamilyPin", () => ({ __esModule: true, default: jest.fn() }));
jest.mock("../loadSteamAccountData", () => ({ getSecondaries: jest.fn().mockResolvedValue({ nickname: "n" }) }));

import nock from "nock";
import maFileLogin from "../maFileLogin";
import application from "../../../application/application";
import askMailCode from "../../../application/askInfo/askMailCode";
import askFamilyPin from "../../../application/askInfo/askFamilyPin";
import { getSecondaries } from "../loadSteamAccountData";
import SteamAccountChannels from "../../../../interfaces/IpcChannels/SteamAccountChannels";
import { setMainLanguage } from "../../../../i18n";

const DAY = 24 * 60 * 60 * 1000;
const A = "76561198000000001";
const B = "76561198000000002";
const jwt = (sub: string, exp = Date.now() + DAY) =>
    `e30.${Buffer.from(JSON.stringify({ sub, exp: Math.floor(exp / 1000) })).toString("base64url")}.c2ln`;
const tokens = (sub: string, exp?: number) => ({ SteamID: sub, AccessToken: jwt(sub), RefreshToken: jwt(sub, exp) });
const params = (maFile: Record<string, unknown> = {}) => ({
    accountName: "account_a", password: "password", familyViewPin: null, useSteamCookies: true,
    maFile: { shared_secret: "c2VjcmV0", account_name: "account_a", Session: tokens(A), ...maFile },
} as any);

beforeAll(() => { nock.disableNetConnect(); setMainLanguage("en"); });
afterAll(() => nock.enableNetConnect());
beforeEach(() => {
    for (const key of Object.keys(mockSteam)) delete mockSteam[key];
    Object.assign(mockSteam, {
        sessions: [], passwordLogins: [], passwordSteamId: A,
        refresh: jest.fn().mockResolvedValue(undefined),
        loggedIn: jest.fn((cb: Function) => cb(null, true, false)),
    });
});

describe("identity (R2-1)", () => {
    it("another account's maFile is rejected before any login", async () => {
        await expect(maFileLogin(params({ account_name: "account_b", Session: tokens(B) }))).rejects.toThrow(/another account.*account_a.*account_b/);
        expect(mockSteam.sessions).toEqual([]);
    });
    it("a session of another account inside the maFile is rejected before any login", async () => {
        await expect(maFileLogin(params({ Session: { ...tokens(B), SteamID: A } }))).rejects.toThrow(/different SteamIDs/);
        expect(mockSteam.sessions).toEqual([]);
    });
    it("a password login into another account is rejected and its session is not stored", async () => {
        mockSteam.passwordSteamId = B;
        const setup = params({ account_name: undefined, Session: { SteamID: A } });
        await expect(maFileLogin(setup)).rejects.toThrow(/different SteamIDs/);
        expect(setup.maFile.Session).toEqual({ SteamID: A });
    });
    it.each([
        ["case and spaces do not matter", { account_name: " Account_A " }],
        ["no account_name and nothing contradicts", { account_name: undefined }],
        ["a placeholder SteamID says nothing", { Session: { ...tokens(A), SteamID: "0" } }],
    ])("accepted: %s", async (_name, maFile) => {
        await expect(maFileLogin(params(maFile))).resolves.toMatchObject({ accountName: "account_a" });
    });
});

it("the form's mail, profile name and cookie choice reach the new account (R2-4)", async () => {
    const extra = { mail: "m@example.invalid", mailPassword: "mail-password", profileName: "profile", useSteamCookies: false };
    await expect(maFileLogin({ ...params(), ...extra })).resolves.toMatchObject(extra);
});

describe("dead refresh token", () => {
    it("an expired token is not sent to Steam: login by password", async () => {
        const setup = params({ Session: tokens(A, Date.now() - DAY) });
        await expect(maFileLogin(setup)).resolves.toMatchObject({ maFile: { Session: { RefreshToken: "fresh-refresh", SteamID: A } } });
        expect(mockSteam.passwordLogins).toHaveLength(1);
        // Единственный refresh — уже новой сессии, после входа по паролю
        expect(mockSteam.refresh).toHaveBeenCalledTimes(1);
        expect(mockSteam.refresh.mock.calls[0][0].refreshToken).toBe("fresh-refresh");
    });
    it.each([["AccessDenied", undefined], ["x", 26]])("a token revoked by Steam (%s, %s): login by password", async (message, eresult) => {
        mockSteam.refresh.mockRejectedValueOnce(Object.assign(new Error(message), { eresult }));
        await expect(maFileLogin(params())).resolves.toMatchObject({ maFile: { Session: { RefreshToken: "fresh-refresh" } } });
        expect(mockSteam.passwordLogins).toHaveLength(1);
    });
    it("a network error is not a dead token", async () => {
        mockSteam.refresh.mockRejectedValueOnce(new Error("ETIMEDOUT"));
        await expect(maFileLogin(params())).rejects.toThrow("ETIMEDOUT");
        expect(mockSteam.passwordLogins).toHaveLength(0);
    });
    it.each([
        ["denied again", () => mockSteam.refresh.mockRejectedValue(new Error("AccessDenied"))],
        ["never logged in", () => { mockSteam.loggedIn = jest.fn((cb: Function) => cb(null, false, false)); }],
    ])("one password login only: %s", async (_name, arrange) => {
        arrange();
        await expect(maFileLogin(params())).rejects.toThrow();
        expect(mockSteam.passwordLogins).toHaveLength(1);
    });
});

// SDA-63
describe("login challenges (R2-11)", () => {
    const passwordOnly = () => params({ Session: undefined });
    it.each([
        ["DeviceCode", [{ type: 3 }]],
        ["DeviceCode with an app confirmation", [{ type: 3 }, { type: 4 }]],
    ])("a rejected Guard code ends the login instead of waiting forever: %s", async (_name, validActions) => {
        mockSteam.passwordResult = { actionRequired: true, validActions };
        await expect(maFileLogin(passwordOnly())).rejects.toThrow(/rejected the Guard code/);
        expect(mockSteam.sessions[1].cancelLoginAttempt).toHaveBeenCalled();
    });
    it("an email code is asked for and submitted", async () => {
        mockSteam.passwordResult = { actionRequired: true, validActions: [{ type: 2 }] };
        (askMailCode as jest.Mock).mockResolvedValueOnce("ABCDE");
        await expect(maFileLogin(passwordOnly())).resolves.toMatchObject({ accountName: "account_a" });
        expect(mockSteam.sessions[1].submitSteamGuardCode).toHaveBeenCalledWith("ABCDE");
    });
    it.each([["timeout", /timed out/], ["error", /poll failed/]])("a polling %s rejects", async (event, message) => {
        mockSteam.passwordResult = { actionRequired: true, validActions: [{ type: 5 }] };
        const login = maFileLogin(passwordOnly());
        await new Promise(setImmediate);
        mockSteam.sessions[1].emit(event, new Error("poll failed"));
        await expect(login).rejects.toThrow(message);
    });
});

describe("Family View PIN (R2-15)", () => {
    beforeEach(() => {
        mockSteam.loggedIn = jest.fn((cb: Function) => cb(null, true, true));
        mockSteam.parentalUnlock = jest.fn();
    });
    it("a wrong PIN (the library answers with a string) is asked again; the right one is kept as typed", async () => {
        (askFamilyPin as jest.Mock).mockResolvedValueOnce("1111").mockResolvedValueOnce("0123");
        mockSteam.parentalUnlock.mockImplementationOnce((_pin: string, cb: Function) => cb("Incorrect PIN")).mockImplementationOnce((_pin: string, cb: Function) => cb());
        await expect(maFileLogin(params())).resolves.toMatchObject({ familyViewPin: "0123" });
        expect(application.sendToMain).toHaveBeenCalledWith("ERROR", "Wrong PIN");
        expect(mockSteam.parentalUnlock).toHaveBeenCalledTimes(2);
    });
    it("any other answer ends the login", async () => {
        (askFamilyPin as jest.Mock).mockResolvedValueOnce("1111");
        mockSteam.parentalUnlock.mockImplementationOnce((_pin: string, cb: Function) => cb("Too many invalid PIN attempts"));
        await expect(maFileLogin(params())).rejects.toBe("Too many invalid PIN attempts");
    });
    it.each([["with a reason", new Error("cancelled")], ["without one", undefined]])("a closed prompt ends the login: %s", async (_name, reason) => {
        (askFamilyPin as jest.Mock).mockRejectedValueOnce(reason);
        await expect(maFileLogin(params())).rejects.toBe(reason);
    });
});

describe("abort (R2-12)", () => {
    const tick = () => new Promise(setImmediate);
    it("an aborted run logs in nowhere, asks nothing and reports no steps", async () => {
        const run = new AbortController();
        let finishRefresh!: () => void;
        mockSteam.refresh = jest.fn(() => new Promise<void>((_resolve, reject) => { finishRefresh = () => reject(new Error("AccessDenied")); }));
        const login = maFileLogin(params(), { signal: run.signal, stepChannel: SteamAccountChannels.STEAM_ACCOUNT_CREATE_PROCESS_STEP });
        run.abort();
        await expect(login).rejects.toBe("abort");
        (application.sendToMain as jest.Mock).mockClear();
        finishRefresh();
        await tick();
        expect(mockSteam.passwordLogins).toEqual([]);
        expect(application.sendToMain).not.toHaveBeenCalled();
    });
    it("an abort before Steam answers the password stops the polling the library starts anyway", async () => {
        const run = new AbortController();
        mockSteam.passwordResult = { actionRequired: true, validActions: [{ type: 2 }] };
        const login = maFileLogin(params({ Session: undefined }), { signal: run.signal });
        await Promise.resolve();
        const cancelled = () => mockSteam.sessions[1].cancelLoginAttempt.mock.calls.length;
        while (!mockSteam.sessions[1]) await Promise.resolve();
        run.abort();
        const before = cancelled();
        await expect(login).rejects.toBe("abort");
        await tick();
        expect(cancelled()).toBeGreaterThan(before);
        expect(askMailCode).not.toHaveBeenCalled();
        expect(getSecondaries).not.toHaveBeenCalled();
    });
    it("the prompts get the run's signal", async () => {
        const run = new AbortController();
        mockSteam.passwordResult = { actionRequired: true, validActions: [{ type: 2 }] };
        (askMailCode as jest.Mock).mockResolvedValueOnce("ABCDE");
        await maFileLogin(params({ Session: undefined }), { signal: run.signal });
        expect(askMailCode).toHaveBeenCalledWith(expect.any(String), "account_a", run.signal);
    });
});
