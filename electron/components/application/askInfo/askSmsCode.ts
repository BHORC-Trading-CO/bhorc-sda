import askCode from "./askCode";

export default (accountId: string, accountName: string, signal?: AbortSignal) => {
    return askCode(accountName, 'smsCode', signal);
}
