// Дата регистрации аккаунта Steam (SDA-58) хранится строкой "YYYY-MM-DD" без часового пояса:
// Steam отдаёт только день. Здесь нет импортов Node и Steam — файл берёт и рендерер (таблица).

const DAY_MS = 24 * 60 * 60 * 1000;

// "YYYY-MM-DD" реальной даты не раньше запуска Steam (2003) и не из будущего (сутки запаса на пояса).
export function isRegistrationDate(value: unknown, now: number = Date.now()): value is string {
    if (typeof value !== "string") return false;
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (!match) return false;
    const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
    const date = new Date(Date.UTC(year, month - 1, day));
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return false;
    return year >= 2003 && date.getTime() <= now + DAY_MS;
}

// Дата на языке интерфейса ("4 мар. 2012 г.", "Mar 4, 2012"). Считаем в UTC, иначе в поясах
// западнее Гринвича день съезжал бы на предыдущий. Неизвестная дата — пустая строка.
export function formatRegistrationDate(value: unknown, language: string): string {
    if (!isRegistrationDate(value)) return "";
    const [year, month, day] = value.split("-").map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    try {
        return new Intl.DateTimeFormat(language, { dateStyle: "medium", timeZone: "UTC" }).format(date);
    } catch {
        return value;
    }
}
