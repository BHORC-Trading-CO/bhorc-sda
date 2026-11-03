import fs from "fs";
import os from "os";
import path from "path";

// userData уводим во временную папку: тест не должен писать секреты в репозиторий.
const mockUserData = fs.mkdtempSync(path.join(os.tmpdir(), "sda-pending-"));

jest.mock("electron", () => ({
    app: { getPath: () => mockUserData },
}));

import savePendingAuthenticator from "../Functions/savePendingAuthenticator";
import TwoFactorResponseInterface from "../../../interfaces/SteamAccount/TwoFactorResponseInterface";

const rawMaFile = {
    status: 1,
    shared_secret: "sharedSecretValue",
    identity_secret: "identitySecretValue",
    revocation_code: "R12345",
    serial_number: "1234567890",
    uri: "otpauth://totp/Steam:test",
    server_time: "1750000000",
    account_name: "testaccount",
    token_gid: "abc123",
    secret_1: "secret1Value",
} as TwoFactorResponseInterface;

describe("savePendingAuthenticator", () => {
    it("кладёт секреты на диск и возвращает путь", () => {
        const file = savePendingAuthenticator("testaccount", rawMaFile, "76561198000000000");

        expect(file).not.toBeNull();
        expect(fs.existsSync(file!)).toBe(true);

        const saved = JSON.parse(fs.readFileSync(file!, "utf8"));
        expect(saved.accountName).toBe("testaccount");
        expect(saved.steamID64).toBe("76561198000000000");
        // Три секрета, которые Steam отдаёт ровно один раз: без них незавершённый
        // аутентификатор нельзя ни доподключить, ни снять с аккаунта.
        expect(saved.response.shared_secret).toBe("sharedSecretValue");
        expect(saved.response.identity_secret).toBe("identitySecretValue");
        expect(saved.response.revocation_code).toBe("R12345");
    });

    it("не затирает секреты предыдущей попытки", () => {
        const first = savePendingAuthenticator("sameaccount", rawMaFile, "76561198000000000");
        const second = savePendingAuthenticator(
            "sameaccount",
            { ...rawMaFile, revocation_code: "R99999" } as TwoFactorResponseInterface,
            "76561198000000000"
        );

        expect(first).not.toBe(second);
        expect(JSON.parse(fs.readFileSync(first!, "utf8")).response.revocation_code).toBe("R12345");
        expect(JSON.parse(fs.readFileSync(second!, "utf8")).response.revocation_code).toBe("R99999");
    });

    it("не затирает секреты, если две попытки пришлись на одну миллисекунду", () => {
        jest.useFakeTimers().setSystemTime(new Date("2026-10-27T20:00:00.000Z"));
        try {
            const first = savePendingAuthenticator("collision", rawMaFile, "76561198000000000");
            const second = savePendingAuthenticator(
                "collision",
                { ...rawMaFile, revocation_code: "R77777" } as TwoFactorResponseInterface,
                "76561198000000000"
            );

            expect(first).not.toBe(second);
            expect(JSON.parse(fs.readFileSync(first!, "utf8")).response.revocation_code).toBe("R12345");
            expect(JSON.parse(fs.readFileSync(second!, "utf8")).response.revocation_code).toBe("R77777");
        } finally {
            jest.useRealTimers();
        }
    });

    (process.platform === "win32" ? it.skip : it)("пишет файл с секретами с правами 0o600", () => {
        const file = savePendingAuthenticator("modecheck", rawMaFile, "76561198000000000");
        expect(fs.statSync(file!).mode & 0o777).toBe(0o600);
    });

    it("не бросает исключение, если записать не удалось", () => {
        const spy = jest.spyOn(fs, "writeFileSync").mockImplementation(() => {
            throw new Error("disk full");
        });

        expect(() => savePendingAuthenticator("testaccount", rawMaFile, "76561198000000000")).not.toThrow();
        expect(savePendingAuthenticator("testaccount", rawMaFile, "76561198000000000")).toBeNull();

        spy.mockRestore();
    });
});
