// Подключение Guard (SDA-63): отмена до запроса AddAuthenticator ничего не меняет в Steam, после него —
// не теряет секреты, после отправки кода подтверждения — не теряет аккаунт. Опрос входа завершается всегда.
const mockSteam: Record<string, any> = {};
const mockRaw = { status: 1, revocation_code: "R-TEST", shared_secret: "MTIzNDU2Nzg5MDEyMzQ1Njc4OTA=", identity_secret: "identity", server_time: "1" };
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
    setMobileAppAccessToken: (token: string) => mockSteam.setToken?.(token),
    enableTwoFactor: (cb: Function) => mockSteam.enableTwoFactor(cb),
})), { EResult: { OK: 1, Fail: 2, RateLimitExceeded: 84 } }));
jest.mock("../../../application/application", () => ({ __esModule: true, default: { sendToMain: jest.fn() } }));
jest.mock("../../Functions/applyCommunityCookies", () => ({ __esModule: true, default: jest.fn().mockResolvedValue(undefined) }));
jest.mock("../../Functions/savePendingAuthenticator", () => ({ __esModule: true, default: jest.fn(() => "/fake/backup.json") }));
jest.mock("../../../application/askInfo/askSmsCode", () => ({ __esModule: true, default: jest.fn() }));
jest.mock("../../../application/askInfo/askMailCode", () => ({ __esModule: true, default: jest.fn() }));
jest.mock("../../Functions/finalizeAddAuthenticator", () => ({ __esModule: true, default: jest.fn() }));

import setupGuard from "../setupGuard";
import application from "../../../application/application";
import applyCommunityCookies from "../../Functions/applyCommunityCookies";
import savePendingAuthenticator from "../../Functions/savePendingAuthenticator";
import askSmsCode from "../../../application/askInfo/askSmsCode";
import askMailCode from "../../../application/askInfo/askMailCode";
import finalizeAddAuthenticator from "../../Functions/finalizeAddAuthenticator";
import { GUARD_DEADLINES, isUnknownOutcome } from "../../Functions/guardOutcome";
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
        setToken: undefined,
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
        (askMailCode as jest.Mock).mockImplementationOnce(() => new Promise(() => undefined));
        const setup = start();
        await tick();
        const prompts = (askMailCode as jest.Mock).mock.calls[0][2];
        expect(prompts.aborted).toBe(false);
        run.abort();
        expect(prompts.aborted).toBe(true);
        await expect(setup).rejects.toBe("abort");
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
        expect(recovery).toHaveBeenCalledWith("R-TEST", "76561198000000001", "/fake/backup.json");
        expect(await outcome).toEqual(new Error("closed"));
        // Шаги отменённого запуска не показываются в следующем мастере
        expect(application.sendToMain).not.toHaveBeenCalled();
        expect((askSmsCode as jest.Mock).mock.calls[0][2].aborted).toBe(true);
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
        await expect(start()).resolves.toMatchObject({ accountName: "fake", maFile: { revocation_code: "R-TEST", shared_secret: mockRaw.shared_secret } });
        // Повторы внутри finalize проверяют эту же отмену
        expect((finalizeAddAuthenticator as jest.Mock).mock.calls[0][0].signal.aborted).toBe(true);
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

// V62 (рецензия SDA-63)
describe("the sign-in phase ends before the enrollment", () => {
    it("remote approval closes the email prompt, and the stale prompt cannot stop the enrollment", async () => {
        let closePrompt!: (err: unknown) => void;
        mockSteam.start = jest.fn(async () => ({ actionRequired: true, validActions: [{ type: 2 }, { type: 5 }] }));
        (askMailCode as jest.Mock).mockImplementationOnce(() => new Promise((_resolve, reject) => { closePrompt = reject; }));
        (finalizeAddAuthenticator as jest.Mock).mockImplementationOnce(async () => { closePrompt(new Error("stale prompt closed")); await tick(); });
        const setup = start();
        await tick();
        mockSteam.session.emit("authenticated");
        expect((askMailCode as jest.Mock).mock.calls[0][2].aborted).toBe(true);
        for (const event of ["authenticated", "timeout"]) expect(mockSteam.session.listenerCount(event)).toBe(0);
        // Поздняя ошибка опроса не бросается и ничего не отклоняет
        mockSteam.session.emit("error", new Error("late poll"));
        await expect(setup).resolves.toMatchObject({ maFile: { revocation_code: "R-TEST" } });
        expect(mockSteam.enableTwoFactor).toHaveBeenCalledTimes(1);
    });
    it("a code answered after the approval is not submitted", async () => {
        let answer!: (code: string) => void;
        mockSteam.start = jest.fn(async () => ({ actionRequired: true, validActions: [{ type: 2 }, { type: 5 }] }));
        (askMailCode as jest.Mock).mockImplementationOnce(() => new Promise(resolve => { answer = resolve; }));
        const setup = start();
        await tick();
        mockSteam.session.emit("authenticated");
        answer("ABCDE");
        await setup;
        expect(mockSteam.session.submitSteamGuardCode).not.toHaveBeenCalled();
    });
    it("a polling timeout closes the email prompt", async () => {
        mockSteam.start = jest.fn(async () => ({ actionRequired: true, validActions: [{ type: 2 }, { type: 5 }] }));
        (askMailCode as jest.Mock).mockImplementationOnce(() => new Promise(() => undefined));
        const setup = start();
        await tick();
        mockSteam.session.emit("timeout");
        await expect(setup).rejects.toThrow("timed out");
        expect((askMailCode as jest.Mock).mock.calls[0][2].aborted).toBe(true);
    });
});

it("a token the library refuses ends the wizard before the enrollment request", async () => {
    mockSteam.setToken = () => { throw new Error("Provided token is expired"); };
    // Как в библиотеке: ответ приходит из колбэка запроса, и исключение в нём никто не ловит
    mockSteam.loggedIn = jest.fn((cb: Function) => { setImmediate(() => cb(null, true, false)); });
    const err = await start().catch(err => err);
    expect(err).toEqual(new Error("Provided token is expired"));
    expect(isUnknownOutcome(err)).toBe(false);
    expect(mockSteam.enableTwoFactor).not.toHaveBeenCalled();
});

it("the connected account is returned at once, without waiting for its profile", async () => {
    await expect(start()).resolves.toMatchObject({
        secondary: { nickname: "", level: null, ktState: null, tpState: null, tradeState: null, registeredAt: null },
    });
});

describe("a lost answer to AddAuthenticator", () => {
    const answerWith = (err: unknown) => { mockSteam.enableTwoFactor = jest.fn((cb: Function) => { setImmediate(() => cb(err)); }); };
    it.each([["kept", false], ["after Abort", true]])("is an unknown outcome: %s", async (_name, abort) => {
        answerWith(Object.assign(new Error("socket hang up"), { code: "ECONNRESET" }));
        const outcome = start().catch(err => err);
        if (abort) { while (!mockSteam.enableTwoFactor.mock.calls.length) await tick(); run.abort(); }
        const err = await outcome;
        expect(isUnknownOutcome(err)).toBe(true);
        expect(err.message).toBe("socket hang up");
        expect(savePendingAuthenticator).not.toHaveBeenCalled();
    });
    it.each([
        ["Steam refused", Object.assign(new Error("Error 29"), { eresult: 29 })],
        ["the tunnel was not built", new Error("tunneling socket could not be established, cause=Proxy connection timed out")],
    ])("is not one when %s", async (_name, cause) => {
        answerWith(cause);
        expect(isUnknownOutcome(await start().catch(err => err))).toBe(false);
    });
    it("is not one when the library sent nothing", async () => {
        mockSteam.enableTwoFactor = jest.fn((cb: Function) => cb(new Error("No mobile access token available")));
        expect(isUnknownOutcome(await start().catch(err => err))).toBe(false);
    });
});

// V62b (вторая рецензия)
describe("persistence does not depend on the window", () => {
    it("the pending file is written before anything is sent", async () => {
        (application.sendToMain as jest.Mock).mockClear();
        (savePendingAuthenticator as jest.Mock).mockImplementationOnce(() => {
            const steps = (application.sendToMain as jest.Mock).mock.calls.map(([, step]) => step);
            expect(steps).toEqual(["loginByPassword"]);
            expect(recovery).not.toHaveBeenCalled();
            return "/fake/backup.json";
        });
        await start();
        expect(savePendingAuthenticator).toHaveBeenCalledTimes(1);
    });
    it("a window that throws on every send loses neither the secrets nor the account", async () => {
        const send = application.sendToMain as jest.Mock;
        send.mockImplementation(() => { throw new Error("Object has been destroyed"); });
        recovery.mockImplementation(() => { throw new Error("Object has been destroyed"); });
        try {
            await expect(start()).resolves.toMatchObject({ maFile: { revocation_code: "R-TEST" } });
        } finally { send.mockReset(); }
        expect(savePendingAuthenticator).toHaveBeenCalledWith("fake", mockRaw, "76561198000000001");
    });
    it.each(["shared_secret", "identity_secret", "revocation_code"])("an answer without %s is written as it came and never finalized", async field => {
        for (const value of [undefined, ""]) {
            (savePendingAuthenticator as jest.Mock).mockClear();
            const incomplete = { ...mockRaw, [field]: value };
            mockSteam.enableTwoFactor = jest.fn((cb: Function) => cb(null, incomplete));
            await expect(start()).rejects.toThrow(/incomplete set of secrets.*not been enabled/);
            expect(savePendingAuthenticator).toHaveBeenCalledWith("fake", incomplete, "76561198000000001");
        }
        expect(recovery).toHaveBeenCalled();
        expect(askSmsCode).not.toHaveBeenCalled();
        expect(finalizeAddAuthenticator).not.toHaveBeenCalled();
    });
});

describe("a Finalize that gets no answer", () => {
    const wait = GUARD_DEADLINES.finalizeMs;
    let answer: { resolve: () => void, reject: (err: unknown) => void };
    beforeEach(() => {
        GUARD_DEADLINES.finalizeMs = 20;
        (finalizeAddAuthenticator as jest.Mock).mockImplementationOnce(() => new Promise<void>((resolve, reject) => { answer = { resolve, reject }; }));
    });
    afterEach(() => { GUARD_DEADLINES.finalizeMs = wait; });

    it("the default wait is three minutes", () => expect(wait).toBe(180_000));

    it.each([["", false], [" after an abort", true]])("ends the wizard%s, refuses a second enrollment meanwhile, and keeps a late success", async (_name, abort) => {
        const setup = start();
        if (abort) { while (!answer || !(finalizeAddAuthenticator as jest.Mock).mock.calls.length) await tick(); run.abort(); }
        const err = await setup.catch(err => err);
        expect(isUnknownOutcome(err)).toBe(true);
        // Новых запросов не будет, но отправленный не оборван
        expect((finalizeAddAuthenticator as jest.Mock).mock.calls[0][0].signal.aborted).toBe(true);

        mockSteam.start.mockClear();
        run = new AbortController();
        await expect(setupGuard({ accountName: " FAKE ", password: "fake" }, null, recovery, run.signal)).rejects.toThrow(/not finished yet/);
        expect(mockSteam.start).not.toHaveBeenCalled();
        expect(mockSteam.enableTwoFactor).toHaveBeenCalledTimes(1);

        answer.resolve();
        await expect(err.late).resolves.toMatchObject({ accountName: "fake", maFile: { revocation_code: "R-TEST", fully_enrolled: true } });
        await expect(start()).resolves.toBeTruthy();
    });

    it("a late wrong-code answer asks nothing and shows no step; the account can be tried again", async () => {
        const err = await start().catch(err => err);
        run.abort();
        (application.sendToMain as jest.Mock).mockClear();
        (askSmsCode as jest.Mock).mockClear();
        (askSmsCode as jest.Mock).mockImplementationOnce(async (_id, _name, signal) => { if (signal.aborted) throw new Error("closed"); return "12345"; });
        answer.reject(new Error("Invalid activation code"));
        await expect(err.late).rejects.toThrow("closed");
        expect(application.sendToMain).not.toHaveBeenCalled();
        expect(finalizeAddAuthenticator).toHaveBeenCalledTimes(1);
        run = new AbortController();
        await expect(start()).resolves.toBeTruthy();
    });

    it("an answer in time leaves no timer behind", async () => {
        const setup = start();
        while (!(finalizeAddAuthenticator as jest.Mock).mock.calls.length) await tick();
        answer.resolve();
        await expect(setup).resolves.toBeTruthy();
        await new Promise(resolve => setTimeout(resolve, 40));
        expect((finalizeAddAuthenticator as jest.Mock).mock.calls[0][0].signal.aborted).toBe(false);
    });
});

it("two runs of one account that meet at the enrollment request send it once", async () => {
    (askSmsCode as jest.Mock).mockReset();
    (askSmsCode as jest.Mock).mockImplementation(() => new Promise((_resolve, reject) => run.signal.addEventListener("abort", () => reject(new Error("closed")))));
    const checks: Function[] = [];
    mockSteam.loggedIn = jest.fn((cb: Function) => { checks.push(cb); });
    const first = start().catch(err => err);
    const second = start().catch(err => err);
    while (checks.length < 2) await tick();
    checks[0](null, true, false);
    checks[1](null, true, false);
    expect((await second).message).toMatch(/not finished yet/);
    expect(mockSteam.enableTwoFactor).toHaveBeenCalledTimes(1);
    await tick();
    run.abort();
    expect(await first).toEqual(new Error("closed"));
});
