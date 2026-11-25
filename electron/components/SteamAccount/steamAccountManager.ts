import SteamAccountInterface from "../../interfaces/SteamAccount/SteamAccountInterface";
import SteamAccount from "./SteamAccount";
import CompiledSteamAccountInterface from "../../interfaces/SteamAccount/CompiledSteamAccountInterface";
import SteamAccountStorage from "../newStorage/SteamAccountStorage";
import Manager from "../Manager/Manager";
import application from "../application/application";
import SteamAccountChannels from "../../interfaces/IpcChannels/SteamAccountChannels";
import errorsToStrings from "../Functions/errorsToStrings";

export class SteamAccountManager {
    objects: SteamAccount[];

    constructor() {
        this.objects = [];
    }

    addNew(steamAccount: SteamAccount) {
        this.objects = [...this.objects, steamAccount];
        // Новый объект ещё не входил: без этого подтверждения и баланс сразу после добавления
        // отвечали «Not Logged In» до перезапуска (SDA-61)
        steamAccount.startSessionInBackground();
    }
    sendAccountsToFront() {
        // Без объектов Error: в Electron 17 они ломают повторные ссылки IPC-сообщения (SDA-19).
        const steamAccounts = errorsToStrings(this.getCompiledObjects());
        application.sendToMain(SteamAccountChannels.STEAM_ACCOUNT_GET, steamAccounts);
    }
    async delete(id: string) {
        try {
            const index = this.objects.findIndex(obj => obj.params.id === id);
            if (index === -1) throw new Error(`#${id} - steam account is not exist`);
            const [removed] = this.objects.splice(index, 1);
            removed.invalidateOperations();
            SteamAccountStorage.Delete(id);
            try {
                const thisAccount = SteamAccountStorage.GetById(id);
            } catch (err){
                console.log(`account ${id} has been deleted`);
            }
            const cleanup = application.images?.removeAccount(id);
            // Удалённая запись исчезает из UI даже при ошибке очистки кеша.
            try { this.sendAccountsToFront(); }
            finally { await cleanup; }
        } catch (err) {
            throw new Error(`Cant delete steam account: ${err}`);
        }
    }
    edit(id: string, newSteamAccountData: { [K in keyof SteamAccountInterface]?: SteamAccountInterface[K] }) {
        try {
            const object = this.objects.find(object => object.params.id === id);
            if (!object) throw new Error(`#${id} - steam account is not exist`);
            object.editParams(newSteamAccountData);
        } catch (err) {
            throw new Error(`Cant edit steam account: ${err}`);
        }
    }
    /** reloadId — номер «Перезагрузить все данные» из окна: отметка уходит прямо перед новым списком. */
    async load(reloadId?: number) {
        try {
            const objects = SteamAccountStorage.GetAll();
            const objectsArray = Object.values(objects);
            const previous = new Map(this.objects.map(account => [account.params.id, account]));
            const next: SteamAccount[] = [];
            for (var object of objectsArray) {
                const existing = previous.get(object.id);
                const steamAccount = existing || new SteamAccount(object);
                const previousProxyId = steamAccount.proxyId;
                // Keep the Chrome owner, including a launch still in progress.
                const routeChanged = existing ? steamAccount.reloadParams(object) : false;
                if (routeChanged || previousProxyId !== steamAccount.proxyId) application.images?.invalidateRoute(object.id);
                // Архивные аккаунты startSession пропускает (SDA-59)
                if (!routeChanged) steamAccount.startSessionInBackground();
                next.push(steamAccount);
            }
            for (const old of this.objects) {
                if (next.includes(old)) continue;
                old.invalidateOperations();
                // Removed records must not leave an untracked live browser either.
                old.chrome.stop().catch(err => application.sendToMain("ERROR", String(err)));
            }
            this.objects = next;
            if (reloadId !== undefined) application.sendToMain(SteamAccountChannels.STEAM_ACCOUNT_REFRESH_STORAGE, { requestId: reloadId });
            this.sendAccountsToFront();
            // Только после успешной загрузки, когда archived/missing записи уже известны.
            await application.images?.pruneOrphans().catch(() => console.warn('Unable to prune image cache'));
        } catch (err) {
            throw new Error(`Cant load steam accounts: ${err}`);
        }
    }
    getCompiledObjects() {
        const startTime = new Date();
        const compiledObjects: CompiledSteamAccountInterface[] = [];
        for (var obj of this.objects) {
            const compiledObject = SteamAccountManager.CompileObject(obj);
            compiledObjects.push(compiledObject);
        }
        const endTime = new Date();
        const dif = Number(endTime) - Number(startTime);
        console.log(`get compiled objects time: ${dif}ms; start time: ${Number(startTime)}; endTime: ${Number(endTime)};`);
        return compiledObjects;
    }
    getById(id: string) {
        const objects = this.objects.filter(sa => sa.params.id === id);
        if (objects.length === 0) return null;
        return objects[0];
    }
    getByAccountName(accountName: string){
        const objects = this.objects.filter(sa => sa.params.accountName === accountName);
        if (objects.length === 0) return null;
        return objects[0];
    }
    static CompileObject(object: SteamAccount) {
        const linkedData = Manager.GetSteamAccountLinkedData(object.params.id);

        const compiledObject: CompiledSteamAccountInterface = {
            ...object.params,
            smaFile: object.getSmaFile(),
            ...linkedData,
            ...(object.proxyState === "missing" ? { proxy: null, proxyState: "missing" as const } : {}),
            group: Manager.GetSteamAccountGroup(object.params.id),
            sessionError: object.sessionErrorText()
        }
       
        return compiledObject;
    }
}

export default new SteamAccountManager();
