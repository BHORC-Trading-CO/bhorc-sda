import proxyUrl, { proxyEndpoint } from "../proxyUrl";
import ProxyUnavailableError from "../ProxyUnavailableError";
import { setMainLanguage } from "../../../i18n";

const proxy = { id: "p1", host: "proxy.test", port: "8080", username: "u@x", password: "p:x" };
it.each([null, undefined])("only an absent proxy permits direct traffic: %s", value => {
    expect(proxyUrl(value)).toBeNull();
});
it.each([{ host: "" }, { host: "  " }, { port: "" }, { port: " " }, { port: 0 }, { port: undefined }])("rejects incomplete proxy %o", patch => {
    expect(() => proxyUrl({ ...proxy, ...patch } as any)).toThrow(ProxyUnavailableError);
    try { proxyUrl({ ...proxy, ...patch } as any); } catch (err) {
        expect(err).toMatchObject({ code: "PROXY_UNAVAILABLE" });
    }
});
// SDA-64: сохранённая раньше (или правленная вручную) запись с синтаксисом правил Chromium не работает.
it.each(["http=proxy.test", "proxy.test;direct", "proxy.test,direct", "proxy.test/x", "http＝proxy.test", "проксі.example;direct", "проксі example", "проксі.example/x", "проксі.1", "u@proxy.test", "1.2.3"])("refuses a stored host %s", host => {
    expect(() => proxyUrl({ ...proxy, host })).toThrow(ProxyUnavailableError);
});
it.each(["80;https=direct", "0x50", "8e1", "-1", "65536"])("refuses a stored port %s", port => {
    expect(() => proxyUrl({ ...proxy, port })).toThrow(ProxyUnavailableError);
});
// Записано до SDA-64, буквами: то же имя, аккаунт не должен стать «без маршрута».
it("reads a stored IDN host as punycode", () => {
    expect(proxyUrl({ ...proxy, host: "проксі.example" })).toBe("http://u%40x:p%3Ax@xn--j1ahceh0k.example:8080");
    expect(proxyEndpoint({ ...proxy, host: " Проксі.example " })).toEqual({ host: "xn--j1ahceh0k.example", port: "8080" });
});
it("tolerates spaces around a stored address", () => {
    expect(proxyUrl({ ...proxy, host: " proxy.test", port: "8080 " })).toBe("http://u%40x:p%3Ax@proxy.test:8080");
});
it("encodes credentials for the resolved route", () => {
    expect(proxyUrl(proxy)).toBe("http://u%40x:p%3Ax@proxy.test:8080");
});
it.each(["en", "uk", "ru"] as const)("unavailable errors are translated in %s without credentials", language => {
    setMainLanguage(language);
    const err = new ProxyUnavailableError("p1");
    expect(err.message).toContain("p1");
    expect(err.message).not.toContain("errors.proxyUnavailable");
    expect(err.message).not.toContain("p:x");
});
