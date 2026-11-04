import "../components/Functions/installConsoleRedaction";
import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';
import CConfirmation from 'steamcommunity/classes/CConfirmation';
import SteamAccountChannels from '../interfaces/IpcChannels/SteamAccountChannels';
import WindowsChannels from '../interfaces/IpcChannels/WindowsChannels';
import { exposeLanguageApi } from './languageBridge';
import ImageChannels from '../interfaces/IpcChannels/ImageChannels';
import { requestImage } from './imageBridge';

/** Методы для работы с беком приложения */
const api = {
  getIcon(accountId: string, url: string) {
    return requestImage(ImageChannels.GET_CONFIRMATION_ICON, { accountId, url });
  },
  getParams(id: string) { ipcRenderer.send(WindowsChannels.GET_CONFIRMATIONS_WINDOW_PARMAS, id); },
  onGetParams(listener: (event: IpcRendererEvent, params: { id: string, steamAccountName: string }) => void) {
    ipcRenderer.on(WindowsChannels.GET_CONFIRMATIONS_WINDOW_PARMAS, listener);
  },
  getConfirmations(id: string) {
    ipcRenderer.send(SteamAccountChannels.STEAM_ACCOUNT_GET_CONFIRMATIONS, id);
  },
  onGetConfirmations(listener: (event: IpcRendererEvent, data: { id: string, confirmations: CConfirmation[] }) => void) {
    ipcRenderer.on(SteamAccountChannels.STEAM_ACCOUNT_GET_CONFIRMATIONS, listener);
  },
  onGetConfirmationsError(listener: (event: IpcRendererEvent, data: { id: string, err: string }) => void) {
    ipcRenderer.on(SteamAccountChannels.STEAM_ACCOUNT_GET_CONFIRMATIONS_ERROR, listener);
  },
  respondConfirmations(
    id: string,
    data: {
      allow: {
        ids: number[],
        keys: string[]
      },
      cancel: {
        ids: number[],
        keys: string[]
      }
    }
  ) {
    ipcRenderer.send(SteamAccountChannels.STEAM_ACCOUNT_CONFIRM, {
      id: id,
      data: data
    });
  },
  onRespondconfirmations(listener: (event: IpcRendererEvent, id: string) => void) {
    ipcRenderer.on(SteamAccountChannels.STEAM_ACCOUNT_CONFIRM, listener);
  }
}

const windowApi = {
  /** Закрыть окно подтверждений*/
  close: (id: string) => { ipcRenderer.send(WindowsChannels.CLOSE_CONFIRMATIONS_WINDOW, id); }
}

/** Платформа для рамки окна: отступ полосы TitleBar под системные кнопки. */
const confirmationsBridge = { api, windowApi, platform: process.platform };

export default confirmationsBridge;

contextBridge.exposeInMainWorld('Confirmations', confirmationsBridge);
exposeLanguageApi();
contextBridge.exposeInMainWorld('getWindowName', () => 'confirmations');
