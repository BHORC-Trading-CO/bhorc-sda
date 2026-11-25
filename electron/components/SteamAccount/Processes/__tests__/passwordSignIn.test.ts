// Вход по паролю мастеров на настоящей библиотеке steam-session: подменён только её транспорт (SDA-63).
import { EAuthSessionGuardType, EAuthTokenPlatformType, LoginSession } from "steam-session";
import passwordSignIn from "../passwordSignIn";
import { setMainLanguage } from "../../../../i18n";

const ID = "76561198000000001";
const jwt = (aud: string[]) => `e30.${Buffer.from(JSON.stringify({ sub: ID, aud, exp: 4102444800 })).toString("base64url")}.c2ln`;
const tick = () => new Promise(setImmediate);
let handler: Record<string, jest.Mock>;
let session: LoginSession;
const confirmations = (...types: number[]) => types.map(type => ({ type }));
const signIn = (challenge: any = jest.fn(), signal?: AbortSignal) =>
    passwordSignIn(session, { accountName: "fake", password: "fake", steamGuardCode: "TOTP1" }, challenge, signal);

beforeAll(() => setMainLanguage("en"));
beforeEach(() => {
    session = new LoginSession(EAuthTokenPlatformType.MobileApp);
    handler = {
        encryptPassword: jest.fn().mockResolvedValue({}),
        startSessionWithCredentials: jest.fn().mockResolvedValue({ steamId: ID, clientId: "1", pollInterval: 0.01, allowedConfirmations: confirmations(EAuthSessionGuardType.DeviceCode) }),
        submitSteamGuardCode: jest.fn().mockResolvedValue(undefined),
        pollLoginStatus: jest.fn().mockResolvedValue({ accessToken: jwt(["web", "mobile"]), refreshToken: jwt(["web", "derive", "mobile"]), accountName: "fake" }),
        close: jest.fn(),
    };
    (session as any)._handler = handler;
});
const allow = (...types: number[]) => handler.startSessionWithCredentials.mockResolvedValue({ steamId: ID, clientId: "1", pollInterval: 0.01, allowedConfirmations: confirmations(...types) });

it("an accepted Guard code is reported as accepted", async () => {
    await expect(signIn()).resolves.toEqual({ guardCodeAccepted: true });
    expect(session.accessToken).toBeTruthy();
});

it("a login without a code, and a code from the mail, are not", async () => {
    allow(EAuthSessionGuardType.None);
    await expect(signIn()).resolves.toEqual({ guardCodeAccepted: false });

    session = new LoginSession(EAuthTokenPlatformType.MobileApp);
    (session as any)._handler = handler;
    allow(EAuthSessionGuardType.EmailCode);
    handler.submitSteamGuardCode.mockImplementation(async ({ authCode }) => { if (authCode === "TOTP1") throw Object.assign(new Error("InvalidLoginAuthCode"), { eresult: 65 }); });
    await expect(signIn(async () => { await session.submitSteamGuardCode("MAIL1"); })).resolves.toEqual({ guardCodeAccepted: false });
});

it("remote approval settles the login once: prompts closed, listeners gone, a late error is harmless", async () => {
    allow(EAuthSessionGuardType.EmailCode, EAuthSessionGuardType.EmailConfirmation);
    handler.submitSteamGuardCode.mockRejectedValue(Object.assign(new Error("InvalidLoginAuthCode"), { eresult: 65 }));
    let prompts!: AbortSignal;
    let closePrompt!: (err: Error) => void;
    await signIn((_actions: unknown, signal: AbortSignal) => {
        prompts = signal;
        return new Promise((_resolve, reject) => { closePrompt = reject; });
    });
    expect(prompts.aborted).toBe(true);
    closePrompt(new Error("stale"));
    await tick();
    expect(["authenticated", "timeout"].map(event => session.listenerCount(event))).toEqual([0, 0]);
    expect(() => session.emit("error", new Error("late"))).not.toThrow();
});

it.each([
    ["a poll error", () => handler.pollLoginStatus.mockRejectedValue(new Error("proxy failed")), "proxy failed"],
    ["the polling deadline", () => { session.loginTimeout = 1; handler.pollLoginStatus.mockResolvedValue({}); }, "timed out"],
    ["a failed start", () => handler.startSessionWithCredentials.mockRejectedValue(new Error("InvalidPassword")), "InvalidPassword"],
])("%s rejects", async (_name, arrange, message) => {
    arrange();
    await expect(signIn()).rejects.toThrow(message);
});

it("an abort before Steam answers stops the polling the library starts anyway", async () => {
    const run = new AbortController();
    let answer!: (value: unknown) => void;
    handler.startSessionWithCredentials.mockImplementation(() => new Promise(resolve => { answer = resolve; }));
    const login = signIn(jest.fn(), run.signal);
    await tick();
    run.abort();
    await expect(login).rejects.toBe("abort");
    answer({ steamId: ID, clientId: "1", pollInterval: 0.01, allowedConfirmations: confirmations(EAuthSessionGuardType.None) });
    await tick(); await tick();
    expect(handler.pollLoginStatus).not.toHaveBeenCalled();
});

it("an abort while Steam is polled stops the polling", async () => {
    const run = new AbortController();
    allow(EAuthSessionGuardType.None);
    handler.pollLoginStatus.mockResolvedValue({});
    const login = signIn(jest.fn(), run.signal);
    while (!handler.pollLoginStatus.mock.calls.length) await tick();
    run.abort();
    await expect(login).rejects.toBe("abort");
    const polls = handler.pollLoginStatus.mock.calls.length;
    await new Promise(resolve => setTimeout(resolve, 60));
    expect(handler.pollLoginStatus).toHaveBeenCalledTimes(polls);
});
