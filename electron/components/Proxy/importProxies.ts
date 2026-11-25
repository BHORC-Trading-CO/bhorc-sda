import Proxy from "./Proxy";
import proxyManager from "./proxyManager";
import ProxyStorage from "../newStorage/ProxyStorage";
import parseProxyString from "../Functions/parseProxyString";
import { ProxyBulkResult } from "../../interfaces/Proxy/ProxyResults";

const addressKey = (proxy: { host: string, port: string }) => `${proxy.host}:${proxy.port}`.toLowerCase();

/**
 * Импорт списка, один прокси на строку. Разбор, проверка и подсчёт — здесь, где прокси сохраняются
 * (SDA-64): раньше окно считало строки само и показывало успех для тех, которые main отклонил.
 */
export default function importProxies(text: string): ProxyBulkResult {
    const result: ProxyBulkResult = { added: 0, duplicates: 0, rejected: [] };
    // Дедуп только против активных прокси: архивные не должны блокировать повторное добавление.
    const known = new Set(proxyManager.objects.filter(p => !p.params.deleted).map(p => addressKey(p.params)));

    for (const line of text.split(/\r?\n/).map(value => value.trim()).filter(Boolean)) {
        // Каждую строку отдельно: неправильная не должна обрывать импорт на середине.
        try {
            const setup = parseProxyString(line);
            if (!setup.username || !setup.password) throw new Error("incomplete proxy");
            const params = Proxy.Generate(setup);
            if (known.has(addressKey(params))) {
                result.duplicates += 1;
                continue;
            }
            // Сначала диск: не сохранённый прокси не должен попасть в таблицу и в счёт.
            ProxyStorage.Save(params.id, params);
            proxyManager.addNew(new Proxy(params));
            known.add(addressKey(params));
            result.added += 1;
        } catch {
            result.rejected.push(line);
        }
    }
    return result;
}
