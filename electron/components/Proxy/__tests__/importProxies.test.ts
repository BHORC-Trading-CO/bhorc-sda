// SDA-64: импорт списка прокси. Разбор и подсчёт — в main, после сохранения; пароль с ":" и "@" не режется.
jest.mock("../../application/application", () => ({ __esModule: true, default: { sendToMain: jest.fn() } }));
const mockHandlers: Record<string, Function> = {};
jest.mock("../../application/trustedIpc", () => ({ onTrusted: (channel: string, handler: Function) => { mockHandlers[channel] = handler; } }));

import parseProxyString from "../../Functions/parseProxyString";
import rendererParser from "../../../../src/pages/Main/tabs/ProxiesTab/components/Funcs/parseProxyString";
import proxiesRouter from "../../application/listenersRouters/proxiesListenersRouter";
import ProxyStorage from "../../newStorage/ProxyStorage";
import LinksStorage from "../../newStorage/LinksStorage";
import proxyManager from "../proxyManager";
import ProxyChannels from "../../../interfaces/IpcChannels/ProxyChannels";

const stored = () => Object.values(ProxyStorage.GetAll()).map(({ host, port, username, password }) => ({ host, port, username, password }));
function importText(text: string) {
    const event = { reply: jest.fn() };
    mockHandlers.NEW_PROXIES(event, { requestId: "r1", text });
    const results = event.reply.mock.calls.filter(([channel]) => channel === ProxyChannels.PROXY_BULK_RESULT);
    expect(event.reply).not.toHaveBeenCalledWith("ERROR", expect.anything());
    expect(results).toHaveLength(1);
    return results[0][1];
}

beforeEach(() => {
    new (require("electron-store"))().clear();
    LinksStorage.Save({ steamAccounts: {}, profiles: {}, groups: {} });
    proxyManager.objects = [];
    proxiesRouter();
});
afterEach(() => jest.restoreAllMocks());

describe("parseProxyString", () => {
    it("is one function for the windows and for main", () => {
        expect(rendererParser).toBe(parseProxyString);
    });
    it.each([
        ["user:pass@1.1.1.1:7777", { username: "user", password: "pass", host: "1.1.1.1", port: "7777" }],
        ["user:p:a:ss@1.1.1.1:7777", { username: "user", password: "p:a:ss", host: "1.1.1.1", port: "7777" }],
        ["user:p@ss@1.1.1.1:7777", { username: "user", password: "p@ss", host: "1.1.1.1", port: "7777" }],
        ["user:pass@[::1]:7777", { username: "user", password: "pass", host: "[::1]", port: "7777" }],
        // Недописанные строки: поле разбирается на каждое нажатие.
        ["", { username: "", password: "", host: "", port: "" }],
        ["user", { username: "user", password: "", host: "", port: "" }],
        ["user:pass", { username: "user", password: "pass", host: "", port: "" }],
        ["user:pass@", { username: "user", password: "pass", host: "", port: "" }],
        ["user:pass@host", { username: "user", password: "pass", host: "host", port: "" }],
    ])("%s", (value, expected) => {
        expect(parseProxyString(value)).toEqual(expected);
    });
});

it("stores the whole password, delimiters included", () => {
    expect(importText("user:p:a@s/s%@1.1.1.1:7777")).toEqual({ requestId: "r1", added: 1, duplicates: 0, rejected: [] });
    expect(stored()).toEqual([{ host: "1.1.1.1", port: "7777", username: "user", password: "p:a@s/s%" }]);
});

it("counts after persistence and returns the rejected lines", () => {
    expect(importText("good:pass@1.1.1.1:7777\r\n\n  bad:pass@2.2.2.2:port  \nno-password@3.3.3.3:80\ngood:pass@1.1.1.1:7777")).toEqual({
        requestId: "r1", added: 1, duplicates: 1,
        rejected: ["bad:pass@2.2.2.2:port", "no-password@3.3.3.3:80"],
    });
    expect(stored()).toHaveLength(1);
    expect(proxyManager.objects).toHaveLength(1);
});

it("a line that could not be saved is neither counted nor left in the table", () => {
    jest.spyOn(ProxyStorage, "Save").mockImplementationOnce(() => { throw new Error("disk"); });
    expect(importText("a:b@1.1.1.1:1\nc:d@2.2.2.2:2")).toMatchObject({ added: 1, rejected: ["a:b@1.1.1.1:1"] });
    expect(proxyManager.objects.map(p => p.params.host)).toEqual(["2.2.2.2"]);
});

it("an archived proxy does not block adding the same address again", () => {
    importText("a:b@1.1.1.1:1");
    proxyManager.edit(proxyManager.objects[0].params.id, { deleted: true });
    expect(importText("a:b@1.1.1.1:1")).toMatchObject({ added: 1, duplicates: 0 });
    expect(importText("a:b@1.1.1.1:1")).toMatchObject({ added: 0, duplicates: 1 });
});
