import MaFileInterface from "../../../interfaces/SteamAccount/MaFileInterface";
import { getSteamID64 } from "../../Functions/steamAccountSearch";
import { t } from "../../../i18n";

// Только SteamID64 обычного аккаунта (весь диапазон 32-битных accountid): "0" и прочие заглушки чужих
// инструментов ни о чём не говорят. Длина одна, поэтому строки сравниваются как числа.
const steamId64 = (value: unknown): string | null =>
    typeof value === "string" && /^\d{17}$/.test(value) && value > "76561197960265728" && value <= "76561202255233023" ? value : null;

/** SteamID64 из JWT Steam (поле sub); null, если токен не прочитать. */
function tokenSteamId(token: unknown): string | null {
    if (typeof token !== "string") return null;
    try {
        return steamId64(JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8"))?.sub);
    } catch {
        return null;
    }
}

const login = (value: unknown) => typeof value === "string" ? value.trim().toLowerCase() : "";

/** В maFile нет логина: по одному файлу не сказать, чей он. */
export const isNameless = (maFile?: Partial<MaFileInterface> | null) => !login(maFile?.account_name);

/**
 * Логин, maFile и его сессия — один и тот же аккаунт Steam (SDA-62). Раньше под логином A сохранялся
 * maFile аккаунта B, и окно подтверждений с именем A подтверждало трейды B.
 * Отклоняем только противоречие: без account_name или SteamID сравнивать не с чем.
 * loggedInAs — SteamID, который вернул сам Steam после входа по паролю. Тогда maFile без account_name
 * должен быть доказан: его SteamID совпал с этим или Steam принял код из его shared_secret.
 */
export default function assertSameAccount(accountName: string, maFile?: Partial<MaFileInterface> | null, loggedInAs?: string, guardCodeAccepted = false) {
    const maFileLogin = login(maFile?.account_name);
    if (maFileLogin && maFileLogin !== login(accountName)) {
        throw new Error(t("errors.identity.login", { login: accountName, maFile: maFile!.account_name }));
    }
    const own = [
        steamId64(getSteamID64(maFile)),
        tokenSteamId(maFile?.Session?.AccessToken),
        tokenSteamId(maFile?.Session?.RefreshToken),
    ].filter(Boolean);
    const ids = new Set([...own, steamId64(loggedInAs)].filter(Boolean));
    if (ids.size > 1) throw new Error(t("errors.identity.steamId", { login: accountName, ids: [...ids].join(", ") }));
    if (loggedInAs !== undefined && isNameless(maFile) && !own.length && !guardCodeAccepted) {
        throw new Error(t("errors.identity.unproven", { login: accountName }));
    }
}
