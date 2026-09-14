import MaFileInterface from "../../interfaces/SteamAccount/MaFileInterface";
import SecondaryInterface from "../../interfaces/SteamAccount/SecondaryInterface";

/**
 * SteamID64 аккаунта из maFile.Session.SteamID.
 * В старых maFile SteamID лежит не строкой, а сериализованным BigNumber ({ c: [765, 61198...] }),
 * где c — чанки по 14 цифр; встречается и обычное число. Нет сессии — пустая строка.
 */
export function getSteamID64(maFile?: Partial<MaFileInterface> | null): string {
    const raw: any = maFile && maFile.Session ? maFile.Session.SteamID : undefined;
    if (raw === undefined || raw === null) return "";
    if (typeof raw === "string") return raw.trim();
    if (typeof raw === "number") return String(raw);
    if (typeof raw === "object" && Array.isArray(raw.c) && raw.c.length > 0) {
        return raw.c
            .map((chunk: number, index: number) => index === 0 ? String(chunk) : String(chunk).padStart(14, "0"))
            .join("");
    }
    return "";
}

interface SearchableSteamAccount {
    accountName: string;
    secondary?: Partial<SecondaryInterface> | null;
    maFile?: Partial<MaFileInterface> | null;
}

/**
 * Совпадает ли аккаунт с поисковой строкой: логин, ник Steam или SteamID64.
 * Без учёта регистра; пустая строка совпадает со всеми.
 */
export function matchesSteamAccountSearch(steamAccount: SearchableSteamAccount, searchString: string): boolean {
    const query = searchString.trim().toLowerCase();
    if (!query) return true;
    const haystack = [
        steamAccount.accountName,
        steamAccount.secondary ? steamAccount.secondary.nickname : "",
        getSteamID64(steamAccount.maFile),
    ];
    return haystack.some((value) => !!value && value.toLowerCase().includes(query));
}
