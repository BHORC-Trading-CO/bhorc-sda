import request, { RequestAPI, Request, CoreOptions, RequiredUriUrl, Options, Response, UriOptions, UrlOptions } from 'request';
import ProxySetupInterface from '../../interfaces/Proxy/ProxySetupInterface';

class RequestPromise {
    object: RequestAPI<Request, CoreOptions, RequiredUriUrl>;

    constructor(proxy: ProxySetupInterface | null | undefined) { 
        if (proxy) {
            this.object = request.defaults({ proxy: `http://${proxy.username}:${proxy.password}@${proxy.host}:${proxy.port}`, timeout: 3000 });
        } else {
            this.object = request;
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