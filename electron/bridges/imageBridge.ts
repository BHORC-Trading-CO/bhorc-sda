import { ipcRenderer } from 'electron';
import { randomBytes } from 'crypto';
import ImageChannels from '../interfaces/IpcChannels/ImageChannels';

let nextId = 0;
const documentId = randomBytes(16).toString('hex');
const pending = new Map<string, { channel: ImageChannels, accountId: string, url: string | null, finish: (value: string | null) => void }>();
for (const channel of [ImageChannels.GET_AVATAR, ImageChannels.GET_CONFIRMATION_ICON]) {
    // Один listener на канал, а не 200 подписок для таблицы аккаунтов.
    ipcRenderer.on(channel, (_event, response) => {
        const entry = pending.get(response?.requestId);
        if (!entry || entry.channel !== channel || entry.accountId !== response.accountId || entry.url !== response.url) return;
        const value = response.dataUrl;
        entry.finish(typeof value === 'string' && /^data:image\/(?:jpeg|png|gif|webp);base64,[A-Za-z0-9+/]+=*$/.test(value) ? value : null);
    });
}

export function requestImage(channel: ImageChannels, params: { accountId: string, url?: string }): Promise<string | null> {
    return new Promise(resolve => {
        const requestId = `${documentId}:${++nextId}`;
        const url = channel === ImageChannels.GET_AVATAR ? null : params.url ?? null;
        if (channel !== ImageChannels.GET_AVATAR && typeof url !== 'string') { resolve(null); return; }
        // Дедлайн transfer живёт в main. Ожидание очереди для 100–200 аккаунтов
        // может длиться дольше минуты; не отбрасываем поздний успешный ответ.
        const finish = (value: string | null) => {
            pending.delete(requestId);
            resolve(value);
        };
        pending.set(requestId, { channel, accountId: params.accountId, url, finish });
        try { ipcRenderer.send(channel, { accountId: params.accountId, url, requestId }); }
        catch { finish(null); }
    });
}
