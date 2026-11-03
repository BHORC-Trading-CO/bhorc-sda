import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';
import LanguageChannels from '../interfaces/IpcChannels/LanguageChannels';
import { Language } from '../interfaces/Language';

/** Язык интерфейса: одинаковый API во всех окнах (window.Language). */
const languageApi = {
    /** Текущий язык; синхронно, чтобы первая отрисовка уже была на нём. */
    get(): Language {
        return ipcRenderer.sendSync(LanguageChannels.GET_LANGUAGE);
    },
    /** Сменить язык; main сохранит его и разошлёт LANGUAGE_CHANGED во все окна, включая это. */
    set(language: Language) {
        ipcRenderer.send(LanguageChannels.SET_LANGUAGE, language);
    },
    /** Подписка на смену языка; возвращает функцию отписки. */
    onChanged(listener: (language: Language) => void) {
        const handler = (event: IpcRendererEvent, language: Language) => listener(language);
        ipcRenderer.on(LanguageChannels.LANGUAGE_CHANGED, handler);
        return () => { ipcRenderer.removeListener(LanguageChannels.LANGUAGE_CHANGED, handler); };
    }
}

export function exposeLanguageApi() {
    contextBridge.exposeInMainWorld('Language', languageApi);
}

export default languageApi;
