import "../components/Functions/installConsoleRedaction";
import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';
import WindowsChannels from '../interfaces/IpcChannels/WindowsChannels';
import { exposeLanguageApi } from './languageBridge';

const windowApi = {
    close: (id: string) => { ipcRenderer.send(WindowsChannels.CLOSE_ERROR_WINDOW, id); },
    onGetParams: (listener: (event: IpcRendererEvent, data: { id: string, title: string, text: string }) => void) => {
        ipcRenderer.on(WindowsChannels.GET_ERROR_WINDOW_PARAMS, listener);
    }
}

/** Платформа для рамки окна: отступ полосы TitleBar под системные кнопки. */
const errorWindowBridge = { windowApi, platform: process.platform };

export default errorWindowBridge;

contextBridge.exposeInMainWorld('ErrorWindow', errorWindowBridge);
exposeLanguageApi();
contextBridge.exposeInMainWorld('getWindowName', () => 'error');
