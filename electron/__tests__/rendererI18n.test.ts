import steamAccountsTableFields from "../interfaces/TableFields/defaults/steamAccountsTableFields";
import proxiesTableFields from "../interfaces/TableFields/defaults/proxiesTableFields";

// Renderer-экземпляр i18n (src/i18n/i18n.ts): первый язык берётся из preload, смена языка
// из main (onChanged) переключает это окно и копию main-переводов в renderer.
let onChanged: ((language: string) => void) | null = null;
const g = globalThis as any;

function loadRenderer(initial: string) {
    onChanged = null;
    g.window = { Language: { get: () => initial, set: jest.fn(), onChanged: (cb: (l: string) => void) => { onChanged = cb; return () => {}; } } };
    g.document = { documentElement: { lang: "" } };
    let mod: any;
    jest.isolateModules(() => {
        mod = {
            i18n: require("../../src/i18n/i18n").default,
            fieldTitle: require("../../src/globalComponents/Table/fieldTitle").default,
            main: require("../i18n"),
        };
    });
    return mod;
}

afterEach(() => { delete g.window; delete g.document; });

it("первый язык окна — из preload, document.lang в тон", () => {
    const { i18n } = loadRenderer("uk");
    expect(i18n.language).toBe("uk");
    expect(g.document.documentElement.lang).toBe("uk");
});

it("неизвестный язык из preload -> en", () => {
    const { i18n } = loadRenderer("de");
    expect(i18n.language).toBe("en");
});

it("смена языка из main переключает окно, document.lang и main-переводы в renderer", () => {
    const { i18n, main } = loadRenderer("en");
    expect(onChanged).not.toBeNull();
    onChanged!("ru");
    expect(i18n.language).toBe("ru");
    expect(g.document.documentElement.lang).toBe("ru");
    expect(main.getMainLanguage()).toBe("ru");
    onChanged!("xx");
    expect(i18n.language).toBe("ru");
});

describe("заголовки колонок берутся по type, а не из сохранённого title", () => {
    const tables = [
        { table: "steamAccounts", fields: steamAccountsTableFields },
        { table: "proxies", fields: proxiesTableFields },
    ];
    it.each(["en", "uk"])("%s: перевод вместо русского title из config.json", (language) => {
        const { i18n, fieldTitle } = loadRenderer(language);
        const t = i18n.getFixedT(language);
        for (const { table, fields } of tables) {
            for (const field of fields) {
                const stored = { ...field, title: "Старый русский заголовок" };
                const shown = fieldTitle(t, table, stored);
                expect({ table, type: field.type, shown }).toEqual({ table, type: field.type, shown: t(`fields.${table}.${field.type}`) });
                expect(shown).not.toBe(stored.title);
            }
        }
    });
    it("тип без перевода показывает сохранённый title", () => {
        const { i18n, fieldTitle } = loadRenderer("en");
        expect(fieldTitle(i18n.t, "steamAccounts", { type: "someFutureColumn", title: "Колонка" } as any)).toBe("Колонка");
    });
});
