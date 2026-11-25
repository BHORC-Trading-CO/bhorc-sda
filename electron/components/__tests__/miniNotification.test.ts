// SDA-64: каждое уведомление живёт своё время. Пришедшие подряд раньше ставили по таймеру каждое,
// и таймер прежнего закрывал новое.
jest.mock("../../../src/store/store", () => ({ __esModule: true, default: {} }));
import WindowsStore from "../../../src/store/WindowStore";

const toast = (text: string) => ({ text, type: "info" as const });
let windows: WindowsStore;
// Мелкими шагами: продолжение после await должно выполниться в свой момент, а не в конце интервала.
const advance = async (ms: number) => {
    for (let passed = 0; passed < ms; passed += 10) {
        jest.advanceTimersByTime(10);
        for (let i = 0; i < 5; i++) await Promise.resolve();
    }
};
beforeEach(() => {
    jest.useFakeTimers();
    jest.spyOn(console, "log").mockImplementation(() => {});
    jest.spyOn(console, "warn").mockImplementation(() => {});
    windows = new WindowsStore({} as any);
});
afterEach(() => { jest.useRealTimers(); jest.restoreAllMocks(); });

it("overlapping calls leave one notification with its own five seconds", async () => {
    windows.openMiniNotification(toast("first"));
    await advance(100);
    windows.openMiniNotification(toast("second"));
    await advance(200);
    expect([windows.isMiniNotificationOpen, windows.miniNotificationContent.text]).toEqual([true, "second"]);
    await advance(4950);
    expect(windows.isMiniNotificationOpen).toBe(true);
    await advance(60);
    expect(windows.isMiniNotificationOpen).toBe(false);
});

it("a replacement is not hidden by the timer of the previous one", async () => {
    windows.openMiniNotification(toast("first"));
    await advance(200);
    await advance(4900);
    windows.openMiniNotification(toast("second"));
    await advance(200);
    expect(windows.miniNotificationContent.text).toBe("second");
    await advance(4900);
    expect(windows.isMiniNotificationOpen).toBe(true);
    await advance(200);
    expect(windows.isMiniNotificationOpen).toBe(false);
    expect(jest.getTimerCount()).toBe(0);
});

it("shows and hides inside mobx actions", async () => {
    const { configure } = require("mobx");
    configure({ enforceActions: "always" });
    try {
        windows.openMiniNotification(toast("text"));
        await advance(200);
        expect(windows.isMiniNotificationOpen).toBe(true);
        await advance(5010);
        expect(windows.isMiniNotificationOpen).toBe(false);
        expect((console.warn as jest.Mock).mock.calls.filter(([text]) => String(text).includes("[MobX]"))).toEqual([]);
    } finally {
        configure({ enforceActions: "observed" });
    }
});
