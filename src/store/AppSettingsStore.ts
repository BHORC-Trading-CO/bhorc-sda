import { makeAutoObservable } from "mobx";
import { Store } from "./store";
import AppSettingsInterface, { AppSettingsView, LoginItemSupport } from "../../electron/interfaces/AppSettings/AppSettingsInterface";

// Store of the Settings page (SDA-35, SDA-36): tray and launch at login. Every switch is saved at
// once; main replies with the saved state (and the reason, if the save or the login item failed).
class AppSettingsStore {
    root: Store;
    isLoaded: boolean;
    settings: AppSettingsInterface;
    loginItem: LoginItemSupport;
    trayUnavailable: boolean;
    /** Last refusal from main, already translated. */
    error: string | null;

    constructor(root: Store) {
        this.root = root;
        this.isLoaded = false;
        this.settings = { closeToTray: false, launchAtLogin: false, startMinimized: false };
        this.loginItem = "supported";
        this.trayUnavailable = false;
        this.error = null;

        makeAutoObservable(this, { root: false });

        window.Main.appSettings.onGet((event, view) => this.apply(view));
        window.Main.appSettings.onError((event, error) => this.setError(error.message));
        this.load();
    }

    load() {
        this.error = null;
        window.Main.appSettings.get();
    }

    apply(view: AppSettingsView) {
        this.settings = view.settings;
        this.loginItem = view.loginItem;
        this.trayUnavailable = view.trayUnavailable;
        this.isLoaded = true;
    }

    setError(message: string | null) {
        this.error = message;
    }

    set<K extends keyof AppSettingsInterface>(key: K, value: AppSettingsInterface[K]) {
        this.error = null;
        // Shown at once; main's reply confirms it or brings the saved value back.
        this.settings = { ...this.settings, [key]: value };
        window.Main.appSettings.save({ ...this.settings });
    }
}

export default AppSettingsStore;
