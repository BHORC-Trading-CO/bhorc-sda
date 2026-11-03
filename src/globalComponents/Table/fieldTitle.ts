import { TFunction } from "i18next";
import Field from "../../../electron/interfaces/TableFields/Field";

export type FieldsTable = "steamAccounts" | "proxies";

// Название колонки берём по type: в config.json у пользователей title сохранён на том языке,
// на котором его записала старая версия. Сохранённый title — только запасной вариант для
// типов без перевода (колонки из других версий).
const fieldTitle = (t: TFunction, table: FieldsTable, field: Field, fallback: string = field.title): string =>
    t(`fields.${table}.${field.type}`, { defaultValue: fallback });

export default fieldTitle;
