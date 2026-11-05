// steamcommunity отдаёт время подтверждения ISO-строкой в UTC ("2026-11-05T07:57:22.161Z"):
// показываем его в местном времени и на языке интерфейса, а непонятную строку — как есть.
export default function formatConfirmationTime(time: string, language: string, timeZone?: string): string {
    if (!time) return "";
    const date = new Date(time);
    if (Number.isNaN(date.getTime())) return time;
    try {
        return new Intl.DateTimeFormat(language, { dateStyle: "medium", timeStyle: "short", timeZone }).format(date);
    } catch {
        return date.toLocaleString();
    }
}
