import fs from "fs";
import os from "os";
import path from "path";
import { BrowserWindow, dialog } from "electron";

import BrowserSettingsStorage from "../../newStorage/BrowserSettingsStorage";
import BrowserChannels from "../../../interfaces/IpcChannels/BrowserChannels";
import {
    browserPickExtensionListener,
    browserSettingsGetListener,
    browserSettingsSaveListener,
} from "../Listeners/browserSettingsListeners";
import { DEFAULT_START_LINK } from "../browserSettings";
import { setMainLanguage } from "../../../i18n";

beforeAll(() => setMainLanguage("en"));

const tempDirs: string[] = [];
function extensionDir(manifest: object | null) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sda-browser-ipc-"));
    tempDirs.push(dir);
    if (manifest) fs.writeFileSync(path.join(dir, "manifest.json"), JSON.stringify(manifest));
    return dir;
}
afterAll(() => {
    for (const dir of tempDirs) fs.rmSync(dir, { recursive: true, force: true });
});

function makeEvent() {
    return { reply: jest.fn(), sender: {} } as any;
}
const replies = (event: any, channel: string) => event.reply.mock.calls.filter((call: any[]) => call[0] === channel).map((call: any[]) => call[1]);

const showOpenDialog = jest.fn();
beforeAll(() => {
    (dialog as any).showOpenDialog = showOpenDialog;
    (BrowserWindow as any).fromWebContents = () => null;
});
beforeEach(() => BrowserSettingsStorage.Save({ startLinks: [DEFAULT_START_LINK], extensions: [] }));

describe("хранилище настроек браузера", () => {
    it("у старой установки ключа нет — отдаёт значения по умолчанию", () => {
        jest.isolateModules(() => {
            const FreshStorage = require("../../newStorage/BrowserSettingsStorage").default;
            expect(FreshStorage.Get()).toEqual({ startLinks: [DEFAULT_START_LINK], extensions: [] });
        });
    });
    it("сохранённое читается обратно", () => {
        BrowserSettingsStorage.Save({ startLinks: ["https://a.test/"], extensions: [{ path: "/x", enabled: false }] });
        expect(BrowserSettingsStorage.Get()).toEqual({ startLinks: ["https://a.test/"], extensions: [{ path: "/x", enabled: false }] });
    });
});

describe("IPC страницы Browser", () => {
    it("get отвечает видом настроек", () => {
        const event = makeEvent();
        browserSettingsGetListener(event);
        expect(replies(event, BrowserChannels.BROWSER_SETTINGS_GET)).toEqual([{ startLinks: [DEFAULT_START_LINK], extensions: [] }]);
    });

    it("save с корректными данными сохраняет и отвечает новым видом", () => {
        const dir = extensionDir({ manifest_version: 3, name: "Helper", version: "2.0" });
        const event = makeEvent();
        browserSettingsSaveListener(event, { startLinks: ["https://a.test/"], extensions: [{ path: dir, enabled: true }] });
        expect(replies(event, BrowserChannels.BROWSER_SETTINGS_ERROR)).toEqual([]);
        expect(BrowserSettingsStorage.Get()).toEqual({ startLinks: ["https://a.test/"], extensions: [{ path: dir, enabled: true }] });
        expect(replies(event, BrowserChannels.BROWSER_SETTINGS_GET)[0].extensions[0]).toMatchObject({ name: "Helper", version: "2.0", status: "ok" });
    });

    it("save с плохой ссылкой не сохраняет: ошибка и прежнее состояние", () => {
        const event = makeEvent();
        browserSettingsSaveListener(event, { startLinks: ["file:///etc/passwd"], extensions: [] });
        expect(replies(event, BrowserChannels.BROWSER_SETTINGS_ERROR))
            .toEqual([{ section: "links", message: "Not a valid http(s) address: file:///etc/passwd" }]);
        expect(BrowserSettingsStorage.Get().startLinks).toEqual([DEFAULT_START_LINK]);
        expect(replies(event, BrowserChannels.BROWSER_SETTINGS_GET)).toEqual([{ startLinks: [DEFAULT_START_LINK], extensions: [] }]);
    });

    it("pickExtension: выбранная папка проверяется и добавляется", async () => {
        const dir = extensionDir({ manifest_version: 2, name: "Old one", version: "0.1" });
        showOpenDialog.mockResolvedValueOnce({ canceled: false, filePaths: [dir] });
        const event = makeEvent();
        await browserPickExtensionListener(event);
        expect(showOpenDialog).toHaveBeenCalledWith(expect.objectContaining({ properties: ["openDirectory"] }));
        expect(BrowserSettingsStorage.Get().extensions).toEqual([{ path: dir, enabled: true }]);
        expect(replies(event, BrowserChannels.BROWSER_SETTINGS_GET)[0].extensions).toHaveLength(1);
    });

    it("pickExtension: папка без manifest — ошибка, список не меняется", async () => {
        const dir = extensionDir(null);
        showOpenDialog.mockResolvedValueOnce({ canceled: false, filePaths: [dir] });
        const event = makeEvent();
        await browserPickExtensionListener(event);
        const [error] = replies(event, BrowserChannels.BROWSER_SETTINGS_ERROR);
        expect(error.section).toBe("extensions");
        expect(error.message).toContain("No manifest.json");
        expect(BrowserSettingsStorage.Get().extensions).toEqual([]);
    });

    it("pickExtension: отмена — ничего не меняется, но ответ приходит (страница снимает «выбор папки»)", async () => {
        showOpenDialog.mockResolvedValueOnce({ canceled: true, filePaths: [] });
        const event = makeEvent();
        await browserPickExtensionListener(event);
        expect(replies(event, BrowserChannels.BROWSER_SETTINGS_ERROR)).toEqual([]);
        expect(replies(event, BrowserChannels.BROWSER_SETTINGS_GET)).toHaveLength(1);
    });
});
