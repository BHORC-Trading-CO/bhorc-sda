// SDA-64: проверка прокси в main. Каждый запрос получает ровно один ответ TEST_PROXY со своим id.
jest.mock("../../application/application", () => ({ __esModule: true, default: { sendToMain: jest.fn() } }));
const mockHandlers: Record<string, Function> = {};
jest.mock("../../application/trustedIpc", () => ({ onTrusted: (channel: string, handler: Function) => { mockHandlers[channel] = handler; } }));
const mockSend = jest.fn();
jest.mock("../../Request/Request", () => {
    const Real = jest.requireActual("../../Request/Request").default;
    return { __esModule: true, default: class extends Real {
        send(options: unknown) { return mockSend.getMockImplementation() ? mockSend(options) : super.send(options); }
    } };
});

import http from "http";
import { AddressInfo } from "net";
import proxiesRouter from "../../application/listenersRouters/proxiesListenersRouter";
import LinksStorage from "../../newStorage/LinksStorage";
import ProxyStorage from "../../newStorage/ProxyStorage";
import proxyManager from "../proxyManager";
import Proxy from "../Proxy";
import { setMainLanguage } from "../../../i18n";

const setup = { host: "proxy.test", port: "8080", username: "u", password: "p:@/" };
const stored = { id: "p1", number: 1, deleted: false, ...setup };

async function call(channel: string, params: object) {
    const event = { reply: jest.fn() };
    await mockHandlers[channel](event, params);
    return event.reply.mock.calls;
}
const testSaved = (id = "p1") => call("TEST_PROXY", { requestId: "r1", id });
const testForm = (proxy: object) => call("TEST_PROXY_BY_PARAMS", { requestId: "r1", proxy });

beforeEach(() => {
    setMainLanguage("en");
    new (require("electron-store"))().clear();
    LinksStorage.Save({ steamAccounts: {}, profiles: {}, groups: {} });
    ProxyStorage.Save("p1", { ...stored });
    proxyManager.objects = [new Proxy({ ...stored })];
    mockSend.mockReset();
    proxiesRouter();
});

it.each([403, 429, 503])("Steam answered %i: one terminal reply with the code, no ERROR", async statusCode => {
    mockSend.mockResolvedValue({ response: { statusCode } });
    expect(await testSaved()).toEqual([["TEST_PROXY", { requestId: "r1", id: "p1", tested: setup, ok: false, statusCode }]]);
    expect(await testForm(setup)).toEqual([["TEST_PROXY", { requestId: "r1", ok: false, statusCode }]]);
});

it("a working proxy", async () => {
    mockSend.mockResolvedValue({ response: { statusCode: 200 } });
    expect(await testSaved()).toEqual([["TEST_PROXY", { requestId: "r1", id: "p1", tested: setup, ok: true }]]);
    expect(await testForm(setup)).toEqual([["TEST_PROXY", { requestId: "r1", ok: true }]]);
});

it("a request error is a result with the reason", async () => {
    mockSend.mockRejectedValue(new Error("ETIMEDOUT"));
    expect(await testSaved()).toEqual([["TEST_PROXY", expect.objectContaining({ ok: false, error: "ETIMEDOUT" })]]);
});

it.each([{ host: "", port: "", username: "", password: "" }, { ...setup, port: "80a" }, null])("an incomplete address %j is a result, not ERROR", async proxy => {
    expect(await testForm(proxy as object)).toEqual([["TEST_PROXY", { requestId: "r1", ok: false, error: expect.any(String) }]]);
    expect(mockSend).not.toHaveBeenCalled();
});

it("a stored proxy with a broken address and a deleted proxy are results too", async () => {
    proxyManager.objects = [new Proxy({ ...stored, host: "" })];
    expect(await testSaved()).toEqual([["TEST_PROXY", expect.objectContaining({ requestId: "r1", id: "p1", ok: false, error: expect.any(String) })]]);
    expect(await testSaved("gone")).toEqual([["TEST_PROXY", { requestId: "r1", id: "gone", ok: false, error: "Proxy #gone does not exist" }]]);
});

it("reports which data were tested when the proxy is edited meanwhile", async () => {
    let answer!: (value: object) => void;
    mockSend.mockImplementation(() => new Promise(resolve => { answer = resolve; }));
    const replies = testSaved();
    proxyManager.edit("p1", { host: "other.test", password: "other" });
    answer({ response: { statusCode: 200 } });
    expect(await replies).toEqual([["TEST_PROXY", expect.objectContaining({ ok: true, tested: setup })]]);
});

it("a real local proxy that refuses the tunnel ends the test", async () => {
    const server = http.createServer();
    server.on("connect", (_req, socket) => socket.end("HTTP/1.1 407 Proxy Authentication Required\r\n\r\n"));
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    try {
        const port = String((server.address() as AddressInfo).port);
        expect(await testForm({ host: "127.0.0.1", port, username: "u", password: "p" }))
            .toEqual([["TEST_PROXY", { requestId: "r1", ok: false, error: expect.stringContaining("407") }]]);
    } finally {
        await new Promise(resolve => server.close(resolve));
    }
});
