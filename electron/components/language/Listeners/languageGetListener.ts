import { IpcMainEvent } from "electron";
import { getLanguage } from "../languageManager";

// Синхронный: значение уходит в event.returnValue (см. onTrustedSync).
export default (event: IpcMainEvent) => getLanguage();
