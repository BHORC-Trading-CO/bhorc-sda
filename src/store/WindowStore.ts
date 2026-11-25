import store, { Store } from "./store";
import { makeAutoObservable, toJS, runInAction } from 'mobx';

type ImgType = 'info' | 'error' | 'success' | 'question';
interface MiniNotificationInterface { text: string, type: ImgType };
interface PromptInterface extends MiniNotificationInterface { title: string, acceptButtonText?: string, cancelButtonText?: string, isInput?: boolean, cb?: (text: string) => void };

class WindowsStore {
    root: Store;
    isMyProfileOpen: boolean;
    isPromptOpen: boolean;
    promptContent: PromptInterface;
    isMiniNotificationOpen: boolean;
    miniNotificationContent: MiniNotificationInterface;
    miniNotificationTimeout: NodeJS.Timeout | null;
    private miniNotificationRequest: number = 0;

    constructor(root: Store) {
        this.root = root;

        this.isMyProfileOpen = false;
        this.isPromptOpen = false;
        this.promptContent = {} as PromptInterface;
        this.isMiniNotificationOpen = false;
        this.miniNotificationContent = {
            text: "",
            type: 'error'
        };
        this.miniNotificationTimeout = null;

        makeAutoObservable(this);
    }

    openMyProfile() {
        this.isMyProfileOpen = true;
    }
    closeMyProfile() {
        this.isMyProfileOpen = false;
    }
    prompt(props: PromptInterface) {
        this.isPromptOpen = true;
        this.promptContent = props;
    }
    closeNotification() {
        this.isPromptOpen = false;
        this.promptContent = {} as PromptInterface;
    }
    async openMiniNotification(props: MiniNotificationInterface) {
        // Таймер принадлежит одному уведомлению (SDA-64): вызовы, пришедшие подряд, ставили каждый
        // свой, и таймер прежнего закрывал новое раньше срока.
        const request = ++this.miniNotificationRequest;
        if (this.miniNotificationTimeout) {
            this.closeMiniNotification();
            clearTimeout(this.miniNotificationTimeout);
            this.miniNotificationTimeout = null;
        }
        await sleep(200);
        if (request !== this.miniNotificationRequest) return;
        this.isMiniNotificationOpen = true;
        this.miniNotificationContent = props;
        this.miniNotificationTimeout = setTimeout(() => {
            this.miniNotificationTimeout = null;
            this.closeMiniNotification();
        }, 5000);
    }
    closeMiniNotification() {
        console.log('close');
        this.isMiniNotificationOpen = false;
        //this.miniNotificationContent = {} as MiniNotificationInterface;
    }
}

const sleep = (ms: number) => {
    return new Promise(r => setTimeout(r, ms));
}

export default WindowsStore;