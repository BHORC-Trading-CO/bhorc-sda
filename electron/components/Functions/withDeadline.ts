/** Промис, который завершится не позже срока. Сама операция не отменяется, её итог отбрасывается. */
export default function withDeadline<T>(promise: Promise<T>, ms: number, makeError: () => Error): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        const timer = setTimeout(() => reject(makeError()), ms);
        timer.unref?.();
        promise.then(
            (value) => { clearTimeout(timer); resolve(value); },
            (err) => { clearTimeout(timer); reject(err); },
        );
    });
}
