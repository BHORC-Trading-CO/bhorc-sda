import AppSettingsStorage, { APP_SETTINGS_KEY } from "../../newStorage/AppSettingsStorage";
import createStore from "../../newStorage/createStore";
import { DEFAULT_APP_SETTINGS, parseAppSettingsUpdate, sanitizeAppSettings } from "../appSettings";

// Settings of SDA-35/36 in config.json: additive key, existing installs read as everything off.

const ALL_OFF = { closeToTray: false, launchAtLogin: false, startMinimized: false };

describe("stored value", () => {
    it("defaults are all off", () => {
        expect(DEFAULT_APP_SETTINGS).toEqual(ALL_OFF);
    });

    it.each([undefined, null, "yes", 42, [], [true]])("missing or garbage (%j) -> all off", (raw) => {
        expect(sanitizeAppSettings(raw)).toEqual(ALL_OFF);
    });

    it("partial object: present true values kept, the rest off; only a real true counts", () => {
        expect(sanitizeAppSettings({ closeToTray: true })).toEqual({ ...ALL_OFF, closeToTray: true });
        expect(sanitizeAppSettings({ closeToTray: "true", launchAtLogin: 1, startMinimized: true, extra: true }))
            .toEqual({ ...ALL_OFF, startMinimized: true });
    });
});

describe("save from the page", () => {
    it("all three booleans -> accepted", () => {
        expect(parseAppSettingsUpdate({ closeToTray: true, launchAtLogin: false, startMinimized: true }))
            .toEqual({ closeToTray: true, launchAtLogin: false, startMinimized: true });
    });

    it("unknown keys are dropped", () => {
        expect(parseAppSettingsUpdate({ ...ALL_OFF, closeToTray: true, path: "C:\\evil.exe" })).toEqual({ ...ALL_OFF, closeToTray: true });
    });

    it.each([
        null,
        "closeToTray",
        [true, true, true],
        { closeToTray: true, launchAtLogin: false },
        { closeToTray: "true", launchAtLogin: false, startMinimized: false },
        { closeToTray: true, launchAtLogin: 1, startMinimized: false },
    ])("malformed (%j) -> rejected as a whole", (incoming) => {
        expect(parseAppSettingsUpdate(incoming)).toBeNull();
    });
});

describe("AppSettingsStorage", () => {
    it("an install without the key (config.json of an older version) -> all off", () => {
        jest.isolateModules(() => {
            const fresh = require("../../newStorage/createStore").default();
            fresh.set("language", "uk");
            fresh.set("steamAccounts", { a: { id: "a" } });
            const FreshStorage = require("../../newStorage/AppSettingsStorage").default;
            expect(FreshStorage.Get()).toEqual(ALL_OFF);
        });
    });

    it("round trip, under its own key, without touching other keys", () => {
        const store = createStore();
        store.set("language", "ru");
        AppSettingsStorage.Save({ closeToTray: true, launchAtLogin: true, startMinimized: false });
        expect(AppSettingsStorage.Get()).toEqual({ closeToTray: true, launchAtLogin: true, startMinimized: false });
        expect(store.get(APP_SETTINGS_KEY)).toEqual({ closeToTray: true, launchAtLogin: true, startMinimized: false });
        expect(store.get("language")).toBe("ru");
    });

    it("saves only the three known booleans", () => {
        AppSettingsStorage.Save({ closeToTray: true, launchAtLogin: false, startMinimized: false, extra: "x" } as any);
        expect(createStore().get(APP_SETTINGS_KEY)).toEqual({ closeToTray: true, launchAtLogin: false, startMinimized: false });
    });
});
