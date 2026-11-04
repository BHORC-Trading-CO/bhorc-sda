import ProxyInterface from "../../interfaces/Proxy/ProxyInterface";
import RequestPromise from "../Request/Request";
import { v4 as uuidv4 } from 'uuid';
import ProxyStorage from "../newStorage/ProxyStorage";
import ProxySetupInterface from "../../interfaces/Proxy/ProxySetupInterface";
import proxyManager from "./proxyManager";
import { sanitizeProxySetup } from "../Functions/sanitizeSmaFile";

class Proxy {
    params: ProxyInterface;
    get request(): RequestPromise { return new RequestPromise(this.params); }

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
    test(): Promise<boolean> {
        return new Promise((resolve, reject) => {
            this.request.send({ url: 'https://steamcommunity.com/' })
                .then(({ response, body }) => {
                    if (response.statusCode === 200) {
                        resolve(true);
                    } else {
                        reject(false);
                    }
                })
                .catch(err => {
                    resolve(false);
                });
        });
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

    static Test(proxy: ProxySetupInterface){
        return new Promise((resolve, reject)=>{
            const newRequest = new RequestPromise(proxy);
            newRequest.send({ url: 'https://steamcommunity.com/' })
            .then(({ response, body }) => {
                if (response.statusCode === 200) {
                    resolve(true);
                } else {
                    resolve(false);
                }
            })
            .catch(err => {
                resolve(false);
            });
        });
    }
}

export default Proxy;
