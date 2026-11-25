import { onTrusted } from '../trustedIpc';
import proxyManager, { ProxyManager } from '../../Proxy/proxyManager';
import TableStorage from '../../newStorage/TableStorage';
import Field from '../../../interfaces/TableFields/Field';
import TableProxyInterface from '../../../interfaces/Proxy/TableProxyInterface';
import ProxySetupInterface from '../../../interfaces/Proxy/ProxySetupInterface';
import Proxy from '../../Proxy/Proxy';
import importProxies from '../../Proxy/importProxies';
import ProxyStorage from '../../newStorage/ProxyStorage';
import Manager from '../../Manager/Manager';
import SuperMethods from '../../SuperMethods/SuperMethods';
import ProxyChannels from '../../../interfaces/IpcChannels/ProxyChannels';
import proxyGetTableOptionsListener from '../../Proxy/listeners/proxyGetTableOptionsListener';
import proxySetTableOptionsListener from '../../Proxy/listeners/proxySetTableOptionsListener';
import { t } from "../../../i18n";

export default () => {
    onTrusted('TEST_PROXY', async (event, id: string) => {
        try {
            const proxy = proxyManager.getById(id);
            if (!proxy) throw new Error(t('errors.proxyNotFound', { id }));
            //await SuperMethods.Sleep(3000);
            const testResult = await proxy.test();
            event.reply('TEST_PROXY', { id, testResult });
        } catch (err) {
            event.reply('ERROR', String(err));
        }
    });
    onTrusted('TEST_PROXY_BY_PARAMS', async (event, proxy: ProxySetupInterface) => {
        try {
            const isWork = await Proxy.Test(proxy);
            console.log(isWork);
            event.reply('TEST_PROXY', { id: 'editing_proxy', testResult: isWork });
        } catch (err){
            event.reply('ERROR', String(err));
        }
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
            proxyManager.addNew(proxyObject);
            ProxyStorage.Save(proxyData.id, proxyData);
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
            const applyLinks = archiveOnly ? null : Manager.PlanProxyAccountLinks(
                params.id, params.links.steamAccountIds, params.links.originalSteamAccountIds
            );
            proxyManager.edit(params.id, proxy);
            if (applyLinks) {
                Manager.RequireProxy(params.id);
                applyLinks();
            }
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