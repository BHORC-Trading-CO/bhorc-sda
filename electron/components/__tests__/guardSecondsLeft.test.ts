import guardSecondsLeft from "../../../src/pages/Main/tabs/SteamAccountsTab/components/GuardCode/guardSecondsLeft";

// Коды Steam Guard (TOTP) меняются каждые 30 с по unix-времени. Кольцо обратного отсчёта в
// таблице — одна CSS-анимация на строку, её фаза (отрицательный animation-delay) считается
// отсюда в момент смены кода, без таймеров на каждую строку.
describe("guardSecondsLeft", () => {
    test("start of a period: the full 30 s are left", () => {
        expect(guardSecondsLeft(0)).toBe(30);
        expect(guardSecondsLeft(30_000)).toBe(30);
    });

    test("counts down whole seconds inside the period", () => {
        expect(guardSecondsLeft(1_000)).toBe(29);
        expect(guardSecondsLeft(29_999)).toBe(1);
    });

    test("real unix time", () => {
        expect(guardSecondsLeft(1_793_801_039_000)).toBe(30 - (1_793_801_039 % 30));
    });

    test("always in 1..period, also for a custom period", () => {
        for (let ms = 0; ms < 120_000; ms += 250) {
            const left = guardSecondsLeft(ms);
            expect(left).toBeGreaterThanOrEqual(1);
            expect(left).toBeLessThanOrEqual(30);
        }
        expect(guardSecondsLeft(0, 60)).toBe(60);
        expect(guardSecondsLeft(59_000, 60)).toBe(1);
    });
});
