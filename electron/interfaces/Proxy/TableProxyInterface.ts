import CompiledProxyInterface from "./CompiledProxyInterface";
import { ProxyTestResult } from "./ProxyResults";

export default interface TableProxyInterface extends CompiledProxyInterface {
    isSelected: boolean;
    isTesting: boolean;
    isWorking?: boolean;
    /** Почему проверка не прошла (вместе с isWorking: false) */
    testFailure?: Pick<ProxyTestResult, "statusCode" | "error">;
}