import { onTrusted } from '../trustedIpc';
import proxyManager, { ProxyManager } from '../../Proxy/proxyManager';
import TableStorage from '../../newStorage/TableStorage';
import Field from '../../../interfaces/TableFields/Field';
import TableProxyInterface from '../../../interfaces/Proxy/TableProxyInterface';
import ProxySetupInterface from '../../../interfaces/Proxy/ProxySetupInterface';
import { ProxyTestResult } from '../../../interfaces/Proxy/ProxyResults';
import Proxy from '../../Proxy/Proxy';
import importProxies from '../../Proxy/importProxies';
import { sanitizeProxySetup } from '../../Functions/sanitizeSmaFile';
import ProxyStorage from '../../newStorage/ProxyStorage';
import Manager from '../../Manager/Manager';
import SuperMethods from '../../SuperMethods/SuperMethods';
import ProxyChannels from '../../../interfaces/IpcChannels/ProxyChannels';
import proxyGetTableOptionsListener from '../../Proxy/listeners/proxyGetTableOptionsListener';
import proxySetTableOptionsListener from '../../Proxy/listeners/proxySetTableOptionsListener';
import { t } from "../../../i18n";

export default () => {
    // Каждая проверка получает ровно один ответ TEST_PROXY со своим requestId — и при отказе тоже (SDA-64).
    onTrusted('TEST_PROXY', async (event, params: { requestId: string, id: string }) => {
        const { requestId, id } = params;
        const proxy = proxyManager.getById(id);
        if (!proxy) return event.reply('TEST_PROXY', { requestId, id, ok: false, error: t('errors.proxyNotFound', { id }) });
        // Снимок до запроса: пока идёт проверка, прокси могут изменить.
        const { host, port, username, password } = proxy.params;
        const result = await proxy.test();
        event.reply('TEST_PROXY', { requestId, id, tested: { host, port, username, password }, ...result });
    });
    onTrusted('TEST_PROXY_BY_PARAMS', async (event, params: { requestId: string, proxy: ProxySetupInterface }) => {
        let result: ProxyTestResult;
        try {
            result = await Proxy.Test(sanitizeProxySetup(params.proxy));
        } catch (err) {
            result = { ok: false, error: err instanceof Error ? err.message : String(err) };
        }
        event.reply('TEST_PROXY', { requestId: params.requestId, ...result });
    });
    onTrusted('REFRESH_PROXIES', async (event) => {
        try {
            proxyManager.load();
            const proxies = proxyManager.getCompiledObjects();
            event.reply('GET_PROXIES', proxies);
        } catch (err) {
            event.reply('ERROR', String(err));
        }
    });
    onTrusted('GET_PROXIES_TABLE_FIELDS', (event) => {
        try {
            const fields = TableStorage.GetFields('proxies');
            event.reply('GET_PROXIES_TABLE_FIELDS', fields);
        } catch (err) {
            event.reply('ERROR', String(err));
        }
    });
    onTrusted('SAVE_PROXIES_TABLE_FIELDS', async (event, fields: Field[]) => {
        try {
            TableStorage.EditFields('proxies', fields);
        } catch (err) {
            event.reply('ERROR', String(err));
        }
    });
    onTrusted('NEW_PROXY', (event, params: { proxy: ProxySetupInterface, links: { steamAccountIds: string[], profileIds: string[] } }) => {
        try {
            const proxyData = Proxy.Generate(params.proxy);
            const proxyObject = new Proxy(proxyData);
            ProxyStorage.Save(proxyData.id, proxyData);
            proxyManager.addNew(proxyObject);
            for (var steamAccountId of params.links.steamAccountIds) {
                Manager.LinkProxyToSteamAccount(steamAccountId, proxyData.id);
            }
            proxyManager.sendProxiesToFront();
        } catch (err) {
            event.reply('ERROR', String(err));
        }
    });
    onTrusted('NEW_PROXIES', (event, params: { requestId: string, text: string }) => {
        const result = importProxies(String(params.text));
        try {
            proxyManager.sendProxiesToFront();
        } catch (err) {
            event.reply('ERROR', String(err));
        }
        event.reply(ProxyChannels.PROXY_BULK_RESULT, { requestId: params.requestId, ...result });
    });
    onTrusted('EDIT_PROXY', (event, params: { id: string, proxy: { [K in keyof TableProxyInterface]?: TableProxyInterface[K] }, links: { steamAccountIds: string[], profileIds?: string[], originalSteamAccountIds?: string[] }, requestId?: string }) => {
        // Окно правки (requestId) ждёт ответа: закрывается после успеха, отказ показывает в форме.
        const { requestId } = params;
        try {
            const archiveOnly = Object.keys(params.proxy).length === 1 && "deleted" in params.proxy;
            const proxy = archiveOnly ? params.proxy : proxyManager.sanitizeEdit(params.id, params.proxy);
            const plan = archiveOnly ? null : Manager.PlanProxyAccountLinks(
                params.id, params.links.steamAccountIds, params.links.originalSteamAccountIds
            );
            proxyManager.edit(params.id, proxy, plan);
            proxyManager.sendProxiesToFront();
            if (requestId) event.reply(ProxyChannels.PROXY_EDIT_RESULT, { requestId });
        } catch (err) {
            if (requestId) event.reply(ProxyChannels.PROXY_EDIT_RESULT, { requestId, error: err instanceof Error ? err.message : String(err) });
            else event.reply('ERROR', String(err));
        }
    });
    onTrusted('DELETE_PROXY', async (event, id: string) => {
        try {
            proxyManager.delete(id);
        } catch (err) {
            event.reply('ERROR', String(err));
        }
    });
    onTrusted('GET_PROXIES', (event) => {
        try {
            const proxies = proxyManager.getCompiledObjects();
            event.reply('GET_PROXIES', proxies);
        } catch (err) {
            event.reply('ERROR', String(err));
        }
    });
    onTrusted(ProxyChannels.PROXY_GET_TABLE_OPTIONS, proxyGetTableOptionsListener);
    onTrusted(ProxyChannels.PROXY_SET_TABLE_OPTIONS, proxySetTableOptionsListener);
}