import { onTrusted } from '../trustedIpc';
import proxyManager, { ProxyManager } from '../../Proxy/proxyManager';
import TableStorage from '../../newStorage/TableStorage';
import Field from '../../../interfaces/TableFields/Field';
import TableProxyInterface from '../../../interfaces/Proxy/TableProxyInterface';
import ProxySetupInterface from '../../../interfaces/Proxy/ProxySetupInterface';
import Proxy from '../../Proxy/Proxy';
import ProxyStorage from '../../newStorage/ProxyStorage';
import Manager from '../../manager/manager';
import SuperMethods from '../../SuperMethods/SuperMethods';
import ProxyChannels from '../../../interfaces/IpcChannels/ProxyChannels';
import proxyGetTableOptionsListener from '../../Proxy/listeners/proxyGetTableOptionsListener';
import proxySetTableOptionsListener from '../../Proxy/listeners/proxySetTableOptionsListener';

export default () => {
    onTrusted('TEST_PROXY', async (event, id: string) => {
        try {
            const proxy = proxyManager.getById(id);
            if (!proxy) throw new Error(`Прокси #${id} не существует`);
            //await SuperMethods.Sleep(3000);
            const testResult = await proxy.test();
            event.reply('TEST_PROXY', { id, testResult });
        } catch (err) {
            event.reply('ERROR', err);
        }
    });
    onTrusted('TEST_PROXY_BY_PARAMS', async (event, proxy: ProxySetupInterface) => {
        try {
            const isWork = await Proxy.Test(proxy);
            console.log(isWork);
            event.reply('TEST_PROXY', { id: 'editing_proxy', testResult: isWork });
        } catch (err){
            event.reply('ERROR', err);
        }
    }); 
    onTrusted('REFRESH_PROXIES', async (event) => {
        try {
            proxyManager.load();
            const proxies = proxyManager.getCompiledObjects();
            event.reply('GET_PROXIES', proxies);
        } catch (err) {
            event.reply('ERROR', err);
        }
    });
    onTrusted('GET_PROXIES_TABLE_FIELDS', (event) => {
        try {
            const fields = TableStorage.GetFields('proxies');
            event.reply('GET_PROXIES_TABLE_FIELDS', fields);
        } catch (err) {
            event.reply('ERROR', err);
        }
    });
    onTrusted('SAVE_PROXIES_TABLE_FIELDS', async (event, fields: Field[]) => {
        try {
            TableStorage.EditFields('proxies', fields);
        } catch (err) {
            event.reply('ERROR', err);
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
            event.reply('ERROR', err);
        }
    });
    onTrusted('NEW_PROXIES', (event, proxies: ProxySetupInterface[]) => {
        // Каждую строку отдельно: неправильная не должна обрывать импорт на середине,
        // когда часть прокси уже сохранена, а таблица ещё не обновлена.
        const rejected: string[] = [];
        for (var proxy of proxies) {
            try {
                const proxyData = Proxy.Generate(proxy);
                const proxyObject = new Proxy(proxyData);
                proxyManager.addNew(proxyObject);
                ProxyStorage.Save(proxyData.id, proxyData);
            } catch (err) {
                rejected.push(`${proxy && proxy.host}:${proxy && proxy.port} — ${err instanceof Error ? err.message : err}`);
            }
        }
        try {
            proxyManager.sendProxiesToFront();
        } catch (err) {
            event.reply('ERROR', err);
        }
        if (rejected.length) event.reply('ERROR', new Error(`Не добавлено прокси: ${rejected.length}. ${rejected.join("; ")}`));
    });
    onTrusted('EDIT_PROXY', (event, params: { id: string, proxy: { [K in keyof TableProxyInterface]?: TableProxyInterface[K] }, links: { steamAccountIds: string[], profileIds: string[] } }) => {
        try {
            proxyManager.edit(params.id, params.proxy);
            Manager.ResetProxy(params.id);
            for (var steamAccountId of params.links.steamAccountIds) {
                Manager.LinkProxyToSteamAccount(steamAccountId, params.id);
            }
            proxyManager.sendProxiesToFront();
        } catch (err) {
            event.reply('ERROR', err);
        }
    });
    onTrusted('DELETE_PROXY', async (event, id: string) => {
        try {
            Manager.ResetProxy(id);
            proxyManager.delete(id);
        } catch (err) {
            event.reply('ERROR', err);
        }
    });
    onTrusted('GET_PROXIES', (event) => {
        try {
            const proxies = proxyManager.getCompiledObjects();
            event.reply('GET_PROXIES', proxies);
        } catch (err) {
            event.reply('ERROR', err);
        }
    });
    onTrusted(ProxyChannels.PROXY_GET_TABLE_OPTIONS, proxyGetTableOptionsListener);
    onTrusted(ProxyChannels.PROXY_SET_TABLE_OPTIONS, proxySetTableOptionsListener);
}