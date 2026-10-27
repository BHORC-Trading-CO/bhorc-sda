import { parseUsername, parseAvatarURL } from "../loadSteamAccountData";
import { DEFAULT_AVATAR_URL } from "../../../Functions/sanitizeAvatarUrl";

// Фрагмент реальной разметки профиля Steam (2026): data-miniprofile стоит на блоке аватара,
// поэтому старый парсер возвращал пробелы/табы вместо ника.
const profileHeader = (name: string) => `
<div class="profile_header_content">
	<div class="playerAvatar profile_header_size offline" data-miniprofile="22202">
		<div class="playerAvatarAutoSizeInner">
			<picture>
				<img srcset="https://avatars.akamai.steamstatic.com/c5d56249ee5d28a07db4ac9f7f60af961fab5426_full.jpg" >
			</picture>
		</div>
	</div>
	<div class="profile_header_centered_col">
		<div class="persona_name" style="font-size: 24px;">
			<span class="actual_persona_name">${name}</span>
		</div>
	</div>
</div>`;

describe("parseUsername", () => {
    it("берёт ник из actual_persona_name, а не после data-miniprofile", () => {
        expect(parseUsername(profileHeader("Rabscuttle"))).toBe("Rabscuttle");
    });

    it("декодирует HTML-сущности в нике", () => {
        expect(parseUsername(profileHeader("Tom &amp; Jerry &lt;3 &#39;x&#39;"))).toBe("Tom & Jerry <3 'x'");
    });

    it("фолбэк на personaname из g_rgProfileData", () => {
        const body = `<script>g_rgProfileData = {"url":"https:\\/\\/steamcommunity.com\\/id\\/x\\/","steamid":"76561197960287930","personaname":"Nick \\"Q\\" \\u041f","summary":""};</script>`;
        expect(parseUsername(body)).toBe('Nick "Q" П');
    });

    it("возвращает пустую строку, если ника нет", () => {
        expect(parseUsername("<html><body>nothing</body></html>")).toBe("");
    });
});

describe("parseAvatarURL", () => {
    const avatar = "https://avatars.akamai.steamstatic.com/c5d56249ee5d28a07db4ac9f7f60af961fab5426_full.jpg";
    it("сохраняет реальный аватар из разметки профиля", () => {
        expect(parseAvatarURL(profileHeader("Rabscuttle"))).toBe(avatar);
    });
    it("берёт первый URL из srcset с дескрипторами", () => {
        const fastly = avatar.replace("akamai", "fastly");
        expect(parseAvatarURL(profileHeader("Name").replace(avatar, `${fastly} 1x, ${avatar} 2x`))).toBe(fastly);
    });
    it("поддерживает старую разметку с тем же CDN", () => {
        expect(parseAvatarURL(`<div class="user_avatar playerAvatar offline"><img src="${avatar}"></div>`)).toBe(avatar);
    });
    it("заменяет посторонние URL и отсутствующий аватар", () => {
        expect(parseAvatarURL(profileHeader("Name").replace(avatar, "http://unix:/tmp/socket:/image"))).toBe(DEFAULT_AVATAR_URL);
        expect(parseAvatarURL("<html></html>")).toBe(DEFAULT_AVATAR_URL);
        expect(parseAvatarURL('<div class="user_avatar playerAvatar offline"></div>')).toBe(DEFAULT_AVATAR_URL);
    });
});
