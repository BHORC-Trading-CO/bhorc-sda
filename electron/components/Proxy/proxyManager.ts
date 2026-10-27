import ProxyStorage from "../newStorage/ProxyStorage";
import Proxy from "./Proxy";
import ProxyInterface from "../../interfaces/Proxy/ProxyInterface";
import CompiledProxyInterface from '../../interfaces/Proxy/CompiledProxyInterface';
import ProxySetupInterface from '../../interfaces/Proxy/ProxySetupInterface';
import getProxyGeo, { ProxyGeo } from '../SteamAccount/Functions/getProxyGeo';
import buildProxyUrl from './proxyUrl';
import Manager from "../manager/manager";
import application from "../application/application";

export class ProxyManager {
    objects: Proxy[];

    constructor() {
        this.objects = [];
    }

    addNew(proxy: Proxy) {
        try {
            this.objects = [...this.objects, proxy];
            /*
            for (var profileId of proxy.params.profileIds){
                Manager.LinkProxyToProfile(profileId, proxy.params.id);
            }
            for (var steamAccountId of proxy.params.steamAccountIds){
                console.log(`link sa#${steamAccountId} to p#${proxy.params.id}`);
                Manager.LinkProxyToSteamAccount(steamAccountId, proxy.params.id);
            }*/

        } catch (err) {
            throw new Error(`Cant add new steam account to manager: ${err}`);
        }
    }
    delete(id: string) {
        try {
            const index = this.objects.findIndex(obj => obj.params.id === id);
            if (index === -1) throw new Error(`#${id} - proxy is not exist`);
            this.objects.splice(index, 1);
            ProxyStorage.Delete(id);
        } catch (err) {
            throw new Error(`Cant delete proxy: ${err}`);
        }
    }
    edit(id: string, newProxyData: { [K in keyof ProxyInterface]?: ProxyInterface[K] }) {
        try {
            const object = this.objects.find(object => object.params.id === id);
            if (!object) throw new Error(`#${id} - proxy is not exist`);
            // При смене host/port кешированные гео-данные устаревают — сбрасываем.
            if (typeof newProxyData.host !== 'undefined' || typeof newProxyData.port !== 'undefined') {
                newProxyData = { ...newProxyData, timezone: "", countryCode: "" };
            }
            object.editParams(newProxyData);
        } catch (err) {
            throw new Error(`Cant edit proxy: ${err}`);
        }
    }
    /** Возвращает гео прокси (таймзона + страна): из кеша, иначе запрашивает через прокси и кеширует. */
    async getProxyGeo(proxyId: string): Promise<ProxyGeo> {
        const proxy = this.getById(proxyId);
        if (!proxy) return { timezone: null, countryCode: null };
        if (proxy.params.timezone && proxy.params.countryCode) {
            return { timezone: proxy.params.timezone, countryCode: proxy.params.countryCode };
        }
        const geo = await getProxyGeo(buildProxyUrl(proxy.params));

        // editParams обновляет только существующие ключи params, поэтому новые ключи
        // проставляем в in-memory объект напрямую, а затем персистим только заполненные.
        const updates: { [K in keyof typeof geo]?: string } = {};
        if (geo.timezone) { proxy.params.timezone = geo.timezone; updates.timezone = geo.timezone; }
        if (geo.countryCode) { proxy.params.countryCode = geo.countryCode; updates.countryCode = geo.countryCode; }
        if (Object.keys(updates).length) proxy.editParams(updates as any);

        return {
            timezone: proxy.params.timezone || null,
            countryCode: proxy.params.countryCode || null,
        };
    }
    load() {
        try {
            const proxies = ProxyStorage.GetAll();
            console.log('load proxies: ');
            const objectsArray = Object.values(proxies);
            this.objects = [];
            for (var object of objectsArray) {
                const proxy = new Proxy(object);
                this.addNew(proxy);
            }
            this.sendProxiesToFront();
        } catch (err) {
            throw new Error(`Cant load proxies: ${err}`);
        }
    }
    sendProxiesToFront() {
        const proxies = this.getCompiledObjects();
        application.sendToMain('GET_PROXIES', proxies);
    }
    getCompiledObjects() {
        const compiledObjects: CompiledProxyInterface[] = [];
        for (var proxy of this.objects) {
            const compiledObject = ProxyManager.CompileObject(proxy);
            compiledObjects.push(compiledObject);
        }
        console.log('compiled proxy:');
        return compiledObjects;
    }
    getById(id: string) {
        const objects = this.objects.filter(obj => obj.params.id === id);
        if (objects.length === 0) return null;
        return objects[0];
    }
    /** Находит активный (не удалённый) прокси по host:port или создаёт новый. Возвращает прокси. */
    getOrCreateBySetup(setup: ProxySetupInterface) {
        const existing = this.objects.find(p =>
            !p.params.deleted &&
            p.params.host === setup.host &&
            String(p.params.port) === String(setup.port)
        );
        if (existing) return existing;

        const proxyData = Proxy.Generate(setup);
        const proxyObject = new Proxy(proxyData);
        this.addNew(proxyObject);
        ProxyStorage.Save(proxyData.id, proxyData);
        return proxyObject;
    }
    static CompileObject(object: Proxy) {
        try {
            const linkedData = Manager.GetProxyLinkedData(object.params.id);

            const compiledObject: CompiledProxyInterface = {
                ...object.params,
                steamAccounts: linkedData.steamAccounts,
                steamAccountIds: linkedData.steamAccounts.map(sa => sa.id)
            }
            return compiledObject;
        } catch (err) {
            throw new Error(`Error in compile proxy: ${err}`);
        }
    }
}

export default new ProxyManager();