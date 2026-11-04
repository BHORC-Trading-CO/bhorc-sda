// Окно добавления аккаунта: каждое открытие начинается с пустых данных. Раньше open() чистил
// логин, пароль и maFile, но почта и её пароль от отменённого добавления оставались в форме
// и уходили вместе со следующим аккаунтом.
jest.mock("../../../../src/store/store", () => ({ __esModule: true, default: { windows: { openMiniNotification: jest.fn(), prompt: jest.fn() } } }));
jest.mock("../../../../src/i18n/i18n", () => ({ __esModule: true, default: { t: (key: string) => key } }));
import CreationFormStore from "../../../../src/store/SteamAccountsTableStore/CreationFormStore";

beforeEach(() => {
    (globalThis as any).window = { Main: {
        steamAccounts: { onCreationProcessStep: jest.fn(), onCreationProcessError: jest.fn(), creationProcess: jest.fn() },
        guardConnection: { onSetupStep: jest.fn(), onSetupResult: jest.fn(), onSetupError: jest.fn(), setup: jest.fn() }
    } };
});
afterEach(() => { delete (globalThis as any).window; });

it("a cancelled add does not carry its mail credentials into the next account", () => {
    const form = new CreationFormStore({} as any);
    const fresh = form.getContent();
    form.open();
    form.editContent({
        accountName: "cancelled", password: "cancelled-password", maFile: {} as any,
        mail: "cancelled@example.invalid", mailPassword: "cancelled-mail-password", profileName: "cancelled-profile",
        useSteamCookies: false, proxy: { new: { host: "h", port: "1", username: "u", password: "p" }, savedId: "p1" },
    });
    form.close();
    form.open();
    expect(form.getContent()).toEqual(fresh);

    form.editContent({ accountName: "next", password: "next-password", maFile: {} as any });
    form.runCreationProcess();
    const sent = (window.Main.steamAccounts.creationProcess as jest.Mock).mock.calls[0][0];
    expect(sent).toMatchObject({ accountName: "next", mail: "", mailPassword: "", profileName: "" });
});
