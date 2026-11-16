import { app, App } from "electron";
import { DISABLE_FEATURES_SWITCH, mergeFeatureLists, SECURE_DNS_FEATURES } from "../Functions/chromiumFeatures";

type SecureDnsApp = Pick<App, "commandLine" | "configureHostResolver" | "isReady" | "once">;

/**
 * Turns DNS-over-HTTPS off for the app's own network service (SDA-26). With a DoH-capable system
 * resolver Chromium upgraded lookups to chrome.cloudflare-dns.com and connected to it from the
 * real IP, outside every account proxy.
 *
 * Call it from main.ts before firstStage, while the main script is still loading. Two layers:
 * - --disable-features=DnsOverHttps: Chromium switches only count when appended before ready,
 *   so the resolver should start with DoH off; a --disable-features already on the command line
 *   is extended, not replaced;
 * - configureHostResolver({ secureDnsMode: "off" }) (Electron 17 API, needs the ready event):
 *   this listener is registered before the one in firstStage, so it runs before any window is
 *   created, whatever the feature switch did.
 */
export function disableSecureDns(target: SecureDnsApp = app): void {
    const { commandLine } = target;
    commandLine.appendSwitch(DISABLE_FEATURES_SWITCH, mergeFeatureLists(commandLine.getSwitchValue(DISABLE_FEATURES_SWITCH), SECURE_DNS_FEATURES));
    const configure = () => target.configureHostResolver({ secureDnsMode: "off" });
    if (target.isReady()) configure();
    else target.once("ready", configure);
}
