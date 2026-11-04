import { Store } from "./store";
import { makeAutoObservable } from 'mobx';

type Tab = 'steamAccounts' | 'proxies' | 'browser';

class TabsStore {
    root: Store;
    active: Tab;

    constructor (root: Store){
        this.root = root;
        this.active = 'steamAccounts';
        
        makeAutoObservable(this);
    }

    setActive(tab: Tab){
        console.log(tab)
        if (tab === 'steamAccounts'){
            window.Main.steamAccounts.get();
            window.Main.steamAccounts.getTableFields();
        }
        // Состояние папок расширений могло измениться, пока страница была закрыта.
        if (tab === 'browser') this.root.browserSettings.load();
        this.active = tab;
    }
}

export default TabsStore;