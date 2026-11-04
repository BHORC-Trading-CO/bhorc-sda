const mockLinked = { proxy: null as any, proxyState: "none", proxyId: null as string | null };
jest.mock("../../../Manager/Manager", () => ({ __esModule: true, default: { GetSteamAccountLinkedData: () => mockLinked } }));

jest.mock("fs/promises", () => ({ mkdir: jest.fn().mockResolvedValue(undefined), writeFile: jest.fn().mockResolvedValue(undefined) }));
jest.mock("../../../someFuncs/downloadImage", () => ({ __esModule: true, default: jest.fn().mockResolvedValue(undefined) }));
jest.mock("sharp", () => jest.fn(() => ({ resize: () => ({ toFile: (_path: string, callback: Function) => callback(null) }) })));

import Chrome from "../Chrome";
import downloadImage from "../../../someFuncs/downloadImage";
import { DEFAULT_AVATAR_URL } from "../../../Functions/sanitizeAvatarUrl";
const sharp = require("sharp");

it.each(["http://unix:/tmp/socket:/image", "https://evil.test/avatar.jpg", "data:image/png;base64,xxx", ""])("createProfile пропускает недопустимый аватар %s", async avatarUrl => {
    const chrome = new Chrome({ id: "test-account", secondary: { nickname: "name", avatarUrl } } as any);
    await chrome.createProfile();
    expect(downloadImage).not.toHaveBeenCalled();
    expect(sharp).not.toHaveBeenCalled();
});

it("createProfile сохраняет загрузку обычного аватара через привязанный прокси", async () => {
    const chrome = new Chrome({ id: "test-account", secondary: { nickname: "name", avatarUrl: DEFAULT_AVATAR_URL } } as any);
    mockLinked.proxy = { id: "p1", host: "proxy.test", port: "8080", username: "u@x", password: "p:x" };
    mockLinked.proxyState = "ok";
    mockLinked.proxyId = "p1";
    await chrome.createProfile();
    expect(downloadImage).toHaveBeenCalledWith(DEFAULT_AVATAR_URL, expect.stringContaining("/Avatars/avatar_generic_small.png"), "http://u%40x:p%3Ax@proxy.test:8080");
    expect(sharp).toHaveBeenCalledTimes(1);
});
