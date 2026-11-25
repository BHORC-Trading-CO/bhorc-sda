export default interface SecondaryInterface {
    nickname: string;
    // null — уровень неизвестен: miniprofile не ответил, а в профиле нет своего блока уровня
    level: number | null;
    avatarUrl: string;
    // Статусы (SDA-31): null — неизвестно (ещё не проверялся или последняя проверка не удалась),
    // в таблице это нейтральный бейдж, а не «OK». В config.json прежних версий лежат только
    // boolean (у tpState ещё строка с датой) — они показываются как раньше до следующей проверки.
    ktState: boolean | null;
    tpState: boolean | string | null;
    tradeState: boolean | null;
    // Дата регистрации аккаунта Steam, "YYYY-MM-DD" (memberSince из XML профиля).
    // null или нет поля (config.json прежних версий) — неизвестна, в таблице прочерк.
    // Не меняется, поэтому загружается только пока неизвестна.
    registeredAt?: string | null;
}
