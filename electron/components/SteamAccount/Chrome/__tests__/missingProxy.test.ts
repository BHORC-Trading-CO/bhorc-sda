jest.mock("../resolveBrowserPath", () => ({ __esModule: true, default: jest.fn() }));
jest.mock("../../../someFuncs/downloadImage", () => ({ __esModule: true, default: jest.fn() }));
jest.mock("../../../application/application", () => ({ __esModule: true, default: { sendToMain: jest.fn() } }));

import Chrome from "../Chrome";
import Manager from "../../../Manager/Manager";
import LinksStorage from "../../../newStorage/LinksStorage";
import proxyManager from "../../../Proxy/proxyManager";
import Proxy from "../../../Proxy/Proxy";
import puppeteer from "puppeteer-extra";
import resolveBrowserPath from "../resolveBrowserPath";
import downloadImage from "../../../someFuncs/downloadImage";

beforeEach(() => {
    proxyManager.objects = [];
    LinksStorage.Save({ steamAccounts: { a1: "gone" }, profiles: {}, groups: {} });
});
afterEach(() => jest.restoreAllMocks());
it.each([null, { id: "gone", host: "", port: "8080" }, { id: "gone", host: "proxy.test", port: "" },
    // SDA-64: синтаксис правил --proxy-server в сохранённой записи.
    { id: "gone", host: "http=proxy.test", port: "8080" }, { id: "gone", host: "proxy.test;direct", port: "8080" }, { id: "gone", host: "проксі.example", port: "8080" }])("start blocks missing/incomplete proxy %o before any browser work", async proxy => {
    if (proxy) proxyManager.objects = [new Proxy(proxy as any)];
    const chrome = new Chrome({ id: "a1", secondary: {} } as any);
    const launch = jest.spyOn(puppeteer, "launch");
    const createProfile = jest.spyOn(chrome, "createProfile");
    await expect(chrome.start()).rejects.toMatchObject({ code: "PROXY_UNAVAILABLE" });
    expect(resolveBrowserPath).not.toHaveBeenCalled();
    expect(launch).not.toHaveBeenCalled();
    expect(createProfile).not.toHaveBeenCalled();
    expect(downloadImage).not.toHaveBeenCalled();
    expect(chrome.generateChromeFlags()).not.toContain("--proxy-server=:");
});
it("resolves a good proxy then clears it only on deliberate unlink", async () => {
    proxyManager.objects = [new Proxy({ id: "gone", host: "proxy.test", port: "8080", username: "", password: "" } as any)];
    const chrome = new Chrome({ id: "a1", secondary: {} } as any);
    await chrome.setupProxy();
    expect(chrome.generateChromeFlags()).toContain("--proxy-server=proxy.test:8080");
    LinksStorage.Save({ steamAccounts: { a1: null }, profiles: {}, groups: {} });
    await chrome.setupProxy();
    expect(chrome.proxy).toBeUndefined();
    expect((chrome as any).proxyUrl()).toBeNull();
});
// SDA-64: последняя проверка — у самого флага, даже если маршрут сочли рабочим.
it.each([{ host: "http=proxy.test" }, { host: "proxy.test;direct" }, { port: "80;https=x" }])("setupProxy never hands %o to Chromium", async patch => {
    const chrome = new Chrome({ id: "a1", secondary: {} } as any);
    chrome.proxy = { server: "previous.test:1", username: "", password: "" };
    const proxy = { id: "p1", host: "proxy.test", port: "8080", username: "", password: "", ...patch } as any;
    jest.spyOn(Manager, "GetSteamAccountLinkedData").mockReturnValue({ proxy, proxyState: "ok", proxyId: "p1" });
    await expect(chrome.setupProxy()).rejects.toMatchObject({ code: "PROXY_UNAVAILABLE" });
    expect(chrome.proxy).toBeUndefined();
});
