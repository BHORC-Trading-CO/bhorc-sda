import https from "https";
import { EAuthTokenPlatformType, LoginSession } from "steam-session";
import ProxyUnavailableError from "./ProxyUnavailableError";

/** One agent for HTTP and HTTPS; never constructs a socket (including redirects). */
export function blockedAgent(proxyId: string | null): https.Agent {
    return Object.assign(new https.Agent(), {
        // Node accepts either protocol when the agent does not constrain it.
        protocol: undefined,
        createConnection: (_options: unknown, callback: (err: Error) => void) => {
            callback(new ProxyUnavailableError(proxyId));
            return undefined;
        }
    });
}

export function blockedSession(proxyId: string | null): LoginSession {
    const fail = async () => { throw new ProxyUnavailableError(proxyId); };
    const options = {
        agent: blockedAgent(proxyId),
        transport: { sendRequest: fail, close() {} },
    };
    const session = new LoginSession(EAuthTokenPlatformType.MobileApp, options);
    // Installed steam-session 1.2 ignores options.agent. Its token/cookie paths also
    // bypass options.transport. All share this client, so block that entry point too.
    const client = (session as unknown as { _webClient: { request: typeof fail } })._webClient;
    if (client) client.request = fail;
    return session;
}
