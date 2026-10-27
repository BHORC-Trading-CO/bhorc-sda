const mockGet = jest.fn();
const mockSet = jest.fn();
const mockDelete = jest.fn();
jest.mock("electron-store", () => jest.fn().mockImplementation(() => ({
    get: (...args: any[]) => mockGet(...args),
    set: (...args: any[]) => mockSet(...args),
    delete: (...args: any[]) => mockDelete(...args),
})));
jest.mock("../cryptoUserData", () => ({
    __esModule: true, default: { encryptObject: (value: any) => value, decryptObject: (value: any) => value },
}));

import SteamAccountStorage from "../SteamAccountStorage";
import ProxyStorage from "../ProxyStorage";
import GroupStorage from "../GroupStorage";

describe.each([SteamAccountStorage, ProxyStorage, GroupStorage])("защита сегмента пути %p", Storage => {
    it.each(["a.b", ".", "a.", ".a", "", "__proto__", "constructor", null, {}])("отклоняет неверный id до обращения к store %#", id => {
        expect(() => Storage.GetById(id as any)).toThrow();
        expect(() => Storage.Save(id as any, { id } as any)).toThrow();
        expect(() => Storage.EditData(id as any, {})).toThrow();
        expect(() => Storage.Delete(id as any)).toThrow();
        expect(mockGet).not.toHaveBeenCalled();
        expect(mockSet).not.toHaveBeenCalled();
        expect(mockDelete).not.toHaveBeenCalled();
    });
    it("сохраняет обычный id, но не позволяет подменить его внутри записи", () => {
        const record = { id: "account-123" } as any;
        Storage.Save(record.id, record);
        expect(mockSet).toHaveBeenCalledWith(expect.stringMatching(/\.account-123$/), record);
        mockSet.mockClear();
        mockGet.mockReturnValue(record);
        expect(() => Storage.Save(record.id, { id: "a.b" } as any)).toThrow();
        expect(() => Storage.EditData(record.id, { id: "other-id" })).toThrow();
        expect(mockSet).not.toHaveBeenCalled();
    });
});
