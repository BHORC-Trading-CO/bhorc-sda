import { parseUsername, parseAvatarURL, parseLevel } from "../loadSteamAccountData";
import { DEFAULT_AVATAR_URL } from "../../../Functions/sanitizeAvatarUrl";

// Синтетический фрагмент по образцу разметки профиля Steam (2026): data-miniprofile стоит на блоке
// аватара, поэтому старый парсер возвращал пробелы/табы вместо ника. Ник, хеш и id придуманы.
const profileHeader = (name: string) => `
<div class="profile_header_content">
	<div class="playerAvatar profile_header_size offline" data-miniprofile="1">
		<div class="playerAvatarAutoSizeInner">
			<picture>
				<img srcset="https://avatars.akamai.steamstatic.com/0123456789abcdef0123456789abcdef01234567_full.jpg" >
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
        expect(parseUsername(profileHeader("Test Nick"))).toBe("Test Nick");
    });

    it("декодирует HTML-сущности в нике", () => {
        expect(parseUsername(profileHeader("Tom &amp; Jerry &lt;3 &#39;x&#39;"))).toBe("Tom & Jerry <3 'x'");
    });

    it("фолбэк на personaname из g_rgProfileData", () => {
        const body = `<script>g_rgProfileData = {"url":"https:\\/\\/steamcommunity.com\\/id\\/x\\/","steamid":"76561197960265729","personaname":"Nick \\"Q\\" \\u041f","summary":""};</script>`;
        expect(parseUsername(body)).toBe('Nick "Q" П');
    });

    it("возвращает пустую строку, если ника нет", () => {
        expect(parseUsername("<html><body>nothing</body></html>")).toBe("");
    });
});

describe("parseAvatarURL", () => {
    const avatar = "https://avatars.akamai.steamstatic.com/0123456789abcdef0123456789abcdef01234567_full.jpg";
    it("сохраняет аватар из разметки профиля", () => {
        expect(parseAvatarURL(profileHeader("Test Nick"))).toBe(avatar);
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

    // SDA-32: у аккаунта с рамкой первым srcset в шапке идёт картинка рамки, а не аватар.
    // Разметка — по образцу живой, хеши и id придуманы.
    const frame = "https://shared.akamai.steamstatic.com/community_assets/images/items/000000/0000000000000000000000000000000000000000.png";
    const own = "https://avatars.akamai.steamstatic.com/a1b2c3d4e5f60718293a4b5c6d7e8f9012345678_full.jpg";
    const friend = "https://avatars.akamai.steamstatic.com/ffffffffffffffffffffffffffffffffffffffff_medium.jpg";
    const framedHeader = `
<div class="playerAvatar profile_header_size offline" data-miniprofile="1"> <div class="playerAvatarAutoSizeInner">
 <div class="profile_avatar_frame"> <picture> <source media="(prefers-reduced-motion: reduce)" srcset="${frame}"></source>
 <source srcset="${frame}"></source> <img src="${frame}"> </picture> </div>
 <picture> <source media="(prefers-reduced-motion: reduce)" srcset="${own}"></source> <img srcset="${own}"> </picture>
</div> </div>
<div class="friendBlock"><div class="playerAvatar online"><img src="${friend}"></div></div>`;

    it("пропускает рамку аватара и берёт сам аватар", () => {
        expect(parseAvatarURL(framedHeader)).toBe(own);
    });
    it("не берёт аватар друга, если в шапке настоящего аватара нет", () => {
        expect(parseAvatarURL(framedHeader.split(own).join(frame))).toBe(DEFAULT_AVATAR_URL);
    });
});

describe("parseLevel", () => {
    // SDA-31: friendPlayerLevelNum есть и у друзей; свой уровень — только в блоке persona_level.
    const friends = [667, 313, 310].map((level) =>
        `<div class="friendBlock"><div class="friendPlayerLevel lvl_${level}"><span class="friendPlayerLevelNum">${level}</span></div></div>`).join("");
    const ownLevel = (level: number) =>
        `<div class="persona_name persona_level">Level <div class="friendPlayerLevel lvl_10"><span class="friendPlayerLevelNum">${level}</span></div></div>`;

    it("берёт свой уровень, даже если уровни друзей идут раньше", () => {
        expect(parseLevel(friends + ownLevel(16) + friends)).toBe(16);
        expect(parseLevel(ownLevel(16).replace("Level", "Уровень") + friends)).toBe(16);
    });
    it("без своего блока уровень неизвестен, а не уровень друга", () => {
        expect(parseLevel(friends)).toBeNull();
        expect(parseLevel("<html></html>")).toBeNull();
        // Пустой свой блок не должен «дотянуться» до уровня друга ниже по странице
        expect(parseLevel('<div class="persona_name persona_level"></div>' + friends)).toBeNull();
    });
    // Ревью r1: закрывающий тег другим регистром или с пробелом раньше пропускался, и находился уровень друга 99
    it.each(["</div >", "</DIV>", "</ div>", "</Div\n>"])("пустой свой блок, закрытый как %s, — не уровень друга", (closing) => {
        const friend = '<div class="friendPlayerLevel lvl_99"><span class="friendPlayerLevelNum">99</span></div>';
        expect(parseLevel(`<div class="persona_name persona_level">Level ${closing}${friend}`)).toBeNull();
    });
    it("свой блок с разметкой в другом регистре и одинарными кавычками", () => {
        expect(parseLevel("<DIV CLASS='persona_name persona_level'>Level <DIV class='friendPlayerLevel lvl_10'><SPAN CLASS='friendPlayerLevelNum'> 16 </SPAN></DIV></DIV>")).toBe(16);
    });
    it("свой блок не закрыт в пределах лимита — уровень неизвестен", () => {
        const padding = "x".repeat(2000);
        expect(parseLevel(`<div class="persona_name persona_level">${padding}<span class="friendPlayerLevelNum">16</span></div>`)).toBeNull();
    });
});
