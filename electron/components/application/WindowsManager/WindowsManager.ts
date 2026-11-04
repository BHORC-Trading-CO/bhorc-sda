import path from 'path';
import { BrowserWindow, IpcMainEvent } from 'electron';
import windowsConfig from './windowsConfig';
import { windowChrome } from './windowChrome';
import WindowChannels from '../../../interfaces/IpcChannels/WindowsChannels';
import InfoType from '../askInfo/InfoType';
import AskSomethingChannels from '../../../interfaces/IpcChannels/AskSomethigChannels';
import { v4 as uuidv4 } from 'uuid';
import { getAppEntries } from '../appEntries';
import { isAppUrl } from '../navigationGuard';
import { onTrusted } from '../trustedIpc';
import { t } from '../../../i18n';

declare const MAIN_WINDOW_WEBPACK_ENTRY: string;
declare const MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY: string;
declare const ASK_FAMILY_PIN_WINDOW_WEBPACK_ENTRY: string;
declare const ASK_FAMILY_PIN_WINDOW_PRELOAD_WEBPACK_ENTRY: string;
declare const CONFIRMATIONS_WINDOW_WEBPACK_ENTRY: string;
declare const CONFIRMATIONS_WINDOW_PRELOAD_WEBPACK_ENTRY: string;
declare const AUTH_WINDOW_WEBPACK_ENTRY: string;
declare const AUTH_WINDOW_PRELOAD_WEBPACK_ENTRY: string;
declare const ERROR_WINDOW_WEBPACK_ENTRY: string;
declare const ERROR_WINDOW_PRELOAD_WEBPACK_ENTRY: string;

class WindowsManager {
    authWindow: BrowserWindow | null;
    mainWindow: BrowserWindow | null;
    askWindows: { [id: string]: BrowserWindow };
    confirmationsWindows: { [id: string]: BrowserWindow };
    errorWindows: { [id: string]: BrowserWindow };

    constructor() {
        this.authWindow = null;
        this.mainWindow = null;
        this.askWindows = {};
        this.confirmationsWindows = {};
        this.errorWindows = {};
    }

    /** Живые окна приложения, в которых открыта страница приложения (не чужая).
     *  Берём все BrowserWindow, а не карты менеджера: второе окно ввода для того же
     *  аккаунта перезаписывает запись в askWindows, но остаётся открытым. Браузеры
     *  puppeteer — отдельные процессы Chromium, а не BrowserWindow, сюда не попадают. */
    getAppWindows(): BrowserWindow[] {
        return BrowserWindow.getAllWindows().filter((win) =>
            !win.isDestroyed() && isAppUrl(win.webContents.getURL(), getAppEntries()));
    }
    /** Отправить событие во все окна приложения (например, смену языка). */
    broadcast(channel: string, payload: unknown) {
        for (const win of this.getAppWindows()) win.webContents.send(channel, payload);
    }
    createErrorWindow(title: string, text: string) {
        const winId = uuidv4();
        this.errorWindows[winId] = new BrowserWindow({
            ...windowsConfig.errorWindow,
            ...windowChrome(process.platform),
            icon: path.join(__dirname, "../renderer/assets/newIcon.png"),
            webPreferences: {
                nodeIntegration: false,
                contextIsolation: true,
                spellcheck: false,
                preload: ERROR_WINDOW_PRELOAD_WEBPACK_ENTRY
            }
        });
        this.errorWindows[winId].webContents.on('dom-ready', () => {
            setTimeout(async () => {
                const errorWindow = this.errorWindows[winId];
                if (!errorWindow || errorWindow.isDestroyed() || !isAppUrl(errorWindow.webContents.getURL(), getAppEntries())) return;
                errorWindow.webContents.send(WindowChannels.GET_ERROR_WINDOW_PARAMS, { id: winId, title, text  });
            }, 50);
        });
        // Системная кнопка закрытия не проходит через closeErrorWindowListener: освобождаем запись здесь.
        this.errorWindows[winId].on('closed', () => {
            delete (this.errorWindows[winId]);
        });
        this.errorWindows[winId].focus();
        this.errorWindows[winId].loadURL(ERROR_WINDOW_WEBPACK_ENTRY);
    }
    createAuthWindow() {
        this.authWindow = new BrowserWindow({
            ...windowsConfig.authWindow,
            ...windowChrome(process.platform),
            icon: path.join(__dirname, "../renderer/assets/newIcon.png"),
            webPreferences: {
                nodeIntegration: false,
                contextIsolation: true,
                spellcheck: false,
                preload: AUTH_WINDOW_PRELOAD_WEBPACK_ENTRY
            }
        });
        this.authWindow.loadURL(AUTH_WINDOW_WEBPACK_ENTRY);
    }
    createMain() {
        this.mainWindow = new BrowserWindow({
            ...windowsConfig.mainWindow,
            ...windowChrome(process.platform),
            icon: path.join(__dirname, "../renderer/assets/newIcon.png"),
            webPreferences: {
                nodeIntegration: false,
                contextIsolation: true,
                spellcheck: false,
                preload: MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY
            }
        });
        this.mainWindow.loadURL(MAIN_WINDOW_WEBPACK_ENTRY);
    }
    createConfirmationsWindow(id: string, steamAccountName: string) {
        return new Promise((resolve) => {
            const confirmationsWindow = new BrowserWindow({
                ...windowsConfig.confirmationsWindow,
                ...windowChrome(process.platform),
                icon: path.join(__dirname, "../renderer/assets/confirmationsIcon.png"),
                webPreferences: {
                    nodeIntegration: false,
                    contextIsolation: true,
                    spellcheck: false,
                    preload: CONFIRMATIONS_WINDOW_PRELOAD_WEBPACK_ENTRY
                }
            });
            this.confirmationsWindows[id] = confirmationsWindow;
            confirmationsWindow.loadURL(CONFIRMATIONS_WINDOW_WEBPACK_ENTRY);
            confirmationsWindow.webContents.on('dom-ready', () => {
                setTimeout(async () => {
                    if (confirmationsWindow.isDestroyed() || !isAppUrl(confirmationsWindow.webContents.getURL(), getAppEntries())) return;
                    confirmationsWindow.webContents.send(WindowChannels.GET_CONFIRMATIONS_WINDOW_PARMAS, { id, steamAccountName });
                    resolve(confirmationsWindow);
                }, 50);
            });
            confirmationsWindow.on('close', () => {
                delete (this.confirmationsWindows[id]);
            });
        });
    }
    createAskWindow(id: string, steamAccountName: string, infoType: InfoType): Promise<BrowserWindow> {
        return new Promise((resolve, reject) => {
            const askWindow = new BrowserWindow({
                ...windowsConfig.askPinWindow,
                ...windowChrome(process.platform),
                icon: path.join(__dirname, "../renderer/assets/newIcon.png"),
                webPreferences: {
                    nodeIntegration: false,
                    contextIsolation: true,
                    spellcheck: false,
                    preload: ASK_FAMILY_PIN_WINDOW_PRELOAD_WEBPACK_ENTRY
                }
            });
            askWindow.loadURL(ASK_FAMILY_PIN_WINDOW_WEBPACK_ENTRY);
            askWindow.webContents.on('dom-ready', () => {
                setTimeout(() => {
                    if (askWindow.isDestroyed() || !isAppUrl(askWindow.webContents.getURL(), getAppEntries())) return;
                    askWindow.webContents.send(WindowChannels.GET_ASK_WINDOW_PARAMS, { id, steamAccountName, infoType });
                    resolve(askWindow);
                }, 50);
            });
            // Системные кнопки окна видны до загрузки страницы: закрытое до отправки параметров окно
            // не дождётся dom-ready. Отмена без причины, как и при закрытии позже (askSomething);
            // после resolve этот reject ничего не меняет.
            askWindow.once('closed', () => {
                if (this.askWindows[id] === askWindow) delete (this.askWindows[id]);
                reject();
            });
            this.askWindows[id] = askWindow;
        });
    }
    askSomething(accountId: string, accountName: string, infoType: InfoType): Promise<any> {
        return new Promise<any>(async (resolve, reject) => {
            let askPinWindow: BrowserWindow;
            try {
                askPinWindow = await this.createAskWindow(accountId, accountName, infoType);
            } catch (err) {
                // Закрытие до загрузки приходит без причины (отмена); ошибку создания окна
                // передаём вызывающему как есть.
                return reject(err);
            }
            let isGetInfo = false;

            const askFunc = (event: IpcMainEvent, data: { id: string, data: any }) => {
                try {
                    if (data.id != accountId) return;
                    removeListener();
                    removeErrorListener();
                    isGetInfo = true;
                    askPinWindow.close();
                    resolve(data.data);
                } catch (err) {
                    reject(err);
                }
            }
            const abortFunc = (event: IpcMainEvent, id: string) => {
                if (id != accountId) return;
                removeListener();
                removeErrorListener();
                askPinWindow.close();
                delete (this.askWindows[accountId]);
                reject(t(`errors.askAborted.${infoType}`));
            }
            const removeListener = onTrusted(AskSomethingChannels.ASK_WINDOW_SEND_DATA, askFunc);
            const removeErrorListener = onTrusted(AskSomethingChannels.ASK_WINDOW_ABORT_SENDING_DATA, abortFunc);

            askPinWindow.on('close', () => {
                removeListener();
                removeErrorListener();
                delete (this.askWindows[accountId]);
                if (!isGetInfo) reject();
            });
        });
    }
}

export default WindowsManager;
