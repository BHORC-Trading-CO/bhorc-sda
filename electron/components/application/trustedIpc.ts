import { ipcMain, IpcMainEvent, IpcMainInvokeEvent } from 'electron';
import { getAppEntries } from './appEntries';
import { isAppUrl } from './navigationGuard';

type Listener = (event: IpcMainEvent, ...args: any[]) => void;
type InvokeHandler = (event: IpcMainInvokeEvent, ...args: any[]) => any;

function isTrusted(channel: string, event: IpcMainEvent | IpcMainInvokeEvent): boolean {
    try {
        if (isAppUrl(event.senderFrame?.url ?? '', getAppEntries())) return true;
    } catch {
        // Фрейм мог быть уничтожен до обработки IPC.
    }
    console.warn(`Отклонён IPC от недоверенного отправителя: ${channel}`);
    return false;
}

export function onTrusted(channel: string, handler: Listener): () => void {
    const listener: Listener = (event, ...args) => {
        if (isTrusted(channel, event)) handler(event, ...args);
    };
    ipcMain.on(channel, listener);
    // Удаляем именно обёртку, а не исходный обработчик.
    return () => { ipcMain.removeListener(channel, listener); };
}

export function onceTrusted(channel: string, handler: Listener): () => void {
    const listener: Listener = (event, ...args) => {
        if (!isTrusted(channel, event)) return;
        // Чужое событие не расходует подписку; удаляем до вызова обработчика.
        ipcMain.removeListener(channel, listener);
        handler(event, ...args);
    };
    ipcMain.on(channel, listener);
    return () => { ipcMain.removeListener(channel, listener); };
}

export function handleTrusted(channel: string, handler: InvokeHandler): void {
    ipcMain.handle(channel, (event, ...args) => {
        if (isTrusted(channel, event)) return handler(event, ...args);
    });
}
