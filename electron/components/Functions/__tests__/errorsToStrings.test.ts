// Страховка списка аккаунтов, который main шлёт в рендерер (STEAM_ACCOUNT_GET).
// V8 в Electron 17 (9.8) неверно читает IPC-сообщение, где повторная ссылка ведёт на объект,
// впервые записанный после объекта Error: ссылка указывает на соседний объект. В списке
// аккаунтов повторных ссылок много (общий proxy у аккаунтов на одном прокси, secondary и maFile
// в smaFile), поэтому один Error в данных портил proxy/smaFile следующих аккаунтов, а при
// петле (proxy === сам аккаунт) рендерер падал с Maximum call stack size exceeded (SDA-19).

const mockSendToMain = jest.fn();
jest.mock("../../application/application", () => ({ __esModule: true, default: { sendToMain: (...args: any[]) => mockSendToMain(...args) } }));
const mockProxy = { id: "p1", number: 1, host: "127.0.0.1", port: "9", username: "u", password: "p", deleted: false };
jest.mock("../../manager/manager", () => ({
    __esModule: true,
    default: { GetSteamAccountLinkedData: () => ({ proxy: mockProxy }), GetSteamAccountGroup: () => null },
}));
// Сам SteamAccount тут не нужен (тянет сеть и браузер): менеджеру хватает params и getSmaFile.
jest.mock("../../SteamAccount/SteamAccount", () => ({ __esModule: true, default: class {} }));

import errorsToStrings from "../errorsToStrings";
import { SteamAccountManager } from "../../SteamAccount/steamAccountManager";

function findErrors(value: unknown): string[] {
    const found: string[] = [];
    const seen = new Set<unknown>();
    (function walk(v: unknown, path: string) {
        if (v instanceof Error) found.push(path);
        if (!v || typeof v !== "object" || seen.has(v)) return;
        seen.add(v);
        for (const [k, child] of Object.entries(v)) walk(child, `${path}.${k}`);
    })(value, "$");
    return found;
}

describe("errorsToStrings", () => {
    it("меняет вложенные Error на строку и не трогает исходные данные", () => {
        const source = { a: { error: new TypeError("boom") }, list: [new Error("x"), 1, "s", null], when: new Date(0) };
        const result = errorsToStrings(source);
        expect(result).toEqual({ a: { error: "TypeError: boom" }, list: ["Error: x", 1, "s", null], when: new Date(0) });
        expect(findErrors(result)).toEqual([]);
        expect(source.a.error).toBeInstanceOf(TypeError);
        expect(source.list[0]).toBeInstanceOf(Error);
    });

    it("общие объекты остаются общими, петли не ломают обход", () => {
        const shared = { host: "h" };
        const loop: any = { name: "loop" };
        loop.self = loop;
        const result = errorsToStrings({ x: shared, y: shared, loop });
        expect(result.x).toBe(result.y);
        expect(result.x).not.toBe(shared);
        expect(result.loop.self).toBe(result.loop);
    });
});

describe("sendAccountsToFront", () => {
    it("шлёт в рендерер список аккаунтов без объектов Error", () => {
        const manager = new SteamAccountManager();
        const account = (n: number) => {
            const secondary = { nickname: `n${n}`, level: n };
            const maFile = { shared_secret: "s", Session: { SteamID: `${n}` } };
            const params = {
                id: `a${n}`, number: n, accountName: `acc${n}`, deleted: false, secondary, maFile,
                changableSecondary: { steam: { error: new Error("read ECONNRESET"), balance: null, currency: null } },
            };
            return { params, getSmaFile: () => ({ accountName: params.accountName, secondary, maFile }) } as any;
        };
        manager.objects = [account(1), account(2), account(3)];
        manager.sendAccountsToFront();

        expect(mockSendToMain).toHaveBeenCalledTimes(1);
        const [channel, accounts] = mockSendToMain.mock.calls[0];
        expect(channel).toBe("STEAM_ACCOUNT_GET");
        expect(findErrors(accounts)).toEqual([]);
        expect(accounts[1].changableSecondary.steam.error).toBe("Error: read ECONNRESET");
        expect(accounts.map((a: any) => a.proxy.host)).toEqual(["127.0.0.1", "127.0.0.1", "127.0.0.1"]);
        // Живые данные main не меняются.
        expect(manager.objects[1].params.changableSecondary.steam.error).toBeInstanceOf(Error);
    });
});
