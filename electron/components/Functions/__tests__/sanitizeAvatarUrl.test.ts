import sanitizeAvatarUrl, { DEFAULT_AVATAR_URL } from "../sanitizeAvatarUrl";

const hash = "c5d56249ee5d28a07db4ac9f7f60af961fab5426";
const valid = `https://avatars.akamai.steamstatic.com/${hash}_full.jpg`;

describe("sanitizeAvatarUrl", () => {
    it.each(["akamai", "fastly", "cloudflare"].flatMap(host =>
        ["", "_medium", "_full"].map(size => `https://avatars.${host}.steamstatic.com/${hash}${size}.jpg`)
    ))("сохраняет CDN-аватар %s", url => {
        expect(sanitizeAvatarUrl(url)).toBe(url);
    });

    it("сохраняет существующий стандартный аватар", () => {
        expect(sanitizeAvatarUrl(DEFAULT_AVATAR_URL)).toBe(DEFAULT_AVATAR_URL);
    });

    it.each([
        undefined, null, 42, {}, [], "", "http://unix:/tmp/steam.sock:/avatar.jpg",
        valid.replace("https:", "http:"), "javascript:alert(1)", "data:image/svg+xml,<svg/>",
        "file:///tmp/avatar.jpg", "//avatars.akamai.steamstatic.com/" + hash + ".jpg",
        valid.replace("avatars.akamai.steamstatic.com", "example.com"),
        valid.replace("steamstatic.com", "steamstatic.com.evil.test"),
        valid.replace("steamstatic.com", "steamstatic.com@evil.test"),
        valid.replace("https://", "https://user:pass@"),
        valid.replace("steamstatic.com/", "steamstatic.com:443/"),
        valid.replace("steamstatic.com/", "steamstatic.com./"),
        valid.replace("steamstatic.com/", "steamstatic.com/a/../"),
        valid.replace("steamstatic.com/", "steamstatic.com/%2e%2e/"),
        valid.replace("steamstatic.com/", "steamstatic.com/./"),
        valid.replace("steamstatic.com/", "steamstatic.com\\"),
        valid + "?url=http://127.0.0.1/", valid + "#fragment", valid + "/../other.jpg",
        valid + "\n", " " + valid, valid + " ", valid + "\u0000",
        valid.replace(hash, hash.toUpperCase()), valid.replace(hash, hash.slice(1)),
        valid.replace(".jpg", ".webp"), valid.replace("_full", "_large"),
        `https://steamcdn-a.akamaihd.net/steamcommunity/public/images/avatars/c5/${hash}_full.jpg`,
    ])("заменяет недопустимый ввод %#", url => {
        expect(sanitizeAvatarUrl(url)).toBe(DEFAULT_AVATAR_URL);
    });
});
