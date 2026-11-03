// Копия данных для рендерера, в которой каждый объект Error заменён на String(error).
// V8 в Electron 17 (9.8) неверно читает IPC-сообщение, где повторная ссылка ведёт на объект,
// впервые записанный после Error: ссылка указывает на соседний объект (SDA-19, "(#1) :" после
// создания группы). Копируются только массивы и простые объекты; общие объекты остаются общими,
// петли не ломают обход. Date, Buffer и экземпляры классов передаются как есть.
export default function errorsToStrings<T>(value: T): T {
    const copies = new Map<object, unknown>();
    const walk = (v: unknown): unknown => {
        if (v instanceof Error) return String(v);
        if (!v || typeof v !== "object") return v;
        const proto = Object.getPrototypeOf(v);
        if (!Array.isArray(v) && proto !== Object.prototype && proto !== null) return v;
        if (copies.has(v)) return copies.get(v);
        const copy: { [key: string]: unknown } | unknown[] = Array.isArray(v) ? [] : {};
        copies.set(v, copy);
        for (const key of Object.keys(v)) (copy as any)[key] = walk((v as any)[key]);
        return copy;
    };
    return walk(value) as T;
}
