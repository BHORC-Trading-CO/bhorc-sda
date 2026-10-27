import { installConsoleRedaction, redactSecrets, redactString, REDACTED } from "../redactSecrets";

const maFile = {
    account_name: "trader_042",
    shared_secret: "c2hhcmVk",
    identity_secret: "aWRlbnRpdHk=",
    revocation_code: "R12345",
    secret_1: "c2VjcmV0MQ==",
    uri: "otpauth://totp/Steam:trader_042?secret=ABCDEFGHIJKLMNOP&issuer=Steam",
    Session: { SteamID: "76561198000000000", AccessToken: "eyJhbGciOiJFZERTQSJ9.eyJzdWIiOiI3NjU2MTE5OCJ9.c2lnbmF0dXJlc2lnbmF0dXJl", RefreshToken: "x" },
};

describe("redactSecrets", () => {
    it("прячет секреты аккаунта и прокси, оставляя несекретные поля", () => {
        const account = {
            id: "a1",
            accountName: "trader_042",
            password: "hunter2",
            mailPassword: "mail-pass",
            familyViewPin: "1234",
            maFile,
            proxy: { id: "p1", host: "10.0.0.1", port: "8888", username: "user", password: "pass" },
        };
        const out = redactSecrets(account) as Record<string, any>;
        expect(out.id).toBe("a1");
        expect(out.accountName).toBe("trader_042");
        expect(out.password).toBe(REDACTED);
        expect(out.mailPassword).toBe(REDACTED);
        expect(out.familyViewPin).toBe(REDACTED);
        expect(out.maFile).toBe(REDACTED);
        expect(out.proxy).toEqual({ id: "p1", host: "10.0.0.1", port: "8888", username: REDACTED, password: REDACTED });
        expect(JSON.stringify(out)).not.toMatch(/hunter2|c2hhcmVk|R12345|ABCDEFGHIJKLMNOP|pass"/);
    });

    it("прячет токены у экземпляров классов (LoginSession хранит _accessToken/_refreshToken)", () => {
        class FakeSession { _accessToken = "eyJhbGciOiJFZERTQSJ9.eyJzdWIiOiI3NjU2MTE5OCJ9.c2lnbmF0dXJlc2lnbmF0dXJl"; _refreshToken = "refresh"; steamID = "7656"; }
        class FakeSteamAccount { params = { accountName: "trader_042", password: "p", maFile }; session = new FakeSession(); }
        const text = JSON.stringify(redactSecrets(new FakeSteamAccount()));
        expect(text).not.toMatch(/eyJhbGci|refresh|"p"|c2hhcmVk/);
        expect(text).toContain("trader_042");
    });

    it("маскирует секреты внутри строк", () => {
        expect(redactString("proxy http://user:p%40ss@1.2.3.4:8080 failed")).toBe(`proxy http://${REDACTED}@1.2.3.4:8080 failed`);
        expect(redactString("bulk Login:Password@1.1.1.1:7777")).toBe(`bulk ${REDACTED}@1.1.1.1:7777`);
        expect(redactString("Cookie: steamLoginSecure=7656%7C%7CeyJ; sessionid=1")).toBe(`Cookie: steamLoginSecure=${REDACTED}; sessionid=1`);
        expect(redactString(maFile.uri)).not.toContain("ABCDEFGHIJKLMNOP");
        expect(redactString(`token ${maFile.Session.AccessToken}`)).toBe("token [redacted-jwt]");
        expect(redactString("trader_042 - cookies loaded")).toBe("trader_042 - cookies loaded");
    });

    it("переживает циклы, ошибки и глубокие объекты", () => {
        const a: any = { name: "a" }; a.self = a;
        expect(redactSecrets(a)).toEqual({ name: "a", self: "[Circular]" });
        const err = redactSecrets(new Error("login via http://u:p@h:1 failed")) as Error;
        expect(err.message).toBe(`login via http://${REDACTED}@h:1 failed`);
        let deep: any = { v: 1 }; for (let i = 0; i < 20; i++) deep = { deep };
        expect(() => redactSecrets(deep)).not.toThrow();
    });
});

describe("installConsoleRedaction", () => {
    it("оборачивает console и не выпускает секреты наружу, повторная установка безопасна", () => {
        const calls: unknown[][] = [];
        const fake = { log: (...a: unknown[]) => calls.push(a), info() {}, warn() {}, error() {}, debug() {}, trace() {} } as unknown as Console;
        installConsoleRedaction(fake);
        installConsoleRedaction(fake);
        fake.log("edit", { accountName: "trader_042", password: "hunter2", maFile });
        expect(calls).toHaveLength(1);
        expect(JSON.stringify(calls[0])).not.toMatch(/hunter2|c2hhcmVk/);
        expect(JSON.stringify(calls[0])).toContain("trader_042");
    });
});
