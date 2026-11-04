const mockOrder: string[] = [];
const mockRaw = { status: 1, revocation_code: "R-TEST", shared_secret: "test", server_time: "1" };
jest.mock("steam-session", () => {
    const { EventEmitter } = require("events");
    return {
        EAuthTokenPlatformType: { MobileApp: 2 }, EAuthSessionGuardType: {},
        LoginSession: class extends EventEmitter {
            accessToken = "fake-access";
            refreshToken = "fake-refresh";
            steamID = { getSteamID64: () => "76561198000000001", toString: () => "76561198000000001" };
            async startWithCredentials() {
                queueMicrotask(() => this.emit("authenticated"));
                return { actionRequired: false };
            }
        }
    };
});
jest.mock("steamcommunity", () => Object.assign(jest.fn(() => ({
    loggedIn: (cb: Function) => cb(null, true, false),
    setMobileAppAccessToken: jest.fn(),
    enableTwoFactor: (cb: Function) => cb(null, mockRaw)
})), { EResult: { OK: 1 } }));
jest.mock("../../../application/application", () => ({ __esModule: true, default: { sendToMain: jest.fn() } }));
jest.mock("../../../application/trustedIpc", () => ({ onTrusted: jest.fn() }));
jest.mock("../../Functions/applyCommunityCookies", () => ({ __esModule: true, default: jest.fn().mockResolvedValue(undefined) }));
jest.mock("../../Functions/savePendingAuthenticator", () => ({
    __esModule: true, default: jest.fn(() => { mockOrder.push("backup"); return "/fake/backup.json"; })
}));
jest.mock("../../../application/askInfo/askSmsCode", () => ({
    __esModule: true, default: jest.fn(async () => { mockOrder.push("prompt"); return "fake-code"; })
}));
jest.mock("../../Functions/finalizeAddAuthenticator", () => ({
    __esModule: true, default: jest.fn(async () => { mockOrder.push("finalize"); })
}));
jest.mock("../loadSteamAccountData", () => ({ getSecondaries: jest.fn().mockResolvedValue({}) }));
import nock from "nock";
import net from "net";
import setupGuard from "../setupGuard";
import savePendingAuthenticator from "../../Functions/savePendingAuthenticator";
import askSmsCode from "../../../application/askInfo/askSmsCode";

beforeEach(() => { mockOrder.length = 0; nock.disableNetConnect(); });
afterEach(() => { jest.restoreAllMocks(); nock.enableNetConnect(); });
it("R2 N4 Guard writes the pending backup before publishing recovery or asking for activation", async () => {
    const connect = jest.spyOn(net.Socket.prototype, "connect").mockImplementation(() => { throw new Error("unexpected socket"); });
    const recovery = jest.fn(() => { mockOrder.push("recovery"); });
    await setupGuard({ accountName: "fake", password: "fake" }, null, recovery);
    expect(savePendingAuthenticator).toHaveBeenCalledWith("fake", mockRaw, "76561198000000001");
    expect(recovery).toHaveBeenCalledWith("R-TEST", "76561198000000001");
    expect(mockOrder).toEqual(["backup", "recovery", "prompt", "finalize"]);
    expect(connect).not.toHaveBeenCalled();
});
it("R2 N4 recovery remains published when activation fails after the backup", async () => {
    (askSmsCode as jest.Mock).mockRejectedValueOnce(new Error("activation failed"));
    const recovery = jest.fn(() => { mockOrder.push("recovery"); });
    await expect(setupGuard({ accountName: "fake", password: "fake" }, null, recovery)).rejects.toThrow("activation failed");
    expect(mockOrder).toEqual(["backup", "recovery"]);
    expect(recovery).toHaveBeenCalledWith("R-TEST", "76561198000000001");
});
