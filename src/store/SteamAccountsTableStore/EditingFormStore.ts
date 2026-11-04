import TableSteamAccountInterface from "../../../electron/interfaces/SteamAccount/TableSteamAccountInterface";
import SteamAccountsTableStore from "./SteamAccountsTableStore";
import ProxySetupInterface from "../../../electron/interfaces/Proxy/ProxySetupInterface";
import { makeAutoObservable, toJS } from 'mobx';

type SteamAccountChanges = { [K in keyof TableSteamAccountInterface]?: TableSteamAccountInterface[K] };

class EditingFormStore {
    root: SteamAccountsTableStore;
    isOpen: boolean;
    content: {
        steamAccount: TableSteamAccountInterface,
        proxy: {
            new: ProxySetupInterface,
            savedId: string | null
        }
    };
    switches: {
        proxy: 'noProxy' | 'newProxy' | 'savedProxy'
    }
    // Патч сохранения: только поля, которые пользователь изменил в этом окне, для
    // content.steamAccount. Живёт одну сессию окна: open() начинает новую (в том числе для
    // другого аккаунта), close() — отмена, крестик, клик мимо окна или сохранение — выбрасывает.
    // Раньше патч был общим объектом модуля формы и не очищался: отменённый пароль аккаунта A
    // уходил в сохранение аккаунта B.
    changes: SteamAccountChanges;

    constructor(root: SteamAccountsTableStore) {
        this.root = root;
        this.isOpen = false;
        this.content = {
            steamAccount: {} as TableSteamAccountInterface,
            proxy: {
                new: { host: '', port: '', username: '', password: '' },
                savedId: null
            }
        }
        this.switches = { proxy: 'noProxy' };
        this.changes = {};

        makeAutoObservable(this);
    }

    open(steamAccount: TableSteamAccountInterface) {
        this.isOpen = true;
        this.changes = {};
        this.content.steamAccount = steamAccount;
        this.content.proxy.savedId = steamAccount.proxyId;
        this.content.proxy.new = { host: '', port: '', username: '', password: '' };
        if (steamAccount.proxyState !== "none") {
            this.switches.proxy = 'savedProxy';
        } else {
            this.switches.proxy = 'noProxy';
        }

    }
    getProxyLinkChange() {
        const proxyId = this.switches.proxy === "noProxy" ? null : this.content.proxy.savedId;
        return proxyId === this.content.steamAccount.proxyId ? undefined : { proxyId };
    }
    close() {
        this.isOpen = false;
        this.changes = {};
    }
    getContent() { return toJS(this.content); }
    getChanges(): SteamAccountChanges { return toJS(this.changes); }
    // Правка поля аккаунта в окне: и в показанных данных, и в патче сохранения.
    editSteamAccountField<K extends keyof TableSteamAccountInterface>(key: K, value: TableSteamAccountInterface[K]) {
        this.content = { ...this.content, steamAccount: { ...this.content.steamAccount, [key]: value } };
        this.changes = { ...this.changes, [key]: value };
    }
    getSwitches() { return toJS(this.switches); }
    editContent(newContent: { [K in keyof typeof this.content]?: typeof this.content[K] }) {
        this.content = { ...this.content, ...newContent };
    }
    editSwitches(newSwitches: { [K in keyof typeof this.switches]?: typeof this.switches[K] }) { this.switches = { ...this.switches, ...newSwitches }; }
}

export default EditingFormStore;