import sanitizeSmaFile from "../sanitizeSmaFile";
import { formatRegistrationDate, isRegistrationDate } from "../registrationDate";

// SDA-58: дата регистрации хранится как "YYYY-MM-DD" и проходит через импорт/экспорт .smaFile.
const NOW = Date.UTC(2026, 10, 25);

const account = (registeredAt: unknown) => ({
    accountName: "test-account", password: "test-password",
    secondary: { nickname: "Name", level: 1, registeredAt },
    maFile: { shared_secret: "shared", account_name: "test-account" },
});

describe("registration date", () => {
    it("принимает только реальную дату от запуска Steam до сегодняшнего дня", () => {
        expect(isRegistrationDate("2012-03-04", NOW)).toBe(true);
        expect(isRegistrationDate("2003-09-12", NOW)).toBe(true);
        expect(isRegistrationDate("2026-11-25", NOW)).toBe(true);
        for (const value of ["2002-12-31", "2027-01-01", "2012-02-30", "2012-13-01", "2012-3-4", "04.03.2012", "", null, 1330819200, {}]) {
            expect(isRegistrationDate(value, NOW)).toBe(false);
        }
    });

    it("показывает дату на языке интерфейса и не сдвигает день из-за часового пояса", () => {
        expect(formatRegistrationDate("2012-03-04", "en")).toBe("Mar 4, 2012");
        expect(formatRegistrationDate("2012-03-04", "uk")).toMatch(/^4 бер\. 2012/);
        expect(formatRegistrationDate("2012-03-04", "ru")).toMatch(/^4 мар\. 2012/);
        expect(formatRegistrationDate(null, "en")).toBe("");
        expect(formatRegistrationDate("garbage", "en")).toBe("");
    });

    it(".smaFile переносит дату регистрации, а мусор превращает в «неизвестно»", () => {
        expect(sanitizeSmaFile(account("2012-03-04")).secondary.registeredAt).toBe("2012-03-04");
        expect(sanitizeSmaFile(account(undefined)).secondary.registeredAt).toBeNull();
        expect(sanitizeSmaFile(account("March 4, 2012")).secondary.registeredAt).toBeNull();
        expect(sanitizeSmaFile(account(1330819200)).secondary.registeredAt).toBeNull();
    });
});
