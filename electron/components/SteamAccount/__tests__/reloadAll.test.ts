// SDA-59: «Перезагрузить все данные» входила во все аккаунты, включая архивные, и просроченный
// refresh-токен скрытого архивного аккаунта давал «Error: AccessDenied». Main-сторона: архивные
// аккаунты не ходят в Steam, мёртвый токен даёт понятную ошибку, обновление данных ждёт входа.
jest.mock("../../application/application", () => ({ __esModule: true, default: {
    sendToMain: jest.fn(), images: { invalidateRoute: jest.fn(), pruneOrphans: jest.fn().mockResolvedValue(undefined), removeAccount: jest.fn().mockResolvedValue(undefined) }
} }));
const mockGetAccountData = jest.fn();
jest.mock("../Processes/loadSteamAccountData", () => ({
    __esModule: true,
    getAccountData: (...args: unknown[]) => mockGetAccountData(...args),
    getChangableSecondaries: jest.fn(),
}));

import SteamAccountStorage from "../../newStorage/SteamAccountStorage";
import LinksStorage from "../../newStorage/LinksStorage";
import proxyManager from "../../Proxy/proxyManager";
import SteamAccount from "../SteamAccount";
import steamAccountManager from "../steamAccountManager";
import editListener from "../Listeners/steamAccountEditListener";
import application from "../../application/application";
import SteamAccountChannels from "../../../interfaces/IpcChannels/SteamAccountChannels";
import { isDeadTokenError, isRefreshTokenExpired, refreshTokenExpiresAt } from "../Functions/sessionExpiry";
import { setMainLanguage } from "../../../i18n";

const DAY = 24 * 60 * 60 * 1000;
// Неподписанный JWT с нужным exp: подпись не проверяется ни нами, ни steam-session
const REFRESH_AUD = ["web", "renew", "derive", "mobile"];
const jwt = (expMs: number, aud: string[] = REFRESH_AUD) =>
    `eyJhbGciOiJFZERTQSJ9.${Buffer.from(JSON.stringify({ sub: "76561190000000000", aud, exp: Math.floor(expMs / 1000) })).toString("base64url")}.c2ln`;

const params = (id: string, extra: Record<string, unknown> = {}) => ({
    id, number: 1, accountName: "fixture", password: "x", deleted: false,
    maFile: { shared_secret: "c2VjcmV0", Session: { AccessToken: jwt(Date.now() + DAY, ["web", "mobile"]), RefreshToken: jwt(Date.now() + 100 * DAY), SteamID: "76561190000000000", SessionID: "" } },
    secondary: { nickname: "n", level: 1, avatarUrl: "", ktState: null, tpState: null, tradeState: null },
    changableSecondary: { steam: { balance: 0, currency: "$", error: null } },
    ...extra,
} as any);

function save(id: string, extra: Record<string, unknown> = {}) {
    SteamAccountStorage.Save(id, params(id, extra));
    const stored = LinksStorage.Get();
    LinksStorage.Save({ ...stored, steamAccounts: { ...stored.steamAccounts, [id]: null } });
}

beforeAll(() => setMainLanguage("en"));
beforeEach(() => {
    new (require("electron-store"))().clear();
    LinksStorage.Save({ steamAccounts: {}, profiles: {}, groups: {} });
    proxyManager.objects = [];
    steamAccountManager.objects = [];
    (application.sendToMain as jest.Mock).mockClear();
    mockGetAccountData.mockReset();
});
afterEach(() => jest.restoreAllMocks());

describe("refresh token expiry", () => {
    it("reads exp from the JWT and treats a past exp as expired", () => {
        const exp = Date.UTC(2026, 9, 21);
        expect(refreshTokenExpiresAt(jwt(exp))).toBe(exp);
        expect(isRefreshTokenExpired(jwt(exp), exp + 1000)).toBe(true);
        expect(isRefreshTokenExpired(jwt(exp), exp - DAY)).toBe(false);
    });

    it("does not judge a token it cannot read: Steam decides", () => {
        for (const token of [undefined, null, "", "not-a-jwt", "a.b.c", "a.e30.c"]) {
            expect(refreshTokenExpiresAt(token)).toBeNull();
            expect(isRefreshTokenExpired(token)).toBe(false);
        }
    });

    it("recognises the Steam answers for a dead token", () => {
        const eresult = (code: number) => Object.assign(new Error("x"), { eresult: code });
        expect(isDeadTokenError(new Error("AccessDenied"))).toBe(true);
        expect(isDeadTokenError(eresult(15))).toBe(true);
        expect(isDeadTokenError(eresult(26))).toBe(true);
        expect(isDeadTokenError(eresult(27))).toBe(true);
        expect(isDeadTokenError(eresult(84))).toBe(false); // RateLimitExceeded — не про токен
        expect(isDeadTokenError(new Error("ETIMEDOUT"))).toBe(false);
        expect(isDeadTokenError("AccessDenied")).toBe(false);
    });
});

describe("session start", () => {
    it("an expired refresh token is not sent to Steam and gives a clear error", async () => {
        const account = new SteamAccount(params("a1", {
            maFile: { ...params("a1").maFile, Session: { ...params("a1").maFile.Session, RefreshToken: jwt(Date.now() - DAY) } },
        }));
        const refresh = jest.spyOn(account.session, "refreshAccessToken");
        await expect(account.initSession()).rejects.toThrow(/session has expired/);
        expect(refresh).not.toHaveBeenCalled();
    });

    it("AccessDenied from Steam (revoked token) gives the same clear error; other errors pass through", async () => {
        const account = new SteamAccount(params("a1"));
        jest.spyOn(account.session, "refreshAccessToken").mockRejectedValueOnce(new Error("AccessDenied"));
        await expect(account.initSession()).rejects.toThrow(/session has expired/);
        jest.spyOn(account.session, "refreshAccessToken").mockRejectedValueOnce(new Error("ETIMEDOUT"));
        await expect(account.initSession()).rejects.toThrow("ETIMEDOUT");
    });

    it("an archived account does not start a session", async () => {
        const account = new SteamAccount(params("a1", { deleted: true }));
        const init = jest.spyOn(account, "initSession");
        await account.startSession();
        expect(init).not.toHaveBeenCalled();
    });

    it("reload starts sessions for active accounts only", async () => {
        save("active");
        save("archived", { deleted: true });
        const init = jest.spyOn(SteamAccount.prototype, "initSession").mockResolvedValue(undefined);
        await steamAccountManager.load();
        expect(init.mock.instances.map((account: any) => account.params.id)).toEqual(["active"]);
        expect(application.sendToMain).not.toHaveBeenCalledWith(SteamAccountChannels.STEAM_ACCOUNT_REFRESH_SESSION_ERROR, expect.anything());
    });

    it("restoring from the archive starts the session; archiving does not", async () => {
        save("a1", { deleted: true });
        const init = jest.spyOn(SteamAccount.prototype, "initSession").mockRejectedValue(new Error("session has expired"));
        await steamAccountManager.load();
        expect(init).not.toHaveBeenCalled();
        const event = { reply: jest.fn() } as unknown as Electron.IpcMainEvent;
        await editListener(event, { id: "a1", steamAccountParams: { deleted: false } });
        await new Promise((resolve) => setImmediate(resolve));
        expect(init).toHaveBeenCalledTimes(1);
        expect(application.sendToMain).toHaveBeenCalledWith(SteamAccountChannels.STEAM_ACCOUNT_REFRESH_SESSION_ERROR,
            { id: "a1", err: "session has expired" });
        await editListener(event, { id: "a1", steamAccountParams: { deleted: true } });
        await editListener(event, { id: "a1", steamAccountParams: { profileName: "edited" } });
        expect(init).toHaveBeenCalledTimes(1);
    });
});

describe("data refresh waits for the session", () => {
    it("profile data is requested only after the session start has finished", async () => {
        const account = new SteamAccount(params("a1"));
        let finish!: (err?: Error) => void;
        jest.spyOn(account, "initSession").mockImplementation(() => new Promise<void>((resolve, reject) => {
            finish = (err) => err ? reject(err) : resolve();
        }));
        jest.spyOn(account, "editParams").mockImplementation(() => undefined);
        const data = { secondary: {}, changableSecondary: {} };
        mockGetAccountData.mockResolvedValue(data);

        account.startSession().catch(() => undefined);
        const refreshed = account.getSecondary();
        await new Promise((resolve) => setImmediate(resolve));
        expect(mockGetAccountData).not.toHaveBeenCalled();
        finish();
        await expect(refreshed).resolves.toBe(data);
        expect(mockGetAccountData).toHaveBeenCalledTimes(1);
    });

    // SDA-61: без cookie запросы дали бы вторую, непонятную ошибку вместо причины
    it("a failed session start without cookies fails the refresh with the login error", async () => {
        const account = new SteamAccount(params("a1"));
        jest.spyOn(account, "initSession").mockRejectedValue(new Error("proxy down"));
        account.startSession().catch(() => undefined);
        await expect(account.getSecondary()).rejects.toThrow("proxy down");
        expect(mockGetAccountData).not.toHaveBeenCalled();
    });

    it("a failed session start with cookies of an earlier login still tries", async () => {
        const account = new SteamAccount(params("a1"));
        jest.spyOn(account, "initSession").mockRejectedValue(new Error("proxy down"));
        jest.spyOn(account, "editParams").mockImplementation(() => undefined);
        (account.community as any).steamID = { accountid: 1 };
        mockGetAccountData.mockResolvedValue({ secondary: {}, changableSecondary: {} });
        account.startSession().catch(() => undefined);
        await account.getSecondary();
        expect(mockGetAccountData).toHaveBeenCalledTimes(1);
    });
});
