import steamAccountManager from "../steamAccountManager";
import groupManager from "../../Group/groupManager";

export default async (event: Electron.IpcMainEvent, id: string) => {
    try {
        await steamAccountManager.delete(id);
        // Счётчик группы считает её аккаунты
        groupManager.sendGroupsToFront();
    } catch (err) {
        event.reply('ERROR', err);
    }
}
