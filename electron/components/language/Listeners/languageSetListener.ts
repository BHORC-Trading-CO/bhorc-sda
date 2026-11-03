import { IpcMainEvent } from "electron";
import { setLanguage } from "../languageManager";

export default (event: IpcMainEvent, language: unknown) => {
    try {
        if (!setLanguage(language)) console.warn(`Отклонён неизвестный язык интерфейса: ${String(language).slice(0, 16)}`);
    } catch (err) {
        event.reply('ERROR', err);
    }
}
