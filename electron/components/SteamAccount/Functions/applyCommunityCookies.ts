import SteamCommunity from "steamcommunity";
import { LoginSession } from "steam-session";
import getCommunityWebCookies from "./getCommunityWebCookies";

/**
 * Ставит в SteamCommunity cookie именно для steamcommunity.com (aud: web:community).
 *
 * Зачем: steamLoginSecure доменно-специфичен, а session.getWebCookies() из steam-session
 * дёргает ВСЕ transfer-домены из finalizelogin и через promiseAny отдаёт cookie того,
 * кто ответил первым (может быть store/help/steampowered). Через прокси гонку почти всегда
 * выигрывает НЕ community-домен, и тогда любой запрос к steamcommunity.com отвечает
 * редиректом на логин → loggedIn() = false → "Not logged in" сразу после ввода кода с почты.
 *
 * Поэтому сначала повторяем целевой поток finalizelogin -> settoken именно для
 * steamcommunity.com, и только если он не сработал — падаем на старый путь.
 */
export default async function applyCommunityCookies(
    community: SteamCommunity,
    session: LoginSession,
    proxyUrl?: string | null,
    label?: string
): Promise<void> {
    const refreshToken = session.refreshToken;
    const steamID64 = session.steamID ? session.steamID.getSteamID64() : null;
    const prefix = label ? `${label} - ` : "";

    if (refreshToken && steamID64) {
        try {
            const cookies = await getCommunityWebCookies(refreshToken, steamID64, proxyUrl);
            community.setCookies(cookies);
            return;
        } catch (err) {
            console.log(`${prefix}getCommunityWebCookies failed, fallback to getWebCookies: ${err}`);
        }
    }

    const cookies = await session.getWebCookies();
    community.setCookies(cookies);
}
