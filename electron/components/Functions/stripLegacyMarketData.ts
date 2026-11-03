type LegacyMarketData = {
    tmApiKey?: unknown;
    marketApiKey?: unknown;
    maFile?: object;
    changableSecondary?: { market?: unknown };
};

// Старые config.json и импортируемые файлы могут содержать удалённые поля TM.
// Очищаем копию, сохраняя остальные данные Steam и дополнительные поля maFile.
export default function stripLegacyMarketData<T extends object>(data: T): T {
    const legacy = data as T & LegacyMarketData;
    const maFile = legacy.maFile ? stripLegacyMarketData(legacy.maFile) : legacy.maFile;
    let changableSecondary = legacy.changableSecondary;
    if (changableSecondary && Object.prototype.hasOwnProperty.call(changableSecondary, 'market')) {
        changableSecondary = { ...changableSecondary };
        delete changableSecondary.market;
    }

    if (!Object.prototype.hasOwnProperty.call(legacy, 'tmApiKey')
        && !Object.prototype.hasOwnProperty.call(legacy, 'marketApiKey')
        && maFile === legacy.maFile
        && changableSecondary === legacy.changableSecondary) {
        return data;
    }

    const migrated = { ...legacy };
    delete migrated.tmApiKey;
    delete migrated.marketApiKey;
    if (maFile !== legacy.maFile) migrated.maFile = maFile;
    if (changableSecondary !== legacy.changableSecondary) migrated.changableSecondary = changableSecondary;
    return migrated;
}
