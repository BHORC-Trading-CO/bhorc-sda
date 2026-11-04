import createStore from "./createStore";
import BrowserSettingsInterface from "../../interfaces/Browser/BrowserSettingsInterface";
import { sanitizeBrowserSettings } from "../Browser/browserSettings";

const store = createStore();

/** Ключ в config.json. У старых установок его нет — Get отдаёт значения по умолчанию. */
export const BROWSER_SETTINGS_KEY = "browserSettings";

class BrowserSettingsStorage {
    static Get(): BrowserSettingsInterface {
        return sanitizeBrowserSettings(store.get(BROWSER_SETTINGS_KEY));
    }
    static Save(settings: BrowserSettingsInterface) {
        store.set(BROWSER_SETTINGS_KEY, settings);
    }
}

export default BrowserSettingsStorage;
