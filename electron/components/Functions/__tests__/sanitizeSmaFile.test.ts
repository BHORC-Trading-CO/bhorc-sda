import sanitizeSmaFile, { sanitizeProxySetup } from "../sanitizeSmaFile";
import { DEFAULT_AVATAR_URL } from "../sanitizeAvatarUrl";

const account = () => ({
    accountName: "test-account", password: "test-password", familyViewPin: 1234, useSteamCookies: true,
    tmApiKey: "test-key", profileName: "profile", mail: "test@example.invalid", mailPassword: "test-mail-password",
    secondary: { nickname: "Name", avatarUrl: "http://unix:/tmp/socket:/img", level: 12, ktState: true, tpState: "limited", tradeState: false, extra: "drop" },
    maFile: {
        shared_secret: "shared", serial_number: "1", revocation_code: "R", uri: "otpauth://test",
        server_time: 123, account_name: "test-account", token_gid: "2", identity_secret: "identity",
        secret_1: "secret", status: 1, device_id: "android:test", fully_enrolled: true,
        phone_number_hint: "12", confirm_type: 1, custom: null,
        Session: {
            SessionID: "session", SteamLogin: null, SteamLoginSecure: "secure", WebCookie: "cookie",
            SteamID: "76561197960287930", SteamRememberLogin: "remember", AccessToken: "access", RefreshToken: "refresh",
            extra: "drop", "a.b": "drop",
        },
        nested: { extra: true }, array: [1], "a.b": "drop",
    },
    proxy: { host: "proxy.example", port: "8080", username: "user", password: "pass", id: "a.b", timezone: "fake", deleted: true },
    id: "a.b", number: 999, deleted: true, changableSecondary: { steam: {} }, extra: "drop",
});

describe("sanitizeSmaFile", () => {
    it("копирует разрешённые поля, сессию и скалярные расширения maFile до превью", () => {
        const source = account();
        const result = sanitizeSmaFile(source);
        expect(Object.keys(result).sort()).toEqual(["accountName", "password", "familyViewPin", "useSteamCookies", "profileName", "mail", "mailPassword", "secondary", "maFile", "proxy"].sort());
        expect(result.secondary).toEqual({ nickname: "Name", avatarUrl: DEFAULT_AVATAR_URL, level: 12, ktState: true, tpState: "limited", tradeState: false });
        expect(result.proxy).toEqual({ host: "proxy.example", port: "8080", username: "user", password: "pass" });
        const { nested, array, "a.b": dotted, Session, ...maFields } = source.maFile;
        const { extra, "a.b": sessionDotted, ...sessionFields } = Session;
        expect(result.maFile).toEqual({ ...maFields, Session: sessionFields });
        expect(result.maFile).not.toBe(source.maFile);
        expect(source.secondary.avatarUrl).toMatch(/^http:/);
    });

    it("нормализует старый SteamID BigNumber без переноса его произвольных полей", () => {
        const source: any = account();
        source.maFile.Session.SteamID = { s: 1, e: 16, c: [765, 61197960287930], extra: { unsafe: true } };
        expect(sanitizeSmaFile(source).maFile.Session.SteamID).toBe("76561197960287930");
    });

    it("сохраняет числовые идентификаторы maFile после чтения json-bigint", () => {
        const source: any = account();
        const parsed = require("json-bigint").parse('{"serial_number":12345678901234567890,"token_gid":1234}');
        source.maFile.serial_number = parsed.serial_number;
        source.maFile.token_gid = parsed.token_gid;
        expect(sanitizeSmaFile(source).maFile).toMatchObject({ serial_number: "12345678901234567890", token_gid: "1234" });
    });

    it("восстанавливает хвостовые нули BigNumber по экспоненте", () => {
        const source: any = account();
        source.maFile.Session.SteamID = require("json-bigint").parse("10000000000000000");
        expect(sanitizeSmaFile(source).maFile.Session.SteamID).toBe("10000000000000000");
    });

    it.each([{ c: [1, 50000000000000], e: 0, s: 1 }, { c: [1], e: 999999999, s: 1 }, { c: [123], e: 2, s: -1 }])("отклоняет некорректный BigNumber %#", SteamID => {
        const source: any = account();
        source.maFile.Session.SteamID = SteamID;
        expect(() => sanitizeSmaFile(source)).toThrow();
    });

    it("не переносит ключи прототипа и унаследованные поля", () => {
        const source: any = account();
        source.maFile = JSON.parse('{"__proto__":"bad","constructor":"bad","prototype":"bad","shared_secret":"ok"}');
        expect(sanitizeSmaFile(source).maFile).toEqual({ shared_secret: "ok" });
        expect(() => sanitizeSmaFile(Object.create(account()))).toThrow();
    });

    it.each([null, [], {}, { ...account(), accountName: {} }, { ...account(), secondary: [] },
        { ...account(), maFile: null }, { ...account(), familyViewPin: "12a4" },
        { ...account(), maFile: { shared_secret: {} } }, { ...account(), proxy: { host: "bad/host", port: "80" } },
    ])("отклоняет некорректную структуру %#", source => {
        expect(() => sanitizeSmaFile(source)).toThrow();
    });

    it("PIN из окна ввода приходит строкой и сохраняется строкой (ведущие нули важны)", () => {
        expect(sanitizeSmaFile({ ...account(), familyViewPin: "0123" }).familyViewPin).toBe("0123");
        expect(sanitizeSmaFile({ ...account(), familyViewPin: 1234 }).familyViewPin).toBe(1234);
        expect(sanitizeSmaFile({ ...account(), familyViewPin: null }).familyViewPin).toBeNull();
        expect(sanitizeSmaFile({ ...account(), familyViewPin: "" }).familyViewPin).toBeNull();
        expect(sanitizeSmaFile({ ...account(), familyViewPin: " 0123 " }).familyViewPin).toBe("0123");
    });

    it("null в необязательных полях — как отсутствие (maFile из Steam Desktop Authenticator)", () => {
        const source = account();
        const result = sanitizeSmaFile({
            ...source,
            mail: null,
            maFile: { ...source.maFile, device_id: null, serial_number: null, Session: { SteamID: "76561198000000000", SessionID: null, WebCookie: null, SteamLogin: null } },
        });
        expect(result.maFile.Session).toEqual({ SteamID: "76561198000000000", SteamLogin: null });
        expect(result).not.toHaveProperty("mail");
    });

    it("пустой прокси в файле — без прокси, а не ошибка", () => {
        expect(sanitizeSmaFile({ ...account(), proxy: {} })).not.toHaveProperty("proxy");
        expect(sanitizeSmaFile({ ...account(), proxy: { host: "", port: "" } })).not.toHaveProperty("proxy");
    });

    it("прокси с логином или портом, но без host — ошибка, а не тихий импорт с реального IP", () => {
        expect(() => sanitizeSmaFile({ ...account(), proxy: { host: "", port: "8080", username: "u", password: "p" } })).toThrow();
    });
});

describe("sanitizeProxySetup", () => {
    it("обрезает пробелы по краям host и port (файлы, правленные вручную)", () => {
        expect(sanitizeProxySetup({ host: " 1.2.3.4", port: "8080 " })).toEqual({ host: "1.2.3.4", port: "8080", username: "", password: "" });
        expect(sanitizeProxySetup({ host: "proxy.test\n", port: "80\n" })).toEqual({ host: "proxy.test", port: "80", username: "", password: "" });
    });
    it.each(["proxy.example.", "[::ffff:192.0.2.1]", "[2001:db8::1]", "проксі.example"])("сохраняет допустимый host %s", host => {
        expect(sanitizeProxySetup({ host, port: "8080" })).toEqual({ host, port: "8080", username: "", password: "" });
    });
    it("сохраняет адрес и credentials, числовой порт приводит к строке", () => {
        expect(sanitizeProxySetup({ host: "127.0.0.1", port: 8080, username: "u@x", password: "p:/x", countryCode: "XX" }))
            .toEqual({ host: "127.0.0.1", port: "8080", username: "u@x", password: "p:/x" });
    });
    it.each(["http://unix:/tmp/socket", "proxy.test/path", "proxy.test@other", "proxy.test?x", "proxy.test\nx", "proxy.test:80", "%65vil.test", "[::::]", "proxy.test\\path"])("отклоняет разделители URL и неверный host %s", host => {
        expect(() => sanitizeProxySetup({ host, port: "8080" })).toThrow();
    });
    it.each(["0", "65536", "80/path", "80?x", "80\n1", -1, {}])("отклоняет неверный порт %#", port => {
        expect(() => sanitizeProxySetup({ host: "proxy.test", port })).toThrow();
    });
});
