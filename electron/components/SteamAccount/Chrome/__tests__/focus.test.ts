// SDA-64: Focus выводит вперёд уже открытое окно и ничего не создаёт.
jest.mock("../../../application/application", () => ({ __esModule: true, default: { sendToMain: jest.fn() } }));
import Chrome, { FOCUS_ATTEMPTS, FOCUS_RETRY_MS } from "../Chrome";
import steamAccountFocusBrowser from "../../Listeners/steamAccountFocusBrowser";
import steamAccountManager from "../../steamAccountManager";
import { setMainLanguage } from "../../../../i18n";

function tab(visible: () => boolean | Promise<boolean>) {
    const sent: unknown[] = [];
    const session = {
        sent, detach: jest.fn().mockResolvedValue(undefined),
        send: jest.fn(async (method: string, params?: any) => {
            sent.push(params ? params.bounds.windowState : method);
            return { windowId: 7 };
        }),
    };
    return {
        session, evaluate: jest.fn(async () => visible()), bringToFront: jest.fn().mockResolvedValue(undefined),
        goto: jest.fn(), target: () => ({ createCDPSession: async () => session }),
    };
}
function makeChrome(tabs: ReturnType<typeof tab>[], page = tabs[0]) {
    const chrome = new Chrome({ id: "a1", secondary: {} } as any);
    const browser = { pages: jest.fn().mockResolvedValue(tabs), newPage: jest.fn() };
    chrome.browser = browser as any;
    chrome.page = page as any;
    return { chrome, browser };
}

beforeAll(() => setMainLanguage("en"));
beforeEach(() => { jest.spyOn(console, "log").mockImplementation(() => {}); });
afterEach(() => { jest.restoreAllMocks(); });

it("repeated Focus opens no tabs and shows the tab the operator is on", async () => {
    const steam = tab(() => false), item = tab(() => true);
    const { chrome, browser } = makeChrome([steam, item]);
    await chrome.focus();
    await chrome.focus();
    expect(browser.newPage).not.toHaveBeenCalled();
    expect(item.bringToFront).toHaveBeenCalledTimes(2);
    expect(steam.bringToFront).not.toHaveBeenCalled();
    expect([steam.goto, item.goto].some(goto => goto.mock.calls.length)).toBe(false);
    expect(steam.session.sent.slice(0, 3)).toEqual(["Browser.getWindowForTarget", "minimized", "normal"]);
    expect(steam.session.detach).toHaveBeenCalledTimes(2);
});

it("a window that becomes visible a moment later does not switch the operator to another tab", async () => {
    let checks = 0;
    const steam = tab(() => false), item = tab(() => ++checks > 1);
    const { chrome } = makeChrome([steam, item]);
    await chrome.focus();
    expect(item.bringToFront).toHaveBeenCalledTimes(1);
    expect(steam.bringToFront).not.toHaveBeenCalled();
});

it("a tab that does not answer does not hang Focus", async () => {
    const hung = tab(() => new Promise<boolean>(() => {}));
    const { chrome } = makeChrome([hung]);
    const started = Date.now();
    await chrome.focus();
    expect(Date.now() - started).toBeLessThan(FOCUS_ATTEMPTS * FOCUS_RETRY_MS + 1000);
    expect(hung.bringToFront).toHaveBeenCalledTimes(1);
});

it("a window that cannot be minimized (full screen) is still brought to front", async () => {
    const page = tab(() => true);
    page.session.send.mockRejectedValue(new Error("To minimize a fullscreen window, restore it to normal state first."));
    const { chrome } = makeChrome([page]);
    await chrome.focus();
    expect(page.bringToFront).toHaveBeenCalledTimes(1);
    expect(page.session.detach).toHaveBeenCalledTimes(1);
});

it("a closed main tab is replaced by another live one", async () => {
    const closed = tab(() => false), live = tab(() => false);
    const { chrome } = makeChrome([live], closed);
    await chrome.focus();
    expect(live.bringToFront).toHaveBeenCalledTimes(1);
});

it("a stopped browser is a no-op; failures reach the operator as text", async () => {
    const { chrome } = makeChrome([]);
    const objects = steamAccountManager.objects;
    steamAccountManager.objects = [{ params: { id: "a1" }, chrome }] as any;
    try {
        const event = { reply: jest.fn() };
        await steamAccountFocusBrowser(event as any, "a1");
        expect(event.reply.mock.calls).toEqual([["ERROR", "Error: The browser is running but has no open window. Stop it and start it again."]]);
        chrome.browser = null;
        event.reply.mockClear();
        await steamAccountFocusBrowser(event as any, "a1");
        expect(event.reply).not.toHaveBeenCalled();
    } finally {
        steamAccountManager.objects = objects;
    }
});
