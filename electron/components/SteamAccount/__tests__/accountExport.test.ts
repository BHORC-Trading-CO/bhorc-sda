// Экспорт аккаунта (SDA-62): файл собирает main из живого аккаунта в момент клика, запись без
// сессии не ломает ни файл, ни таблицу.
jest.mock("../../application/application", () => ({ __esModule: true, default: { sendToMain: jest.fn(), images: { invalidateRoute: jest.fn() } } }));
jest.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key, i18n: { language: "en" } }), Trans: () => null }));
jest.mock("../../../../src/i18n/i18n", () => ({ __esModule: true, default: { t: (key: string, options?: { error?: string }) => options?.error ? `${key}:${options.error}` : key } }));
const mockStore: Record<string, any> = {};
jest.mock("../../../../src/store/store", () => ({ __esModule: true, default: new Proxy({}, { get: (_target, key: string) => mockStore[key] }) }));
jest.mock("../../../../src/globalComponents/Button/Button", () => ({ __esModule: true, default: (props: any) => require("react").createElement("button", null, props.text ?? props.altText) }));

import fs from "fs";
import path from "path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import SteamAccount from "../SteamAccount";
import steamAccountManager from "../steamAccountManager";
import SteamAccountStorage from "../../newStorage/SteamAccountStorage";
import LinksStorage from "../../newStorage/LinksStorage";
import proxyManager from "../../Proxy/proxyManager";
import Proxy_ from "../../Proxy/Proxy";
import exportListener from "../Listeners/steamAccountExportListener";
import sanitizeSmaFile from "../../Functions/sanitizeSmaFile";
import convertMaFileToStr from "../../Functions/converMaFileToStr";
import exportAccountFile from "../../../../src/pages/Main/tabs/SteamAccountsTab/components/exportAccountFile";
import SteamAccountsTable from "../../../../src/pages/Main/tabs/SteamAccountsTab/components/SteamAccountsTable";
import ErrorBoundary from "../../../../src/globalComponents/ErrorBoundary/ErrorBoundary";
import AvalibleTypes from "../../../interfaces/TableFields/AvalibleFieldTypes";

const record = (extra: Record<string, unknown> = {}) => ({
    id: "a1", number: 1, accountName: "fixture", password: "old-password", deleted: false, useSteamCookies: false,
    familyViewPin: "0123", profileName: "profile", mail: "m@example.invalid", mailPassword: "mail-password",
    maFile: { shared_secret: "old-shared", identity_secret: "i", Session: { SteamID: "76561198000000001", AccessToken: "old-access" } },
    secondary: { nickname: "n", level: 1, avatarUrl: "", ktState: null, tpState: null, tradeState: null },
    changableSecondary: { steam: { balance: 0, currency: "$", error: null } },
    ...extra,
} as any);
function add(extra?: Record<string, unknown>) {
    SteamAccountStorage.Save("a1", record(extra));
    const account = new SteamAccount(record(extra));
    steamAccountManager.objects = [account];
    return account;
}
const exported = (kind: "maFile" | "smaFile") => {
    const file = exportListener({}, { id: "a1", kind });
    if ("error" in file) throw new Error(file.error);
    return { fileName: file.fileName, data: JSON.parse(file.content), content: file.content };
};

beforeEach(() => {
    new (require("electron-store"))().clear();
    proxyManager.objects = [];
    steamAccountManager.objects = [];
});
afterEach(() => { delete (globalThis as any).window; delete (globalThis as any).document; });

it("a file saved right after an edit and a session refresh holds the new data (R2-3)", async () => {
    const account = add();
    account.editParams({ password: "new-password", maFile: { ...record().maFile, shared_secret: "new-shared" } });
    await account.saveSession({ SteamID: "76561198000000001", AccessToken: "new-access", RefreshToken: "new-refresh" });
    expect(exported("smaFile").data).toMatchObject({ password: "new-password", maFile: { shared_secret: "new-shared", Session: { AccessToken: "new-access" } } });
    const maFile = exported("maFile");
    expect(maFile.fileName).toBe("76561198000000001.maFile");
    expect(maFile.content).toContain('"SteamID":76561198000000001');
    expect(maFile.data).toMatchObject({ shared_secret: "new-shared", Session: { AccessToken: "new-access" } });
});

it("the backup keeps the mail, the profile name and the PIN and imports back (R2-4)", () => {
    add();
    expect(sanitizeSmaFile(exported("smaFile").data)).toMatchObject({
        accountName: "fixture", mail: "m@example.invalid", mailPassword: "mail-password", profileName: "profile", familyViewPin: "0123", useSteamCookies: false,
    });
});

it("the linked proxy travels with the file; a vanished one is marked, not dropped (R2-6)", () => {
    const proxy = { id: "p1", number: 1, deleted: false, host: "proxy.test", port: "8080", username: "u", password: "p" };
    proxyManager.objects = [new Proxy_(proxy)];
    LinksStorage.Save({ ...LinksStorage.Get(), steamAccounts: { a1: "p1" } });
    add();
    expect(exported("smaFile").data.proxy).toEqual({ host: "proxy.test", port: "8080", username: "u", password: "p" });
    expect(exported("smaFile").data).not.toHaveProperty("proxyMissing");

    proxyManager.objects = [];
    expect(exported("smaFile").data).not.toHaveProperty("proxy");
    expect(sanitizeSmaFile(exported("smaFile").data).proxyMissing).toBe(true);

    LinksStorage.Save({ ...LinksStorage.Get(), steamAccounts: { a1: null } });
    add();
    expect(exported("smaFile").data).not.toHaveProperty("proxyMissing");
});

it.each([[{}], [undefined]])("a maFile without SteamID (Session: %j) is saved intact under the login (R2-9)", Session => {
    const maFile = { shared_secret: "c2VjcmV0", uri: "otpauth://totp/x?SteamID", Session } as any;
    add({ maFile });
    const file = exported("maFile");
    expect(file.fileName).toBe("fixture.maFile");
    expect(file.data).toEqual(JSON.parse(JSON.stringify(maFile)));
});

it("only Session.SteamID becomes a number, whatever else the maFile holds (R2-9)", () => {
    const maFile = { SteamID: "123", note: '"SteamID":"5"', Session: { SteamID: { s: 1, e: 16, c: [765, 61198000000001] }, AccessToken: "a" } } as any;
    const text = convertMaFileToStr(maFile);
    expect(text).toContain('"SteamID":76561198000000001');
    expect(JSON.parse(text)).toMatchObject({ SteamID: "123", note: '"SteamID":"5"', Session: { AccessToken: "a" } });
    expect(maFile.Session.SteamID).toEqual({ s: 1, e: 16, c: [765, 61198000000001] });
});

it.each([
    ["../../etc/passwd", ".._.._etc_passwd"],
    ["a/b\\c:d*?", "a_b_c_d__"],
    ["CON", "_CON"],
    ["nul.txt", "_nul.txt"],
    ["ок\u202e", "___"],
    ["...", "account"],
    ["", "account"],
    ["normal_login-1", "normal_login-1"],
])("a download name is a portable base name: %j (V62-14)", (login, name) => {
    add({ accountName: login, maFile: { shared_secret: "x", Session: { SteamID: "../7656" } } });
    const expected = name.replace(/^\.+/, "");
    expect(exported("smaFile").fileName).toBe(`${expected}.smaFile`);
    expect(exported("maFile").fileName).toBe(`${expected}.maFile`);
});

it("an unknown account answers with an error instead of a file", () => {
    expect(exportListener({}, { id: "gone", kind: "smaFile" })).toEqual({ error: expect.stringContaining("gone") });
});

describe("renderer", () => {
    it("saves what main returned at the click, and reports a failure", async () => {
        const link = { click: jest.fn() } as any;
        (globalThis as any).document = { createElement: jest.fn(() => link) };
        const exportFile = jest.fn().mockResolvedValueOnce({ fileName: "fixture.smaFile", content: '{"a":"б"}' }).mockResolvedValueOnce({ error: "gone" });
        (globalThis as any).window = { Main: { steamAccounts: { exportFile } } };
        mockStore.windows = { openMiniNotification: jest.fn() };
        await exportAccountFile("a1", "smaFile");
        expect(exportFile).toHaveBeenCalledWith("a1", "smaFile");
        expect(link).toMatchObject({ download: "fixture.smaFile", href: `data:text/json;charset=utf-8,${encodeURIComponent('{"a":"б"}')}` });
        expect(link.click).toHaveBeenCalledTimes(1);
        await exportAccountFile("a1", "maFile");
        expect(link.click).toHaveBeenCalledTimes(1);
        expect(mockStore.windows.openMiniNotification).toHaveBeenCalledWith({ type: "error", text: "accounts.errors.export:gone" });
    });

    it.each([[undefined], [null], [{}]])("a row without a Steam session (Session: %j) does not break the table (R2-2)", Session => {
        const row = { ...record({ maFile: { shared_secret: "c2VjcmV0", Session } }), smaFile: {}, proxy: null, proxyState: "none", group: null };
        const fields = [AvalibleTypes.steamAccountButtons, AvalibleTypes.exportButton, AvalibleTypes.steamId]
            .map(type => ({ type, isSortable: false, isVisible: true, title: "", showTtitleInTable: false }));
        mockStore.steamAccountsTable = {
            getFields: () => fields, getSteamAccountsByPages: () => [[row]], activePage: 1, showDeleted: false, isAllSelected: false,
            sortedField: null, changableSecondaries: {}, browserStatuses: {}, authCodes: {},
        };
        const html = renderToStaticMarkup(React.createElement(SteamAccountsTable));
        expect(html).toContain("accounts.table.actions.saveMaFile");
        expect(html).toContain("accounts.table.actions.exportSmaFile");
        // Содержимое файлов больше не лежит в разметке каждой строки
        expect(html).not.toContain("data:text/json");
    });

    it("a render error shows a message and a reload button instead of an empty window", () => {
        const boundary = new ErrorBoundary({ children: React.createElement("i", null, "child") } as any);
        expect(renderToStaticMarkup(boundary.render())).toContain("child");
        // Значение ошибки не важно: пустое тоже не должно рисовать упавшее содержимое снова
        boundary.state = ErrorBoundary.getDerivedStateFromError();
        const log = jest.spyOn(console, "error").mockImplementation(() => undefined);
        boundary.componentDidCatch(new TypeError("secret in the message"));
        expect(log).toHaveBeenCalled();
        log.mockRestore();
        const html = renderToStaticMarkup(boundary.render());
        expect(html).toContain("common.crash.text");
        expect(html).toContain("common.crash.reload");
        expect(html).not.toContain("child");
        // Текст ошибки может нести данные аккаунта: на экран он не выходит
        expect(html).not.toContain("secret in the message");
        const index = fs.readFileSync(path.join(__dirname, "../../../../src/index.tsx"), "utf8");
        expect(index).toContain("<ErrorBoundary><Router /></ErrorBoundary>");
    });
});
