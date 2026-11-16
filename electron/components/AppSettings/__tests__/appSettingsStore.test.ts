import AppSettingsInterface, { AppSettingsPatch, AppSettingsView } from "../../../interfaces/AppSettings/AppSettingsInterface";

// Renderer store of the Settings page against replies that arrive late (review round 1,
// finding 2). Main is modelled as it works: each save is merged into the stored settings in
// arrival order and answered with the full state; replies are delivered in order, later.

const g = globalThis as any;
const ALL_OFF: AppSettingsInterface = { closeToTray: false, launchAtLogin: false, startMinimized: false };

function setup() {
    let onGet: ((event: unknown, view: AppSettingsView) => void) | null = null;
    let main: AppSettingsInterface = { ...ALL_OFF };
    const sent: AppSettingsPatch[] = [];
    const pendingReplies: AppSettingsView[] = [];
    const view = (): AppSettingsView => ({ settings: { ...main }, loginItem: "supported", trayUnavailable: false });
    g.window = {
        Main: {
            appSettings: {
                get: () => pendingReplies.push(view()),
                onGet: (listener: typeof onGet) => { onGet = listener; },
                onError: () => {},
                save: (patch: AppSettingsPatch) => {
                    sent.push(patch);
                    // A full settings object (what the store sent before the fix) replaces the state.
                    main = "key" in patch ? { ...main, [patch.key]: patch.value } : { ...(patch as any) };
                    pendingReplies.push(view());
                },
            },
        },
    };
    let AppSettingsStore: any;
    jest.isolateModules(() => {
        AppSettingsStore = require("../../../../src/store/AppSettingsStore").default;
    });
    const store = new AppSettingsStore({});
    const deliverNext = () => onGet!({}, pendingReplies.shift()!);
    return { store, sent, deliverNext, pending: () => pendingReplies.length, mainState: () => main };
}

afterEach(() => { delete g.window; });

it("enable A, enable B, reply A arrives, enable C -> all three on in the end", () => {
    const { store, sent, deliverNext, pending, mainState } = setup();
    deliverNext(); // initial load
    store.set("launchAtLogin", true); // A
    store.set("closeToTray", true); // B
    deliverNext(); // reply to A: launch on, close-to-tray not yet
    store.set("startMinimized", true); // C
    while (pending()) deliverNext();
    expect(store.settings).toEqual({ closeToTray: true, launchAtLogin: true, startMinimized: true });
    expect(mainState()).toEqual({ closeToTray: true, launchAtLogin: true, startMinimized: true });
    // Every save carries only its own switch, never a stale copy of the others.
    expect(sent).toEqual([
        { key: "launchAtLogin", value: true },
        { key: "closeToTray", value: true },
        { key: "startMinimized", value: true },
    ]);
});

it("a switch shows its new value at once, before main replies", () => {
    const { store, deliverNext } = setup();
    deliverNext();
    store.set("closeToTray", true);
    expect(store.settings.closeToTray).toBe(true);
});

it("main's reply is the truth: a refused change comes back off", () => {
    const { store, deliverNext } = setup();
    deliverNext();
    store.set("launchAtLogin", true);
    // main refused (the system denied the login item) and answered with the unchanged state
    store.apply({ settings: { ...ALL_OFF }, loginItem: "supported", trayUnavailable: false });
    expect(store.settings.launchAtLogin).toBe(false);
});
