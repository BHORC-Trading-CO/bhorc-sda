import application from "../../application/application";
import SteamAccountChannels from "../../../interfaces/IpcChannels/SteamAccountChannels";
import { t } from "../../../i18n";

let pending = false;

// A synchronous proxy/link edit can stop many browsers: send one toast for that event.
export default function notifyBrowserRouteChanged() {
    if (pending) return;
    pending = true;
    queueMicrotask(() => {
        pending = false;
        application.sendToMain(SteamAccountChannels.BROWSER_ROUTE_CHANGED, t("errors.browserRouteChanged"));
    });
}
