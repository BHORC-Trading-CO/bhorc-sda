import fs from "fs";
import path from "path";
import { installConsoleRedaction, redactSecrets, redactString, REDACTED, writeUnredacted } from "../redactSecrets";

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

describe("redactSecrets: имена ключей, отладка и производительность", () => {
    it("ловит camelCase/snake_case варианты ключей", () => {
        const out = redactSecrets({ sharedSecret: "s", revocationCode: "r", activationCode: "a", apiKey: "k", Authorization: "Bearer x", identitySecret: "i" });
        expect(Object.values(out as object).every((v) => v === REDACTED)).toBe(true);
        expect(redactString("GET /IEconService?key=ABCDEF&format=json")).toBe(`GET /IEconService?key=${REDACTED}&format=json`);
    });

    it("сохраняет поля ошибок, даты, Map/Set и общие (не циклические) ссылки", () => {
        const cause = new Error("inner");
        const err = Object.assign(new Error("boom"), { code: "ECONNRESET", eresult: 84, cause });
        const out = redactSecrets(err) as Error & { code?: string; eresult?: number; cause?: Error };
        expect(out.code).toBe("ECONNRESET");
        expect(() => redactSecrets(Object.assign(new Error("x"), { message: 42 }))).not.toThrow();
        expect(redactSecrets({ "Proxy-Authorization": "Basic dXNlcjpwYXNz" })).toEqual({ "Proxy-Authorization": REDACTED });
        expect(out.eresult).toBe(84);
        expect((out.cause as Error).message).toBe("inner");

        const when = new Date(0);
        expect(redactSecrets({ when }).valueOf()).toEqual({ when });
        const map = redactSecrets(new Map<string, unknown>([["password", "p"], ["id", 1]])) as Map<string, unknown>;
        expect(map.get("password")).toBe(REDACTED);
        expect(map.get("id")).toBe(1);

        const proxy = { host: "h", password: "p" };
        expect(redactSecrets({ a: { proxy }, b: { proxy } })).toEqual({ a: { proxy: { host: "h", password: REDACTED } }, b: { proxy: { host: "h", password: REDACTED } } });
        expect((redactSecrets(new Array(250).fill(1)) as unknown[]).slice(-1)[0]).toBe("…ещё 50");
    });

    it("не зависает на длинных строках и больших объектах", () => {
        const started = Date.now();
        redactString("a.".repeat(50000));
        redactString("a:".repeat(50000) + "@h:1");
        const wide: Record<string, unknown> = {};
        for (let i = 0; i < 30; i++) {
            const lvl2: Record<string, unknown> = {};
            for (let j = 0; j < 30; j++) {
                const lvl3: Record<string, unknown> = {};
                for (let k = 0; k < 30; k++) lvl3[`k${k}`] = { v: k };
                lvl2[`j${j}`] = lvl3;
            }
            wide[`i${i}`] = lvl2;
        }
        expect(JSON.stringify(redactSecrets(wide))).toContain("[Truncated]");
        expect(Date.now() - started).toBeLessThan(1000);
    });
});

describe("writeUnredacted", () => {
    it("пишет резервную копию секретов мимо обёртки console", () => {
        const spy = jest.spyOn(process.stdout, "write").mockImplementation(() => true);
        try {
            writeUnredacted("trader_042 - секреты аутентификатора:", { revocation_code: "R12345", shared_secret: "c2hhcmVk" });
            const text = spy.mock.calls.map((c) => String(c[0])).join("");
            expect(text).toContain("R12345");
            expect(text).toContain("c2hhcmVk");
        } finally {
            spy.mockRestore();
        }
    });

    it("writeUnredacted вызывается только в setupGuard", () => {
        const root = path.join(__dirname, "../../..");
        const users: string[] = [];
        const walk = (d: string) => {
            for (const e of fs.readdirSync(d, { withFileTypes: true })) {
                const full = path.join(d, e.name);
                if (e.isDirectory()) { if (e.name !== "__tests__") walk(full); }
                else if (/\.tsx?$/.test(e.name) && /writeUnredacted\(/.test(fs.readFileSync(full, "utf8")) && !full.endsWith("redactSecrets.ts")) users.push(path.basename(full));
            }
        };
        walk(root);
        walk(path.join(root, "../src"));
        expect(users).toEqual(["setupGuard.ts"]);
    });

    it("setupGuard при сбое записи на диск пишет секреты через writeUnredacted, а не через console", () => {
        const file = fs.readFileSync(path.join(__dirname, "../../SteamAccount/Processes/setupGuard.ts"), "utf8");
        expect(file).toMatch(/if \(!backupFile\) writeUnredacted\(/);
        expect(file).not.toMatch(/console\.\w+\(rawMaFile\)/);
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
