import "../components/Functions/installConsoleRedaction";
import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';
import WindowsChannels from '../interfaces/IpcChannels/WindowsChannels';
import { exposeLanguageApi } from './languageBridge';
import replayLast from './replayLast';

const onGetParams = replayLast<{ id: string, title: string, text: string }>(WindowsChannels.GET_ERROR_WINDOW_PARAMS);

const windowApi = {
    close: (id: string) => { ipcRenderer.send(WindowsChannels.CLOSE_ERROR_WINDOW, id); },
    onGetParams: (listener: (event: IpcRendererEvent, data: { id: string, title: string, text: string }) => void) => {
        return onGetParams(listener);
    }
}

/** Платформа для рамки окна: отступ полосы TitleBar под системные кнопки. */
const errorWindowBridge = { windowApi, platform: process.platform };

export default errorWindowBridge;

contextBridge.exposeInMainWorld('ErrorWindow', errorWindowBridge);
exposeLanguageApi();
contextBridge.exposeInMainWorld('getWindowName', () => 'error');
