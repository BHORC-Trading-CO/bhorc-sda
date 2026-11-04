import steamAccountManager from "../steamAccountManager";

export default async (event: Electron.IpcMainEvent, id: string) => {
    try {
        await steamAccountManager.delete(id);
    } catch (err) {
        event.reply('ERROR', err);
    }
}
