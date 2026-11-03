import proxyManager, { ProxyManager } from "../Proxy/proxyManager";
import steamAccountManager, { SteamAccountManager } from "../SteamAccount/steamAccountManager";
import groupManager from "../Group/groupManager";
import LinksStorage from "../newStorage/LinksStorage";
import SteamAccountInterface from "../../interfaces/SteamAccount/SteamAccountInterface";
import application from "../application/application";
import SteamAccountChannels from "../../interfaces/IpcChannels/SteamAccountChannels";
import { t } from "../../i18n";

class Manager {
    static GetSteamAccountLinkedData(steamAccountId: string) {
        const links = LinksStorage.Get();
        const proxyId = links.steamAccounts[steamAccountId];
        const proxy = proxyId ? proxyManager.getById(proxyId) : null;
        return {
            proxy: proxy ? proxy.params : null
        };
    }
    static GetProxyLinkedData(proxyId: string) {
        const links = LinksStorage.Get();

        const steamAccountIds: string[] = [];
        for (var saId of Object.keys(links.steamAccounts)) {
            const prId = links.steamAccounts[saId];
            if (prId === proxyId) {
                steamAccountIds.push(saId);
            }
        }
        const steamAccounts: SteamAccountInterface[] = [];
        for (var steamAccountId of steamAccountIds) {
            const steamAccount = steamAccountManager.getById(steamAccountId);
            if (steamAccount) steamAccounts.push(steamAccount.params);
        }

        return {
            steamAccounts
        };
    }

    static ResetProxy(proxyId: string) {
        const links = LinksStorage.Get();
        for (var steamAccountId of Object.keys(links.steamAccounts)) {
            if (links.steamAccounts[steamAccountId] === proxyId) {
                links.steamAccounts[steamAccountId] = null;
                // Сбрасываем прокси и в живом объекте аккаунта, иначе in-memory .proxy
                // останется указывать на удалённый прокси и guard'ы его пропустят.
                const steamAccount = steamAccountManager.getById(steamAccountId);
                if (steamAccount) {
                    steamAccount.setProxy(null);
                    application.sendToMain(SteamAccountChannels.STEAM_ACCOUNT_EDIT_PROXY, { id: steamAccountId, proxy: null });
                }
            }
        }

        LinksStorage.Save(links);
    }
    static LinkProxyToSteamAccount(steamAccountId: string, proxyId: string | null) {
        const links = LinksStorage.Get();
        if (proxyId) {
            const proxies = proxyManager.getCompiledObjects();
            const proxy = proxies.filter(p => p.id === proxyId)[0];
            const steamAccount = steamAccountManager.getById(steamAccountId);
            if (!steamAccount) throw new Error(`steam account #${steamAccountId} is not exist`);
            // Прокси привязан, но объекта нет — раньше уходили в setProxy(undefined),
            // т.е. связь сохранялась, а трафик шёл НАПРЯМУЮ с реального IP. Падаем явно
            // и связь не сохраняем: лучше видимая ошибка, чем тихая утечка IP.
            if (!proxy) throw new Error(t("errors.proxyLinkMissing", { proxyId, steamAccountId }));
            links.steamAccounts[steamAccountId] = proxyId;
            LinksStorage.Save(links);
            steamAccount.setProxy(proxy);
            application.sendToMain(SteamAccountChannels.STEAM_ACCOUNT_EDIT_PROXY, { id: steamAccountId, proxy });
        } else {
            links.steamAccounts[steamAccountId] = proxyId;
            LinksStorage.Save(links);
            const steamAccount = steamAccountManager.getById(steamAccountId);
            if (!steamAccount) throw new Error(`steam account #${steamAccountId} is not exist`);
            steamAccount.setProxy(null);
            application.sendToMain(SteamAccountChannels.STEAM_ACCOUNT_EDIT_PROXY, { id: steamAccountId, proxy: null })
        }
        proxyManager.sendProxiesToFront();
    }

    // --- Группы аккаунтов (одна группа на аккаунт, хранится в links.groups) ---

    // Группа аккаунта или null. Аналог GetSteamAccountLinkedData для прокси.
    static GetSteamAccountGroup(steamAccountId: string) {
        const links = LinksStorage.Get();
        const groupId = links.groups[steamAccountId];
        if (!groupId) return null;
        const group = groupManager.getById(groupId);
        return group ? group.params : null;
    }

    // Id аккаунтов, входящих в группу. Аналог GetProxyLinkedData (обратный поиск).
    static GetGroupSteamAccountIds(groupId: string): string[] {
        const links = LinksStorage.Get();
        const ids: string[] = [];
        for (var saId of Object.keys(links.groups)) {
            if (links.groups[saId] === groupId) ids.push(saId);
        }
        return ids;
    }

    // Привязать аккаунт к группе (groupId=null — убрать из группы). Аналог LinkProxyToSteamAccount.
    static LinkGroupToSteamAccount(steamAccountId: string, groupId: string | null) {
        const links = LinksStorage.Get();
        links.groups[steamAccountId] = groupId;
        LinksStorage.Save(links);
    }

    // При удалении группы обнуляем все ссылки на неё. Аналог ResetProxy.
    static ResetGroup(groupId: string) {
        const links = LinksStorage.Get();
        for (var steamAccountId of Object.keys(links.groups)) {
            if (links.groups[steamAccountId] === groupId) {
                links.groups[steamAccountId] = null;
            }
        }
        LinksStorage.Save(links);
    }

    static Load() {
        // Группы грузим первыми: CompileObject аккаунта подмешивает группу через getById.
        groupManager.load();
        proxyManager.load();
        steamAccountManager.load();
    }
}

export default Manager;