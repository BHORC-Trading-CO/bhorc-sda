import TaskQueue from "../taskQueue";
import withDeadline from "../withDeadline";

const flush = () => new Promise((resolve) => setImmediate(resolve));
function deferred<T = void>() {
    let resolve!: (value: T) => void;
    let reject!: (err: unknown) => void;
    const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
    return { promise, resolve, reject };
}

describe("TaskQueue", () => {
    it("одновременно не больше limit, следующая стартует после любой завершённой", async () => {
        const queue = new TaskQueue(2);
        const jobs = [deferred(), deferred(), deferred(), deferred()];
        const started: number[] = [];
        const results = jobs.map((job, i) => queue.run(() => { started.push(i); return job.promise; }).catch(() => "failed"));
        expect(started).toEqual([0, 1]);
        jobs[0].reject(new Error("x"));
        await flush();
        expect(started).toEqual([0, 1, 2]);
        jobs[2].resolve();
        await flush();
        expect(started).toEqual([0, 1, 2, 3]);
        jobs[1].resolve();
        jobs[3].resolve();
        await expect(Promise.all(results)).resolves.toEqual(["failed", undefined, undefined, undefined]);
    });

    it("срочная встаёт перед ожидающими", async () => {
        const queue = new TaskQueue(1);
        const first = deferred();
        const order: string[] = [];
        queue.run(() => first.promise);
        queue.run(async () => { order.push("background"); });
        queue.run(async () => { order.push("urgent"); }, { urgent: true });
        first.resolve();
        await flush();
        await flush();
        expect(order).toEqual(["urgent", "background"]);
    });

    it("promote переносит ожидающую вперёд, промис прежний", async () => {
        const queue = new TaskQueue(1);
        const first = deferred();
        const order: string[] = [];
        queue.run(() => first.promise);
        queue.run(async () => { order.push("a"); }, { key: "a" });
        const promoted = queue.run(async () => { order.push("b"); return 7; }, { key: "b" });
        queue.promote("b");
        queue.promote("нет такой");
        first.resolve();
        await expect(promoted).resolves.toBe(7);
        await flush();
        expect(order).toEqual(["b", "a"]);
    });

    it("синхронное исключение задачи не занимает место", async () => {
        const queue = new TaskQueue(1);
        await expect(queue.run(() => { throw new Error("sync"); })).rejects.toThrow("sync");
        await expect(queue.run(async () => "next")).resolves.toBe("next");
    });
});

describe("withDeadline", () => {
    it("завершается по сроку, если операция молчит", async () => {
        await expect(withDeadline(new Promise(() => undefined), 10, () => new Error("late"))).rejects.toThrow("late");
    });
    it("передаёт итог и ошибку операции", async () => {
        await expect(withDeadline(Promise.resolve(7), 1000, () => new Error("late"))).resolves.toBe(7);
        await expect(withDeadline(Promise.reject(new Error("own")), 1000, () => new Error("late"))).rejects.toThrow("own");
    });
});
