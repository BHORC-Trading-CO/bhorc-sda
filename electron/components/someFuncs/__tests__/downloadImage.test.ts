jest.mock("request", () => jest.fn());
jest.mock("fs", () => ({ createWriteStream: jest.fn() }));

import request from "request";
import fs from "fs";
import { PassThrough } from "stream";
import downloadImage from "../downloadImage";
import { DEFAULT_AVATAR_URL } from "../../Functions/sanitizeAvatarUrl";
import { setMainLanguage } from "../../../i18n";

// Сообщения проверяем на русском: ru — прежний текст без изменений (SDA-18).
beforeAll(() => setMainLanguage("ru"));

it.each(["http://unix:/tmp/socket:/image", "https://evil.test/avatar.jpg", "data:image/png;base64,xxx", "javascript:alert(1)", "", DEFAULT_AVATAR_URL + "?next=http://127.0.0.1/"])("не вызывает request и файловую систему для %s", async url => {
    await expect(downloadImage(url, "/unused/avatar", "http://proxy.test:8080")).rejects.toThrow("недопустимый URL");
    expect(request).not.toHaveBeenCalled();
    expect(fs.createWriteStream).not.toHaveBeenCalled();
});

it.each([undefined, "http://user:pass@proxy.test:8080"])("скачивает CDN-аватар с заданным прокси %s и без редиректов", async proxy => {
    const req: any = new PassThrough();
    req.abort = jest.fn();
    (request as unknown as jest.Mock).mockReturnValue(req);
    const output = new PassThrough();
    (fs.createWriteStream as jest.Mock).mockReturnValue(output);
    const result = downloadImage(DEFAULT_AVATAR_URL, "/unused/avatar", proxy);
    req.emit("response", { statusCode: 200 });
    req.end(Buffer.from("test-image"));
    await result;
    expect(request).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledWith({ url: DEFAULT_AVATAR_URL, proxy, followRedirect: false, followAllRedirects: false });
    expect(fs.createWriteStream).toHaveBeenCalledWith("/unused/avatar");
});

it.each([301, 302, 307, 404])("отклоняет HTTP %s до записи изображения", async statusCode => {
    const req: any = new PassThrough();
    req.abort = jest.fn();
    (request as unknown as jest.Mock).mockReturnValue(req);
    const result = downloadImage(DEFAULT_AVATAR_URL, "/unused/avatar");
    req.emit("response", { statusCode, headers: { location: "http://unix:/tmp/socket:/image" } });
    await expect(result).rejects.toThrow("HTTP-статус");
    expect(req.abort).toHaveBeenCalled();
    expect(request).toHaveBeenCalledTimes(1);
    expect(fs.createWriteStream).not.toHaveBeenCalled();
});
