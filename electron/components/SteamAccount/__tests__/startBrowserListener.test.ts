jest.mock("../steamAccountManager", () => ({ __esModule: true, default: { getById: jest.fn() } }));
jest.mock("../../Proxy/proxyManager", () => ({ __esModule: true, default: { getProxyGeo: jest.fn() } }));
jest.mock("../Chrome/Chrome", () => ({ __esModule: true, BrowserStartCancelledError: class extends Error { } }));
import steamAccountManager from "../steamAccountManager";
import startBrowser from "../Listeners/steamAccountStartBrowser";
import SteamAccountChannels from "../../../interfaces/IpcChannels/SteamAccountChannels";

const account = (extra: object) => ({
    proxy: null, params: { useSteamCookies: true }, proxyUrl: () => null, captureRoute: () => () => undefined,
    getBrowserCookies: jest.fn().mockResolvedValue([]),
    chrome: { workStatus: "notworking", start: jest.fn().mockResolvedValue(undefined) }, ...extra,
});
const run = async (value: unknown) => {
    (steamAccountManager.getById as jest.Mock).mockReturnValue(value);
    const reply = jest.fn();
    await startBrowser({ reply } as any, "a1");
    return reply.mock.calls;
};

it("«загрузка» показана сразу, до получения cookie", async () => {
    const value = account({});
    let atCookies = 0;
    const reply = jest.fn();
    value.getBrowserCookies.mockImplementation(async () => { atCookies = reply.mock.calls.length; return []; });
    (steamAccountManager.getById as jest.Mock).mockReturnValue(value);
    await startBrowser({ reply } as any, "a1");
    expect(atCookies).toBe(1);
    expect(reply.mock.calls).toEqual([[SteamAccountChannels.GET_BROWSER_STARTUS, { status: "load", id: "a1" }]]);
    expect(value.chrome.start).toHaveBeenCalledTimes(1);
});

it("до запуска не дошло: кнопка возвращается, ошибка показана", async () => {
    const calls = await run(account({ proxyUrl: () => { throw new Error("proxy missing"); } }));
    expect(calls).toEqual([
        [SteamAccountChannels.GET_BROWSER_STARTUS, { status: "load", id: "a1" }],
        [SteamAccountChannels.GET_BROWSER_STARTUS, { status: "notworking", id: "a1" }],
        ["ERROR", "Error: proxy missing"],
    ]);
});

it("уже работающий браузер не переводится в «загрузку»", async () => {
    const calls = await run(account({ chrome: { workStatus: "working", start: jest.fn().mockResolvedValue(undefined) } }));
    expect(calls).toEqual([]);
});

it("прокси сменился, пока получали cookie: браузер не запускается с ними", async () => {
    const value = account({ captureRoute: () => () => { throw new Error("route changed"); } });
    const calls = await run(value);
    expect(value.chrome.start).not.toHaveBeenCalled();
    expect(calls[calls.length - 1]).toEqual(["ERROR", "Error: route changed"]);
});
