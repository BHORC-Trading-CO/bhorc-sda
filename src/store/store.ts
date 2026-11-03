import { makeAutoObservable } from 'mobx';
import ProxiesTableStore from './ProxiesTableStore/ProxiesTableStore';
import WindowStore from './WindowStore';
import TabsStore from './TabStore';
import SteamAccountsTableStore from './SteamAccountsTableStore/SteamAccountsTableStore';
import GroupsStore from './GroupsStore';
import i18n from '../i18n/i18n';

export class Store {
    steamAccountsTable: SteamAccountsTableStore;
    proxiesTable: ProxiesTableStore;
    groups: GroupsStore;
    windows: WindowStore;
    tabs: TabsStore;

    constructor() {
        this.steamAccountsTable = new SteamAccountsTableStore(this);
        this.proxiesTable = new ProxiesTableStore(this);
        this.groups = new GroupsStore(this);
        this.windows = new WindowStore(this);
        this.tabs = new TabsStore(this);
        makeAutoObservable(this);

        //ЭТА ФУНКЦИЯ ПОКА ЧТО ЗАЛОЧЕНА
        window.Main.window.onGetSecretKey(() => {
            this.windows.prompt({
                title: i18n.t("secretKey.title"),
                text: i18n.t("secretKey.text"),
                type: "question",
                isInput: true,
                cb: (text) => {
                    window.Main.window.getSecretKey(text);
                }
            });
        });

        window.Main.onError((event, error) => {
            alert(error);
        });
    }
}

export default window.getWindowName() === 'main' ? new Store() : {} as Store;