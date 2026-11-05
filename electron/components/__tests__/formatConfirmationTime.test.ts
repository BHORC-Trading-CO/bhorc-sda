import formatConfirmationTime from "../../../src/pages/Confirmations/SellItem/formatConfirmationTime";

// Время подтверждения из steamcommunity — ISO-строка в UTC; в окне подтверждений она была
// видна как есть ("2026-11-05T07:57:22.161Z"). Точный вид даты зависит от версии ICU,
// поэтому проверяем части, а не всю строку.
const ISO = "2026-11-05T07:57:22.161Z";
const flat = (s: string) => s.replace(/\s/g, " ");

describe("formatConfirmationTime", () => {
    test("no raw ISO string in any interface language", () => {
        for (const lang of ["en", "uk", "ru"]) {
            const out = formatConfirmationTime(ISO, lang, "UTC");
            expect(out).not.toContain("T07:57");
            expect(out).not.toContain(".161Z");
            expect(out).toContain("2026");
        }
    });

    test("24-hour time for uk and ru, 12-hour for en", () => {
        expect(flat(formatConfirmationTime(ISO, "uk", "UTC"))).toContain("07:57");
        expect(flat(formatConfirmationTime(ISO, "ru", "UTC"))).toContain("07:57");
        expect(flat(formatConfirmationTime(ISO, "en", "UTC"))).toMatch(/7:57 AM/);
    });

    test("shown in the given time zone, not in UTC", () => {
        // Asia/Tokyo: UTC+9 без перехода на летнее время, есть в любой версии ICU.
        expect(flat(formatConfirmationTime(ISO, "uk", "Asia/Tokyo"))).toContain("16:57");
    });

    test("an unparsable or empty value is shown as is", () => {
        expect(formatConfirmationTime("not a date", "uk")).toBe("not a date");
        expect(formatConfirmationTime("", "uk")).toBe("");
    });

    test("an unknown language falls back instead of throwing", () => {
        expect(() => formatConfirmationTime(ISO, "zz-invalid-@@")).not.toThrow();
        expect(formatConfirmationTime(ISO, "zz-invalid-@@")).not.toContain("T07:57");
    });
});
