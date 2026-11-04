import { ipcRenderer } from 'electron';
import ImageChannels from '../interfaces/IpcChannels/ImageChannels';

let nextId = 0;
const pending = new Map<string, { channel: ImageChannels, finish: (value: string | null) => void }>();
for (const channel of [ImageChannels.GET_AVATAR, ImageChannels.GET_CONFIRMATION_ICON]) {
    // Один listener на канал, а не 200 подписок для таблицы аккаунтов.
    ipcRenderer.on(channel, (_event, response) => {
        const entry = pending.get(response?.requestId);
        if (!entry || entry.channel !== channel) return;
        const value = response.dataUrl;
        entry.finish(typeof value === 'string' && /^data:image\/(?:jpeg|png|gif|webp);base64,[A-Za-z0-9+/]+=*$/.test(value) ? value : null);
    });
}

export function requestImage(channel: ImageChannels, params: { accountId: string, url?: string }): Promise<string | null> {
    return new Promise(resolve => {
        const requestId = String(++nextId);
        // Дедлайн transfer живёт в main. Ожидание очереди для 100–200 аккаунтов
        // может длиться дольше минуты; не отбрасываем поздний успешный ответ.
        const finish = (value: string | null) => {
            pending.delete(requestId);
            resolve(value);
        };
        pending.set(requestId, { channel, finish });
        try { ipcRenderer.send(channel, { ...params, requestId }); }
        catch { finish(null); }
    });
}
