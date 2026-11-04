import proxyUrl from "../proxyUrl";
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
