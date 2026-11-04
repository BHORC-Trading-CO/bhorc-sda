import proxyManager, { ProxyManager } from "../Proxy/proxyManager";
import steamAccountManager, { SteamAccountManager } from "../SteamAccount/steamAccountManager";
import groupManager from "../Group/groupManager";
import LinksStorage from "../newStorage/LinksStorage";
import SteamAccountInterface from "../../interfaces/SteamAccount/SteamAccountInterface";
import application from "../application/application";
import SteamAccountChannels from "../../interfaces/IpcChannels/SteamAccountChannels";
import ProxyUnavailableError from "../Proxy/ProxyUnavailableError";
import buildProxyUrl from "../Proxy/proxyUrl";
import ProxyInterface from "../../interfaces/Proxy/ProxyInterface";
import { ProxyState } from "../../interfaces/Proxy/ProxyState";

class Manager {
    static ResolveProxy(proxyId?: string | null): { proxy: ProxyInterface | null; proxyState: ProxyState; proxyId: string | null } {
        if (proxyId == null) return { proxy: null, proxyState: "none", proxyId: null };
        const proxy = proxyManager.getById(proxyId)?.params ?? null;
        if (proxy) {
            try {
                buildProxyUrl(proxy);
                return { proxy, proxyState: "ok", proxyId };
            } catch (err) {
                if (!(err instanceof ProxyUnavailableError)) throw err;
            }
        }
        return { proxy, proxyState: "missing", proxyId };
    }
    static GetSteamAccountLinkedData(steamAccountId: string) {
        return Manager.ResolveProxy(LinksStorage.Get().steamAccounts[steamAccountId]);
    }
    /** For form selections: an unresolved selection is never an implicit opt-out. */
    static RequireProxy(proxyId?: string | null) {
        const linked = Manager.ResolveProxy(proxyId);
        if (linked.proxyState === "missing") throw new ProxyUnavailableError(linked.proxyId);
        return linked.proxy;
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

    static RefreshAllAccountProxies() {
        for (const account of steamAccountManager.objects) Manager.RefreshAccountProxy(account.params.id);
    }
    static RefreshProxyAccounts(proxyId: string) {
        const links = LinksStorage.Get();
        for (const steamAccountId of Object.keys(links.steamAccounts)) {
            if (links.steamAccounts[steamAccountId] === proxyId) Manager.RefreshAccountProxy(steamAccountId);
        }
    }
    private static RefreshAccountProxy(steamAccountId: string) {
        const steamAccount = steamAccountManager.getById(steamAccountId);
        if (!steamAccount) return;
        steamAccount.setProxy();
        application.sendToMain(SteamAccountChannels.STEAM_ACCOUNT_EDIT_PROXY, {
            id: steamAccountId, ...Manager.GetSteamAccountLinkedData(steamAccountId)
        });
    }
    // Only explicit account-list edits may unlink. Deletion keeps dangling links.
    static ResetProxy(proxyId: string) {
        const links = LinksStorage.Get();
        const ids = Object.keys(links.steamAccounts).filter(id => links.steamAccounts[id] === proxyId);
        for (const id of ids) links.steamAccounts[id] = null;
        LinksStorage.Save(links);
        for (const id of ids) Manager.RefreshAccountProxy(id);
    }
    static LinkProxyToSteamAccount(steamAccountId: string, proxyId: string | null) {
        const steamAccount = steamAccountManager.getById(steamAccountId);
        if (!steamAccount) throw new Error(`steam account #${steamAccountId} is not exist`);
        Manager.RequireProxy(proxyId);
        const links = LinksStorage.Get();
        links.steamAccounts[steamAccountId] = proxyId;
        LinksStorage.Save(links);
        Manager.RefreshAccountProxy(steamAccountId);
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