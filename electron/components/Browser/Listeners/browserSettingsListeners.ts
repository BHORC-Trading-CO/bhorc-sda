import { BrowserWindow, dialog, IpcMainEvent, OpenDialogOptions } from "electron";
import BrowserChannels from "../../../interfaces/IpcChannels/BrowserChannels";
import BrowserSettingsStorage from "../../newStorage/BrowserSettingsStorage";
import { addExtensionDir, buildBrowserSettingsView, validateSettingsUpdate } from "../browserSettings";
import { t } from "../../../i18n";

function replySettings(event: IpcMainEvent) {
    event.reply(BrowserChannels.BROWSER_SETTINGS_GET, buildBrowserSettingsView(BrowserSettingsStorage.Get()));
}

function replyError(event: IpcMainEvent, err: unknown) {
    event.reply(BrowserChannels.BROWSER_SETTINGS_ERROR, err instanceof Error ? err.message : String(err));
}

export function browserSettingsGetListener(event: IpcMainEvent) {
    try {
        replySettings(event);
    } catch (err) {
        replyError(event, err);
    }
}

/** Сохранение со страницы. При отказе страница получает текст ошибки и сохранённое состояние обратно. */
export function browserSettingsSaveListener(event: IpcMainEvent, incoming: unknown) {
    try {
        const update = validateSettingsUpdate(incoming, BrowserSettingsStorage.Get());
        if (update.ok) BrowserSettingsStorage.Save(update.settings);
        else replyError(event, update.error);
        replySettings(event);
    } catch (err) {
        replyError(event, err);
    }
}

/**
 * Папку расширения выбирают только в нативном диалоге main: путь не набирается в renderer.
 * Ответ приходит и при отмене — страница снимает состояние «выбор папки».
 */
export async function browserPickExtensionListener(event: IpcMainEvent) {
    try {
        const options: OpenDialogOptions = {
            title: t("browser.pickExtension.title"),
            message: t("browser.pickExtension.message"),
            buttonLabel: t("browser.pickExtension.button"),
            properties: ["openDirectory"],
        };
        const parent = BrowserWindow.fromWebContents(event.sender);
        const result = parent ? await dialog.showOpenDialog(parent, options) : await dialog.showOpenDialog(options);
        if (!result.canceled && result.filePaths.length) {
            const update = addExtensionDir(result.filePaths[0], BrowserSettingsStorage.Get());
            if (update.ok) BrowserSettingsStorage.Save(update.settings);
            else replyError(event, update.error);
        }
        replySettings(event);
    } catch (err) {
        replyError(event, err);
        try {
            replySettings(event);
        } catch {}
    }
}
