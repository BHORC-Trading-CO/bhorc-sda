/**
 * Итог подключения Guard, который показывается пользователю на последнем шаге.
 *
 * revocationCode здесь главное: Steam выдаёт его ровно один раз, и без него
 * аутентификатор с аккаунта уже не снять. Пользователь обязан увидеть и записать
 * его до того, как закроет окно.
 */
export default interface GuardSetupResultInterface {
    accountName: string;
    steamId: string;
    revocationCode: string;
    /** host:port привязанного прокси или null, если аккаунт без прокси. */
    proxy: string | null;
}
