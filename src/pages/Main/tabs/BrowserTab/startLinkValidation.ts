// Проверка стартовой ссылки на странице Browser — только ради подсказки под полем. Решает main
// (electron/components/Browser/browserSettings.ts) с тем же правилом; совпадение проверяет
// electron/components/Browser/__tests__/browserSettings.test.ts.

export const DEFAULT_START_LINK = "https://steamcommunity.com/my/";
export const MAX_START_LINKS = 10;
const MAX_START_LINK_LENGTH = 2048;

export type StartLinkError = "empty" | "invalid" | "duplicate" | "tooMany";

export function isValidStartLink(value: string): boolean {
    if (value.length === 0 || value.length > MAX_START_LINK_LENGTH) return false;
    if (/[\s\u0000-\u001f\u007f]/.test(value)) return false;
    if (!/^https?:\/\//i.test(value)) return false;
    try {
        const url = new URL(value);
        return (url.protocol === "http:" || url.protocol === "https:") && url.hostname.length > 0;
    } catch {
        return false;
    }
}

/**
 * value — уже без пробелов по краям; others — остальные ссылки списка (без редактируемой);
 * isNew — добавление, а не правка: только оно упирается в лимит.
 */
export function startLinkError(value: string, others: readonly string[], isNew: boolean): StartLinkError | null {
    if (!value) return "empty";
    if (isNew && others.length >= MAX_START_LINKS) return "tooMany";
    if (!isValidStartLink(value)) return "invalid";
    if (others.includes(value)) return "duplicate";
    return null;
}
