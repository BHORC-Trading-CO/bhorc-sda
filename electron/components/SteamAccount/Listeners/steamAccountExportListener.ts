import steamAccountManager from "../steamAccountManager";
import Manager from "../../Manager/Manager";
import SmaFileInterface from "../../../interfaces/SteamAccount/SmaFileInterface";
import convertMaFileToStr from "../../Functions/converMaFileToStr";
import portableFileName from "../../Functions/portableFileName";
import { getSteamID64 } from "../../Functions/steamAccountSearch";
import { t } from "../../../i18n";

export type ExportedFile = { fileName: string, content: string } | { error: string };

/**
 * Файл экспорта — из живого аккаунта в момент клика (SDA-62). Раньше окно сохраняло снимок из
 * последнего списка: сразу после правки или обновления сессии копия была со старыми паролем,
 * maFile или сессией.
 */
export default (_event: unknown, { id, kind }: { id: string, kind: "maFile" | "smaFile" }): ExportedFile => {
    try {
        const steamAccount = steamAccountManager.getById(id);
        if (!steamAccount) throw new Error(t("errors.steamAccountNotFound", { id }));
        const { accountName, maFile } = steamAccount.params;
        if (kind === "maFile") {
            const steamId = getSteamID64(maFile);
            return { fileName: `${/^\d{17}$/.test(steamId) ? steamId : portableFileName(accountName)}.maFile`, content: convertMaFileToStr(maFile) };
        }
        // round-trip: вкладываем привязанный прокси (только setup-поля, без локальных id/number/deleted).
        // Привязка к пропавшему прокси — не «без прокси»: помечаем, чтобы импорт спросил маршрут.
        const { proxy, proxyState } = Manager.GetSteamAccountLinkedData(id);
        const route: Partial<SmaFileInterface> = proxyState === "missing" || steamAccount.proxyState === "missing"
            ? { proxyMissing: true }
            : proxy ? { proxy: { host: proxy.host, port: proxy.port, username: proxy.username, password: proxy.password } } : {};
        return { fileName: `${portableFileName(accountName)}.smaFile`, content: JSON.stringify({ ...steamAccount.getSmaFile(), ...route }) };
    } catch (err) {
        return { error: err instanceof Error ? err.message : String(err) };
    }
}
