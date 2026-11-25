// Подключение Guard (SDA-63): отмена до запроса AddAuthenticator ничего не меняет в Steam, после него —
// не теряет секреты, после отправки кода подтверждения — не теряет аккаунт. Опрос входа завершается всегда.
const mockSteam: Record<string, any> = {};
const mockRaw = { status: 1, revocation_code: "R-TEST", shared_secret: "c2VjcmV0", server_time: "1" };
jest.mock("steam-session", () => {
    const { EventEmitter } = require("events");
    return {
        EAuthTokenPlatformType: { MobileApp: 2 },
        EAuthSessionGuardType: { None: 1, EmailCode: 2, DeviceCode: 3, DeviceConfirmation: 4, EmailConfirmation: 5 },
        LoginSession: class extends EventEmitter {
            accessToken = "fake-access"; refreshToken = "fake-refresh";
            steamID = { getSteamID64: () => "76561198000000001", toString: () => "76561198000000001" };
            cancelLoginAttempt = jest.fn();
            submitSteamGuardCode = jest.fn().mockResolvedValue(undefined);
            constructor() { super(); mockSteam.session = this; }
            startWithCredentials() { return mockSteam.start(this); }
        },
    };
});
jest.mock("steamcommunity", () => Object.assign(jest.fn(() => ({
    loggedIn: (cb: Function) => mockSteam.loggedIn(cb),
    setMobileAppAccessToken: jest.fn(),
    enableTwoFactor: (cb: Function) => mockSteam.enableTwoFactor(cb),
})), { EResult: { OK: 1, Fail: 2, RateLimitExceeded: 84 } }));
jest.mock("../../../application/application", () => ({ __esModule: true, default: { sendToMain: jest.fn() } }));
jest.mock("../../Functions/applyCommunityCookies", () => ({ __esModule: true, default: jest.fn().mockResolvedValue(undefined) }));
jest.mock("../../Functions/savePendingAuthenticator", () => ({ __esModule: true, default: jest.fn(() => "/fake/backup.json") }));
jest.mock("../../../application/askInfo/askSmsCode", () => ({ __esModule: true, default: jest.fn() }));
jest.mock("../../../application/askInfo/askMailCode", () => ({ __esModule: true, default: jest.fn() }));
jest.mock("../../Functions/finalizeAddAuthenticator", () => ({ __esModule: true, default: jest.fn() }));
jest.mock("../loadSteamAccountData", () => ({ getSecondaries: jest.fn().mockResolvedValue({}) }));

import setupGuard from "../setupGuard";
import application from "../../../application/application";
import applyCommunityCookies from "../../Functions/applyCommunityCookies";
import savePendingAuthenticator from "../../Functions/savePendingAuthenticator";
import askSmsCode from "../../../application/askInfo/askSmsCode";
import askMailCode from "../../../application/askInfo/askMailCode";
import finalizeAddAuthenticator from "../../Functions/finalizeAddAuthenticator";
import { setMainLanguage } from "../../../../i18n";

const tick = () => new Promise(setImmediate);
let run: AbortController;
let recovery: jest.Mock;
const start = () => setupGuard({ accountName: "fake", password: "fake" }, null, recovery, run.signal);

beforeAll(() => setMainLanguage("en"));
beforeEach(() => {
    run = new AbortController();
    recovery = jest.fn();
    Object.assign(mockSteam, {
        start: jest.fn(async (session: any) => { setImmediate(() => session.emit("authenticated")); return { actionRequired: false }; }),
        loggedIn: jest.fn((cb: Function) => cb(null, true, false)),
        enableTwoFactor: jest.fn((cb: Function) => cb(null, mockRaw)),
    });
    for (const fn of [askSmsCode, askMailCode, finalizeAddAuthenticator]) (fn as jest.Mock).mockReset();
    (askSmsCode as jest.Mock).mockResolvedValue("12345");
    (finalizeAddAuthenticator as jest.Mock).mockResolvedValue(undefined);
});

describe("abort before the enrollment request", () => {
    it("while Steam checks the password: no polling, no enrollment", async () => {
        let answer!: (value: unknown) => void;
        mockSteam.start = jest.fn(() => new Promise(resolve => { answer = resolve; }));
        const setup = start();
        run.abort();
        await expect(setup).rejects.toBe("abort");
        const cancelled = mockSteam.session.cancelLoginAttempt.mock.calls.length;
        // Библиотека начинает опрос по ответу, даже если её уже отменили
        answer({ actionRequired: true, validActions: [{ type: 2 }] });
        await tick();
        expect(mockSteam.session.cancelLoginAttempt.mock.calls.length).toBeGreaterThan(cancelled);
        expect(askMailCode).not.toHaveBeenCalled();
    });
    it("while the cookies are fetched", async () => {
        let cookies!: () => void;
        (applyCommunityCookies as jest.Mock).mockImplementationOnce(() => new Promise<void>(resolve => { cookies = resolve; }));
        const setup = start();
        await tick(); await tick();
        run.abort();
        await expect(setup).rejects.toBe("abort");
        (application.sendToMain as jest.Mock).mockClear();
        cookies();
        await tick();
        expect(mockSteam.enableTwoFactor).not.toHaveBeenCalled();
        expect(application.sendToMain).not.toHaveBeenCalled();
    });
    it("while the session is checked", async () => {
        let checked!: Function;
        mockSteam.loggedIn = jest.fn((cb: Function) => { checked = cb; });
        const setup = start();
        await tick(); await tick();
        run.abort();
        checked(null, true, false);
        await expect(setup).rejects.toBe("abort");
        expect(mockSteam.enableTwoFactor).not.toHaveBeenCalled();
    });
    it("the email prompt belongs to the run", async () => {
        mockSteam.start = jest.fn(async () => ({ actionRequired: true, validActions: [{ type: 2 }] }));
        (askMailCode as jest.Mock).mockRejectedValueOnce(new Error("closed"));
        await expect(start()).rejects.toThrow("closed");
        expect(askMailCode).toHaveBeenCalledWith(expect.any(String), "fake", run.signal);
    });
});

describe("abort after the enrollment request", () => {
    it("in flight: the answer is awaited, the secrets are saved and published, no code is asked", async () => {
        let enrolled!: Function;
        mockSteam.enableTwoFactor = jest.fn((cb: Function) => { enrolled = cb; });
        const outcome = start().catch(err => err);
        await tick(); await tick();
        run.abort();
        (askSmsCode as jest.Mock).mockRejectedValueOnce(new Error("closed"));
        (application.sendToMain as jest.Mock).mockClear();
        enrolled(null, mockRaw);
        expect(savePendingAuthenticator).toHaveBeenCalledWith("fake", mockRaw, "76561198000000001");
        expect(recovery).toHaveBeenCalledWith("R-TEST", "76561198000000001");
        expect(await outcome).toEqual(new Error("closed"));
        // Шаги отменённого запуска не показываются в следующем мастере
        expect(application.sendToMain).not.toHaveBeenCalled();
        expect(askSmsCode).toHaveBeenCalledWith(expect.any(String), "fake", run.signal);
        expect(finalizeAddAuthenticator).not.toHaveBeenCalled();
    });
    it("at the activation prompt: the secrets stay saved, nothing is finalized", async () => {
        (askSmsCode as jest.Mock).mockImplementationOnce(async () => { run.abort(); return "12345"; });
        await expect(start()).rejects.toBe("abort");
        expect(savePendingAuthenticator).toHaveBeenCalledTimes(1);
        expect(recovery).toHaveBeenCalledTimes(1);
        expect(finalizeAddAuthenticator).not.toHaveBeenCalled();
    });
    it("after the code went to Steam: the connected account is returned, not dropped", async () => {
        (finalizeAddAuthenticator as jest.Mock).mockImplementationOnce(async () => { run.abort(); });
        await expect(start()).resolves.toMatchObject({ accountName: "fake", maFile: { revocation_code: "R-TEST", shared_secret: "c2VjcmV0" } });
    });
    it("after Steam rejected the code: no second finalization", async () => {
        (finalizeAddAuthenticator as jest.Mock).mockImplementationOnce(async () => { run.abort(); throw new Error("Invalid activation code"); });
        (askSmsCode as jest.Mock).mockResolvedValueOnce("12345").mockRejectedValueOnce(new Error("closed"));
        await expect(start()).rejects.toThrow("closed");
        expect(finalizeAddAuthenticator).toHaveBeenCalledTimes(1);
    });
});

describe("login polling (R2-14)", () => {
    it.each([["timeout", /timed out/], ["error", /proxy failed/]])("%s ends the wizard", async (event, message) => {
        mockSteam.start = jest.fn(async () => ({ actionRequired: false }));
        const setup = start();
        await tick();
        mockSteam.session.emit(event, new Error("proxy failed"));
        await expect(setup).rejects.toThrow(message);
        expect(mockSteam.enableTwoFactor).not.toHaveBeenCalled();
    });
});
