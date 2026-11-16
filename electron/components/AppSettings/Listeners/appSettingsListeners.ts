import { IpcMainEvent } from "electron";
import AppSettingsChannels from "../../../interfaces/IpcChannels/AppSettingsChannels";
import backgroundMode from "../backgroundMode";

function replyView(event: IpcMainEvent) {
    event.reply(AppSettingsChannels.APP_SETTINGS_GET, backgroundMode.view());
}

function replyError(event: IpcMainEvent, err: unknown) {
    event.reply(AppSettingsChannels.APP_SETTINGS_ERROR, { message: err instanceof Error ? err.message : String(err) });
}

export function appSettingsGetListener(event: IpcMainEvent) {
    try {
        replyView(event);
    } catch (err) {
        replyError(event, err);
    }
}

/** Save from the Settings page. On refusal the page gets the reason and the saved state back. */
export function appSettingsSaveListener(event: IpcMainEvent, incoming: unknown) {
    try {
        const result = backgroundMode.update(incoming);
        if (!result.ok) event.reply(AppSettingsChannels.APP_SETTINGS_ERROR, { message: result.message });
        replyView(event);
    } catch (err) {
        replyError(event, err);
        try {
            replyView(event);
        } catch {}
    }
}
