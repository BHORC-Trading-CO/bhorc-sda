import createStore from "./createStore";
import AppSettingsInterface from "../../interfaces/AppSettings/AppSettingsInterface";
import { sanitizeAppSettings } from "../AppSettings/appSettings";

const store = createStore();

/** Key in config.json. Older installs do not have it: Get returns everything off. */
export const APP_SETTINGS_KEY = "appSettings";

class AppSettingsStorage {
    static Get(): AppSettingsInterface {
        return sanitizeAppSettings(store.get(APP_SETTINGS_KEY));
    }
    static Save(settings: AppSettingsInterface) {
        store.set(APP_SETTINGS_KEY, sanitizeAppSettings(settings));
    }
}

export default AppSettingsStorage;
