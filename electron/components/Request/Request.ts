import request, { RequestAPI, Request, CoreOptions, RequiredUriUrl, Options, Response, UriOptions, UrlOptions } from 'request';
import ProxySetupInterface from '../../interfaces/Proxy/ProxySetupInterface';

class RequestPromise {
    object: RequestAPI<Request, CoreOptions, RequiredUriUrl>;

    // Защита приватности (fail-closed): без прокси сетевой запрос запрещён,
    // иначе реальный IP уйдёт напрямую. Прямой запрос возможен только при
    // явном allowDirect=true (для мест, где это осознанно нужно).
    constructor(proxy: ProxySetupInterface | null | undefined, allowDirect: boolean = false) {
        if (proxy) {
            this.object = request.defaults({ proxy: `http://${proxy.username}:${proxy.password}@${proxy.host}:${proxy.port}`, timeout: 3000 });
        } else if (allowDirect) {
            this.object = request;
        } else {
            throw new Error('RequestPromise: запрос без прокси запрещён (защита от утечки реального IP). Передайте прокси или allowDirect=true.');
        }
    }

    send(options: request.RequiredUriUrl & request.CoreOptions): Promise<{ response: Response, body: any }> {
        return new Promise((resolve, reject) => {
            this.object(options, (err: any, response: any, body: any) => {
                if (err) {
                    reject(err);
                }
                resolve({ response, body });
            });
        });
    }
}

export default RequestPromise;