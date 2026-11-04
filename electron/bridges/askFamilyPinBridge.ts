import "../components/Functions/installConsoleRedaction";
import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';
import InfoType from "../components/application/askInfo/InfoType";
import WindowsChannels from "../interfaces/IpcChannels/WindowsChannels";
import AskSomethingChannels from "../interfaces/IpcChannels/AskSomethigChannels";
import { exposeLanguageApi } from './languageBridge';

/** Методы для работы с беком приложения */
const askFamilyPinApi = {
    onGetParams(func: (event: any, data: { id: string, steamAccountName: string, infoType: InfoType }) => void) {
        ipcRenderer.on(WindowsChannels.GET_ASK_WINDOW_PARAMS, func);
    },
    sendData(id: string, data: string) {
        ipcRenderer.send(AskSomethingChannels.ASK_WINDOW_SEND_DATA, { id, data });
    },
    abort(id: string) {
        ipcRenderer.send(AskSomethingChannels.ASK_WINDOW_ABORT_SENDING_DATA, id);
    }
}

const windowApi = {
    /** Закрыть окно с вопросом */
    close: (id: string) => {
        ipcRenderer.send(WindowsChannels.CLOSE_ASK_WINDOW, id);
    },
}

/** Платформа для рамки окна: отступ полосы TitleBar под системные кнопки. */
const askFamilyPinBridge = { askFamilyPinApi, windowApi, platform: process.platform };

export default askFamilyPinBridge;

contextBridge.exposeInMainWorld('AskFamilyPin', askFamilyPinBridge);
exposeLanguageApi();
contextBridge.exposeInMainWorld('getWindowName', () => 'askFamilyPin');