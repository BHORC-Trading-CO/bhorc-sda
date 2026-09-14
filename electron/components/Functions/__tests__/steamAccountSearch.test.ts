import { getSteamID64, matchesSteamAccountSearch } from "../steamAccountSearch";

const account = (overrides: any = {}) => ({
    accountName: "trader_01",
    secondary: { nickname: "Rabscuttle" },
    maFile: { Session: { SteamID: "76561197960287930" } },
    ...overrides,
});

describe("getSteamID64", () => {
    it("строка — как есть", () => {
        expect(getSteamID64({ Session: { SteamID: "76561197960287930" } } as any)).toBe("76561197960287930");
    });

    it("старый maFile с BigNumber-объектом", () => {
        expect(getSteamID64({ Session: { SteamID: { s: 1, e: 16, c: [765, 61197960287930] } } } as any)).toBe("76561197960287930");
    });

    it("дополняет нулями внутренние чанки BigNumber", () => {
        expect(getSteamID64({ Session: { SteamID: { c: [1, 42] } } } as any)).toBe("100000000000042");
    });

    it("нет сессии — пустая строка", () => {
        expect(getSteamID64({} as any)).toBe("");
        expect(getSteamID64(undefined)).toBe("");
    });
});

describe("matchesSteamAccountSearch", () => {
    it("пустой запрос совпадает со всеми", () => {
        expect(matchesSteamAccountSearch(account(), "")).toBe(true);
        expect(matchesSteamAccountSearch(account(), "   ")).toBe(true);
    });

    it("ищет по логину", () => {
        expect(matchesSteamAccountSearch(account(), "trader")).toBe(true);
    });

    it("ищет по нику без учёта регистра", () => {
        expect(matchesSteamAccountSearch(account(), "rabSCU")).toBe(true);
    });

    it("ищет по SteamID64 (в т.ч. частично)", () => {
        expect(matchesSteamAccountSearch(account(), "76561197960287930")).toBe(true);
        expect(matchesSteamAccountSearch(account(), "960287")).toBe(true);
    });

    it("не совпадает, если нигде нет", () => {
        expect(matchesSteamAccountSearch(account(), "nope")).toBe(false);
    });

    it("не падает без secondary и maFile", () => {
        expect(matchesSteamAccountSearch({ accountName: "solo" }, "solo")).toBe(true);
        expect(matchesSteamAccountSearch({ accountName: "solo" }, "123")).toBe(false);
    });
});
