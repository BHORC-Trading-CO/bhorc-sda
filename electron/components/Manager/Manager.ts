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
import ProxySelection from "../../interfaces/Proxy/ProxySelection";
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
    static RequireProxySelection(selection: ProxySelection) {
        const { proxyMode, proxyId, newProxy } = selection;
        if (proxyMode === "noProxy" && proxyId == null && newProxy == null) return null;
        if (proxyMode === "newProxy" && proxyId == null && newProxy) return null;
        if (proxyMode === "savedProxy" && proxyId && !newProxy) return Manager.RequireProxy(proxyId);
        throw new ProxyUnavailableError(proxyId);
    }
    static PlanProxyAccountLinks(proxyId: string, requested: string[], original: string[] = []) {
        // A form snapshot distinguishes deliberate removals from later links.
        for (const id of [...requested, ...original]) {
            if (!steamAccountManager.getById(id)) throw new Error(`steam account #${id} is not exist`);
        }
        const links = LinksStorage.Get();
        const next = { ...links, steamAccounts: { ...links.steamAccounts } };
        for (const id of original) {
            if (!requested.includes(id) && next.steamAccounts[id] === proxyId) next.steamAccounts[id] = null;
        }
        for (const id of requested) {
            // Keep concurrent relinks of unchanged selections; only apply additions.
            if (!original.includes(id)) next.steamAccounts[id] = proxyId;
        }
        const changed = Object.keys(next.steamAccounts).filter(id => next.steamAccounts[id] !== links.steamAccounts[id]);
        return () => {
            if (!changed.length) return;
            LinksStorage.Save(next);
            Manager.RefreshAccountProxies(changed);
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

    static RefreshAllAccountProxies() {
        Manager.RefreshAccountProxies(steamAccountManager.objects.map(account => account.params.id));
    }
    static RefreshProxyAccounts(proxyId: string) {
        const links = LinksStorage.Get();
        Manager.RefreshAccountProxies(Object.keys(links.steamAccounts).filter(id => links.steamAccounts[id] === proxyId));
    }
    private static RefreshAccountProxies(ids: string[]) {
        const errors: string[] = [];
        for (const id of ids) {
            try { Manager.RefreshAccountProxy(id); } catch (err) { errors.push(String(err)); }
        }
        if (errors.length) throw new Error(errors.join("; "));
    }
    private static RefreshAccountProxy(steamAccountId: string) {
        const steamAccount = steamAccountManager.getById(steamAccountId);
        if (!steamAccount) return;
        try { steamAccount.setProxy(); } catch (err) {
            steamAccount.blockProxy();
            throw err;
        } finally {
            application.images?.invalidateRoute(steamAccountId);
            application.sendToMain(SteamAccountChannels.STEAM_ACCOUNT_EDIT_PROXY, {
                id: steamAccountId, ...Manager.GetSteamAccountLinkedData(steamAccountId),
                ...(steamAccount.proxyState === "missing" ? { proxy: null, proxyState: "missing" } : {})
            });
        }
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
        LinksStorage.Save({ ...links, steamAccounts: { ...links.steamAccounts, [steamAccountId]: proxyId } });
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
