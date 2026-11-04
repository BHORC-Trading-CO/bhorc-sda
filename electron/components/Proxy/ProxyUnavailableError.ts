import { t } from "../../i18n";

export default class ProxyUnavailableError extends Error {
    readonly code = "PROXY_UNAVAILABLE";

    constructor(id?: string | null) {
        super(t("errors.proxyUnavailable", { id: id ?? "?" }));
        this.name = "ProxyUnavailableError";
    }
}
