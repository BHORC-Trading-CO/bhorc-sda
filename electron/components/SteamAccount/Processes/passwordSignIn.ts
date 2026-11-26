import { LoginSession } from "steam-session";
import { t } from "../../../i18n";

type Details = Parameters<LoginSession["startWithCredentials"]>[0];
type Result = Awaited<ReturnType<LoginSession["startWithCredentials"]>>;
type Challenge = (actions: NonNullable<Result["validActions"]>, prompts: AbortSignal) => Promise<void>;

/**
 * Вход по паролю для мастеров (SDA-63): завершается ровно один раз. При завершении снимает слушатели,
 * останавливает опрос и закрывает свои окна ввода: забытое окно кода раньше отклоняло уже идущее
 * подключение Guard. challenge отвечает на то, что запросил Steam; signal — отмена мастера.
 * Результат: принял ли Steam код Guard из details (а не код с почты и не вход вовсе без кода).
 */
export default function passwordSignIn(session: LoginSession, details: Details, challenge: Challenge, signal?: AbortSignal): Promise<{ guardCodeAccepted: boolean }> {
    return new Promise((resolve, reject) => {
        const prompts = new AbortController();
        let settled = false;
        let guardCodeAccepted = false;

        const settle = (finish: () => void) => {
            if (settled) return;
            settled = true;
            signal?.removeEventListener("abort", onAbort);
            session.removeListener("error", fail);
            session.removeListener("timeout", onTimeout);
            session.removeListener("authenticated", onAuthenticated);
            // Событие error без слушателей — необработанное исключение
            session.on("error", () => undefined);
            session.cancelLoginAttempt();
            prompts.abort();
            finish();
        };
        const fail = (err: unknown) => settle(() => reject(err));
        const onAbort = () => fail("abort");
        const onTimeout = () => fail(new Error(t("errors.steamLoginTimeout")));
        const onAuthenticated = () => settle(() => resolve({ guardCodeAccepted }));

        if (signal?.aborted) return fail("abort");
        signal?.addEventListener("abort", onAbort);
        // До входа: событие может прийти раньше, чем ответит startWithCredentials
        session.on("error", fail);
        session.on("timeout", onTimeout);
        session.on("authenticated", onAuthenticated);

        if (details.steamGuardCode) {
            // Библиотека сама отправляет код из details этим же методом
            const submit = session.submitSteamGuardCode.bind(session);
            session.submitSteamGuardCode = async (code) => {
                await submit(code);
                if (code === details.steamGuardCode) guardCodeAccepted = true;
            };
        }

        session.startWithCredentials(details)
            .then(async ({ actionRequired, validActions }) => {
                // Библиотека начинает опрос заново, даже если её отменили до ответа Steam
                if (settled) return void session.cancelLoginAttempt();
                if (actionRequired) await challenge(validActions ?? [], prompts.signal);
            })
            .catch(fail);
    });
}
