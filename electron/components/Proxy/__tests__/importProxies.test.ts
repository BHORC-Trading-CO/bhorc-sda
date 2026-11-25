// SDA-64: импорт списка прокси. Разбор и подсчёт — в main, после сохранения; пароль с ":" и "@" не режется.
jest.mock("../../application/application", () => ({ __esModule: true, default: { sendToMain: jest.fn() } }));
const mockHandlers: Record<string, Function> = {};
jest.mock("../../application/trustedIpc", () => ({ onTrusted: (channel: string, handler: Function) => { mockHandlers[channel] = handler; } }));

import parseProxyString, { formatProxyString, parseProxy } from "../../Functions/parseProxyString";
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
    const read = (username: string, password: string, host: string, port: string) => ({ proxy: { username, password, host, port } });
    it.each([
        ["user:pass@1.1.1.1:7777", read("user", "pass", "1.1.1.1", "7777")],
        ["user:pass@gateway.test:80", read("user", "pass", "gateway.test", "80")],
        ["user:pass@intranet:80", read("user", "pass", "intranet", "80")],
        ["user:p:a:ss@1.1.1.1:7777", read("user", "p:a:ss", "1.1.1.1", "7777")],
        ["user:p@ss@1.1.1.1:7777", read("user", "p@ss", "1.1.1.1", "7777")],
        ["user:1234@1.1.1.1:7777", read("user", "1234", "1.1.1.1", "7777")],
        ["user:pa ss@[::1]:7777", read("user", "pa ss", "[::1]", "7777")],
        ["1.1.1.1:7777:user:pass", read("user", "pass", "1.1.1.1", "7777")],
        ["gate.test:7777:user:p:a@s/s", read("user", "p:a@s/s", "gate.test", "7777")],
        ["[2001:db8::1]:7777:user:pass", read("user", "pass", "[2001:db8::1]", "7777")],
        ["1.1.1.1:7777:user.name:1234", read("user.name", "1234", "1.1.1.1", "7777")],
        ["1.1.1.1:7777", read("", "", "1.1.1.1", "7777")],
        ["gate.test:7777", read("", "", "gate.test", "7777")],
        ["http://user:pass@gateway.test:8080", read("user", "pass", "gateway.test", "8080")],
        ["HTTPS://user:pass@gateway.test:8080/", read("user", "pass", "gateway.test", "8080")],
        ["http://user:p%40s%3As@1.1.1.1:80", read("user", "p@s:s", "1.1.1.1", "80")],
        ["http://user:p@s:s@1.1.1.1:80", read("user", "p@s:s", "1.1.1.1", "80")],
        ["http://user:@1.1.1.1:80", read("user", "", "1.1.1.1", "80")],
        ["http://[::1]:80", read("", "", "[::1]", "80")],
    ])("reads %s", (value, expected) => {
        expect(parseProxy(value)).toEqual(expected);
        expect(parseProxyString(value)).toEqual(expected.proxy);
    });
    it.each([
        ["socks5://user:pass@1.1.1.1:1080", "scheme"], ["socks4://1.1.1.1:1080", "scheme"], ["ftp://1.1.1.1:21", "scheme"],
        ["", "format"], ["user", "format"], ["user:pass", "format"], ["user:1234", "format"], ["user@1.1.1.1:80", "format"], [":pass@1.1.1.1:80", "format"],
        ["user:@1.1.1.1:80", "format"], ["1.1.1.1:80:user", "format"], ["1.1.1.1", "format"], ["http://user@1.1.1.1:80", "format"], ["http://user:100%@1.1.1.1:80", "format"],
        ["user:pass:1.1.1.1:8080", "format"],
        ["user:pass@", "address"], ["user:pass@host", "address"], ["user:pass@host:port", "address"], ["user:pass@host:70000", "address"], ["user:pass@::1:80", "address"],
        ["user:pass@http=proxy.test:80", "address"], ["user:pass@a;b:80", "address"], ["http://user:pass@1.1.1.1", "address"], ["http://u:p@1.1.1.1:80/path", "address"],
        // Читается двояко: сохранить можно было бы не тот адрес и не тот пароль.
        ["1.1.1.1:80:user:pass@2.2.2.2:90", "ambiguous"], ["my.login:1234:x@gate.test:80", "ambiguous"], ["1.1.1.1:8080:user@mail.test:1234", "ambiguous"],
        ["1.1.1.1:8080:2.2.2.2:9090", "ambiguous"], ["user.name:1234:1.1.1.1:8080", "ambiguous"], ["a.test:80:b.test:90", "ambiguous"],
    ])("does not guess %s: %s", (value, reason) => {
        expect(parseProxy(value)).toEqual({ reason });
        expect(parseProxyString(value)).toEqual({ username: "", password: "", host: "", port: "" });
    });
    it.each([
        ["user", "pass", "1.1.1.1"], ["user", "p:a@s/s %", "gate.test"], ["", "", "[::1]"], ["user", "", "gate.test"], ["", "pass", "gate.test"],
        ["us:er", "pass", "gate.test"], ["my.login", "1234:x", "gate.test"], [" user", "pass ", "gate.test"], ["1.1.1.1", "80:u:p", "2.2.2.2"],
    ])("formatProxyString(%s, %s, %s) reads back as the same proxy", (username, password, host) => {
        const setup = { username, password, host, port: "8080" };
        expect(parseProxy(formatProxyString(setup))).toEqual({ proxy: setup });
    });
    it("keeps the usual form where it is unambiguous", () => {
        expect(formatProxyString({ username: "u", password: "p@:x", host: "1.1.1.1", port: "80" })).toBe("u:p@:x@1.1.1.1:80");
    });
});

it("stores the whole password, delimiters included", () => {
    expect(importText("user:p:a@s/s%@1.1.1.1:7777")).toEqual({ requestId: "r1", added: 1, duplicates: 0, rejected: [] });
    expect(stored()).toEqual([{ host: "1.1.1.1", port: "7777", username: "user", password: "p:a@s/s%" }]);
});

it("counts after persistence and returns the rejected lines with the reason", () => {
    expect(importText("good:pass@1.1.1.1:7777\r\n\n  bad:pass@2.2.2.2:port  \nsocks5://u:p@3.3.3.3:80\n1.1.1.1:80:a:b@2.2.2.2:90\ntext\ngood:pass@1.1.1.1:7777")).toEqual({
        requestId: "r1", added: 1, duplicates: 1,
        rejected: [
            { line: "bad:pass@2.2.2.2:port", reason: "address" },
            { line: "socks5://u:p@3.3.3.3:80", reason: "scheme" },
            { line: "1.1.1.1:80:a:b@2.2.2.2:90", reason: "ambiguous" },
            { line: "text", reason: "format" },
        ],
    });
    expect(stored()).toHaveLength(1);
    expect(proxyManager.objects).toHaveLength(1);
});

it("one gateway with different logins or passwords is several proxies; only the same one is a duplicate", () => {
    expect(importText("u1:p@gate.test:80\nu2:p@gate.test:80\nu2:other@gate.test:80\nhttp://u1:p@GATE.test:80\ngate.test:80:u2:p\ngate.test:80"))
        .toEqual({ requestId: "r1", added: 4, duplicates: 2, rejected: [] });
    expect(stored().map(({ username, password }) => `${username}:${password}`)).toEqual(["u1:p", "u2:p", "u2:other", ":"]);
    expect(importText("u2:p@gate.test:80")).toMatchObject({ added: 0, duplicates: 1 });
});

it("a line that could not be saved is neither counted nor left in the table", () => {
    jest.spyOn(ProxyStorage, "Save").mockImplementationOnce(() => { throw new Error("disk"); });
    expect(importText("a:b@1.1.1.1:1\nc:d@2.2.2.2:2")).toMatchObject({ added: 1, rejected: [{ line: "a:b@1.1.1.1:1", reason: "storage" }] });
    expect(proxyManager.objects.map(p => p.params.host)).toEqual(["2.2.2.2"]);
});

it("an archived proxy does not block adding the same address again", () => {
    importText("a:b@1.1.1.1:1");
    proxyManager.edit(proxyManager.objects[0].params.id, { deleted: true });
    expect(importText("a:b@1.1.1.1:1")).toMatchObject({ added: 1, duplicates: 0 });
    expect(importText("a:b@1.1.1.1:1")).toMatchObject({ added: 0, duplicates: 1 });
});
