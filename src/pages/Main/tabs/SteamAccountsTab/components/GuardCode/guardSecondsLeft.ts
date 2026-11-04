/** Период кодов Steam Guard (TOTP): код меняется каждые 30 с, по границам unix-времени. */
export const GUARD_PERIOD_SEC = 30;

/** Сколько целых секунд осталось до смены кода: от 1 до periodSec (periodSec — в начале периода). */
export const guardSecondsLeft = (nowMs: number, periodSec: number = GUARD_PERIOD_SEC): number =>
    periodSec - (Math.floor(nowMs / 1000) % periodSec);

export default guardSecondsLeft;
