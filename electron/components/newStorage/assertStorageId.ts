// Идентификатор должен оставаться одним сегментом пути electron-store.
export default function assertStorageId(id: string): void {
    if (typeof id !== "string" || !id || id.includes(".") || ["__proto__", "prototype", "constructor"].includes(id)) {
        throw new Error("Недопустимый идентификатор хранилища");
    }
}
