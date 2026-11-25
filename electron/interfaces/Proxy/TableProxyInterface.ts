import CompiledProxyInterface from "./CompiledProxyInterface";
import { ProxyTestResult } from "./ProxyResults";

export default interface TableProxyInterface extends CompiledProxyInterface {
    isSelected: boolean;
    isTesting: boolean;
    isWorking?: boolean;
    /** Почему проверка не прошла: error — прокси не работает, statusCode — работает, но Steam ответил этим кодом */
    testFailure?: Pick<ProxyTestResult, "statusCode" | "error">;
}