import nock from "nock";
import maFileLogin from "../maFileLogin";
import setupGuard from "../setupGuard";

beforeAll(() => nock.disableNetConnect());
afterAll(() => nock.enableNetConnect());
it.each([{ host: "", port: "8080" }, { host: "proxy.test", port: "" }])("maFileLogin rejects incomplete proxy promptly: %o", async proxy => {
    await expect(maFileLogin({} as any, undefined, proxy as any)).rejects.toMatchObject({ code: "PROXY_UNAVAILABLE" });
});
it.each([{ host: "", port: "8080" }, { host: "proxy.test", port: "" }])("setupGuard rejects incomplete proxy promptly: %o", async proxy => {
    await expect(setupGuard({ accountName: "fake", password: "fake" }, proxy as any)).rejects.toMatchObject({ code: "PROXY_UNAVAILABLE" });
});
