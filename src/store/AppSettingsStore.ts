import { makeAutoObservable } from "mobx";
import { Store } from "./store";
import AppSettingsInterface, { AppSettingsView, LoginItemSupport } from "../../electron/interfaces/AppSettings/AppSettingsInterface";

// Store of the Settings page (SDA-35, SDA-36): tray and launch at login. A flipped switch is sent
// alone ({ key, value }); main merges it into the stored settings in arrival order and replies
// with the full state, which replaces ours. A late reply can show an older state for a moment,
// but it cannot make a later save carry that old value: no save sends more than its own key.
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

    set(key: keyof AppSettingsInterface, value: boolean) {
        this.error = null;
        // Shown at once; main's reply confirms it or brings the saved value back.
        this.settings = { ...this.settings, [key]: value };
        window.Main.appSettings.save({ key, value });
    }
}

export default AppSettingsStore;
