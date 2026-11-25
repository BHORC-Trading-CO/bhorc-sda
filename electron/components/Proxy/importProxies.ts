import Proxy from "./Proxy";
import proxyManager from "./proxyManager";
import ProxyStorage from "../newStorage/ProxyStorage";
import { parseProxy } from "../Functions/parseProxyString";
import ProxySetupInterface from "../../interfaces/Proxy/ProxySetupInterface";
import { ProxyBulkResult } from "../../interfaces/Proxy/ProxyResults";

// Логин на общем шлюзе выбирает выходной IP: другие логин или пароль — другой прокси, а не дубликат.
const proxyKey = ({ host, port, username, password }: ProxySetupInterface) =>
    JSON.stringify([host.toLowerCase(), String(port), username || "", password || ""]);

/**
 * Импорт списка, один прокси на строку. Разбор, проверка и подсчёт — здесь, где прокси сохраняются
 * (SDA-64): раньше окно считало строки само и показывало успех для тех, которые main отклонил.
 */
export default function importProxies(text: string): ProxyBulkResult {
    const result: ProxyBulkResult = { added: 0, duplicates: 0, rejected: [] };
    // Дедуп только против активных прокси: архивные не должны блокировать повторное добавление.
    const known = new Set(proxyManager.objects.filter(p => !p.params.deleted).map(p => proxyKey(p.params)));

    for (const line of text.split(/\r?\n/).map(value => value.trim()).filter(Boolean)) {
        const parsed = parseProxy(line);
        if (!parsed.proxy) {
            result.rejected.push({ line, reason: parsed.reason });
            continue;
        }
        // Каждую строку отдельно: сбой на одной не должен обрывать импорт на середине.
        try {
            const params = Proxy.Generate(parsed.proxy);
            if (known.has(proxyKey(params))) {
                result.duplicates += 1;
                continue;
            }
            // Сначала диск: не сохранённый прокси не должен попасть в таблицу и в счёт.
            ProxyStorage.Save(params.id, params);
            proxyManager.addNew(new Proxy(params));
            known.add(proxyKey(params));
            result.added += 1;
        } catch {
            result.rejected.push({ line, reason: "storage" });
        }
    }
    return result;
}
