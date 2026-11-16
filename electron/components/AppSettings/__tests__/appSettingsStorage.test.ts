import AppSettingsStorage, { APP_SETTINGS_KEY } from "../../newStorage/AppSettingsStorage";
import createStore from "../../newStorage/createStore";
import { DEFAULT_APP_SETTINGS, parseAppSettingsPatch, sanitizeAppSettings } from "../appSettings";

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

describe("one switch from the page ({ key, value })", () => {
    it.each(["closeToTray", "launchAtLogin", "startMinimized"])("%s with a boolean -> accepted", (key) => {
        expect(parseAppSettingsPatch({ key, value: true })).toEqual({ key, value: true });
        expect(parseAppSettingsPatch({ key, value: false })).toEqual({ key, value: false });
    });

    it("extra fields are dropped", () => {
        expect(parseAppSettingsPatch({ key: "closeToTray", value: true, path: "C:\\evil.exe" })).toEqual({ key: "closeToTray", value: true });
    });

    it.each([
        null,
        "closeToTray",
        [true],
        { closeToTray: true, launchAtLogin: false, startMinimized: false },
        { key: "language", value: true },
        { key: "toString", value: true },
        { key: "closeToTray", value: "true" },
        { key: "closeToTray" },
    ])("malformed (%j) -> rejected", (incoming) => {
        expect(parseAppSettingsPatch(incoming)).toBeNull();
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
