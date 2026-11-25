import ProxyInterface from "../../interfaces/Proxy/ProxyInterface";
import RequestPromise from "../Request/Request";
import { v4 as uuidv4 } from 'uuid';
import ProxyStorage from "../newStorage/ProxyStorage";
import ProxySetupInterface from "../../interfaces/Proxy/ProxySetupInterface";
import { ProxyTestResult } from "../../interfaces/Proxy/ProxyResults";
import proxyManager from "./proxyManager";
import { sanitizeProxySetup } from "../Functions/sanitizeSmaFile";

class Proxy {
    params: ProxyInterface;

    constructor(proxy: ProxyInterface) {
        this.params = proxy;
    }

    editParams(newParams: { [K in keyof ProxyInterface]?: ProxyInterface[K] }) {
        for (var i in this.params) {
            if (typeof (newParams[i]) !== 'undefined') {
                this.params[i] = newParams[i];
            }
        }
        ProxyStorage.EditData(this.params.id, newParams);
    }
    test(): Promise<ProxyTestResult> {
        return Proxy.Test(this.params);
    }
    static Generate(proxy: ProxySetupInterface) {
        // Нумеруем относительно активных прокси: удалённые (архивные) не должны
        // оставлять "дыры" в нумерации новых прокси.
        const proxiesArray = proxyManager.objects
            .map(p => p.params)
            .filter(p => !p.deleted);
        proxiesArray.sort((a, b) => a.number < b.number ? 1 : -1);

        const params: ProxyInterface = {
            ...sanitizeProxySetup(proxy),
            id: uuidv4(),
            number: proxiesArray.length === 0 ? 1 : proxiesArray[0].number + 1,
            deleted: false,
        }
        return params;
    }

    /**
     * Не реджектится: любой исход, включая неполный адрес, — результат (SDA-64). Не 200 (403, 429) —
     * прокси работает, отказал Steam: отдаём код, а не общую ошибку.
     */
    static Test(proxy: ProxySetupInterface): Promise<ProxyTestResult> {
        return new Promise((resolve) => {
            const fail = (err: unknown) => resolve({ ok: false, error: err instanceof Error ? err.message : String(err) });
            try {
                new RequestPromise(proxy).send({ url: 'https://steamcommunity.com/' })
                    .then(({ response }) => {
                        const { statusCode } = response;
                        resolve(statusCode === 200 ? { ok: true } : { ok: false, statusCode });
                    })
                    .catch(fail);
            } catch (err) {
                fail(err);
            }
        });
    }
}

export default Proxy;
