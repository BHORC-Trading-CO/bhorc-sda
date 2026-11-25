// Выбор maFile в формах (SDA-62): экспортированный файл без SteamID раньше не прикреплялся обратно.
jest.mock("react", () => ({ ...jest.requireActual("react"), useState: (value: unknown) => [value, () => undefined] }));
jest.mock("mobx-react", () => ({ observer: (component: unknown) => component }));
jest.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
const mockStore = { windows: { openMiniNotification: jest.fn() } };
jest.mock("../../../../src/store/store", () => ({ __esModule: true, get default() { return mockStore; } }));
jest.mock("../../../../src/globalComponents/Button/Button", () => ({ __esModule: true, default: () => null }));
jest.mock("../../../../src/globalComponents/MaFile/MaFile", () => ({ __esModule: true, default: () => null }));
const mockReadFile = jest.fn();
jest.mock("../../../../src/globalComponents/SomeFuncs/readFile", () => ({ __esModule: true, default: (file: unknown) => mockReadFile(file) }));
const JSONbig = require("json-bigint");
import MaFileImport from "../../../../src/pages/Main/tabs/SteamAccountsTab/components/MaFileImport/MaFileImport";

async function pick(text: string) {
    mockReadFile.mockResolvedValueOnce(JSONbig.parse(text));
    const onChange = jest.fn();
    const root = (MaFileImport as any)({ currentMaFile: null, onChange });
    const input = root.props.children.find((child: any) => child?.props?.id === "maFileImportInput");
    input.props.onChange({ target: { files: ["file"], value: "" } });
    await new Promise(setImmediate);
    expect(mockStore.windows.openMiniNotification).not.toHaveBeenCalled();
    return JSON.parse(JSON.stringify(onChange.mock.calls[0][0]));
}

it.each(["{}", "null", '{"SteamID":null}'])("a file with Session %s is accepted as it is", async session => {
    expect(await pick(`{"account_name":"fixture","Session":${session}}`)).toEqual({ account_name: "fixture", Session: JSON.parse(session) });
});

it("a numeric SteamID becomes the exact string", async () => {
    expect((await pick('{"Session":{"SteamID":76561198000000001}}')).Session.SteamID).toBe("76561198000000001");
    expect((await pick('{"Session":{"SteamID":"76561198000000001"}}')).Session.SteamID).toBe("76561198000000001");
});
