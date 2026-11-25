/**
 * Очередь с ограничением одновременных задач (SDA-61). Нужна главному процессу: на старте все
 * аккаунты разом входили в Steam и разом качали /market/ (у рабочего конфига — 43 входа и 43 МБ).
 * Задача, которая никогда не завершится, заняла бы место навсегда, поэтому в очередь ставятся
 * только задачи со сроком или отменой.
 */
export default class TaskQueue {
    private running = 0;
    private readonly waiting: { start: () => void, key?: unknown }[] = [];

    constructor(private readonly limit: number) { }

    /** urgent — действие человека: встаёт перед фоновыми задачами. key — для promote. */
    run<T>(task: () => Promise<T>, { urgent = false, key }: { urgent?: boolean, key?: unknown } = {}): Promise<T> {
        return new Promise<T>((resolve, reject) => {
            const start = () => {
                this.running++;
                let result: Promise<T>;
                try { result = task(); } catch (err) { result = Promise.reject(err); }
                result.then(resolve, reject).then(() => {
                    this.running--;
                    this.waiting.shift()?.start();
                });
            };
            if (this.running < this.limit) return start();
            if (urgent) this.waiting.unshift({ start, key });
            else this.waiting.push({ start, key });
        });
    }

    /** Переносит ожидающую задачу вперёд: сама задача и её промис остаются прежними. */
    promote(key: unknown): void {
        const index = this.waiting.findIndex((entry) => entry.key === key);
        if (index > 0) this.waiting.unshift(...this.waiting.splice(index, 1));
    }
}
