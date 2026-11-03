import react, { FC, useContext, useState } from 'react';
import Field from '../../../../electron/interfaces/TableFields/Field';
import Context from '../Context';
import ReactTooltip from 'react-tooltip';
import uuid from 'react-uuid';
import AvalibleFieldTypes from '../../../../electron/interfaces/TableFields/AvalibleFieldTypes';
import { useTranslation } from 'react-i18next';
import { TFunction } from 'i18next';
import fieldTitle from '../fieldTitle';

// Стрелка по фактическому порядку: DOWN в onSort таблиц сортирует по возрастанию, UP — по убыванию
const arrowFor = (direction: 'UP' | 'DOWN' | undefined) => direction === 'DOWN' ? '↑' : '↓';

const BasicTextField: FC<{ field: Field }> = (props) => {
    const { field } = props;
    const tableProps = useContext(Context);
    const { t } = useTranslation();
    const [uniqueId] = useState(() => uuid());

    const fullTitle = field.showTtitleInTable ? (tableProps ? fieldTitle(t, tableProps.fieldsTable, field) : field.title) : "";
    // В шапке — короткое название колонки (columns.short.<type>), полное остаётся в подсказке
    // и в настройках таблицы. Нет короткого — показываем полное.
    const title = fullTitle ? t(`columns.short.${field.type}`, { defaultValue: fullTitle }) : "";
    const altText = getAltText(t, field, title !== fullTitle ? fullTitle : "");
    const isSortable = !!(field.isSortable && tableProps && tableProps.onSort);
    const isSorted = isSortable && tableProps!.sortedField === field.type;
    const nextDirection: 'UP' | 'DOWN' = field.sortDirection === 'UP' ? 'DOWN' : 'UP';
    const sort = () => {
        if (isSortable) tableProps!.onSort!(field.type, nextDirection);
    };

    const className = [
        'sort-header',
        isSortable ? 'sort-header--sortable' : '',
        isSorted ? 'sort-header--active' : '',
    ].filter(Boolean).join(' ');

    return (
        <div
            className={className}
            data-tip="React-tooltip"
            data-for={uniqueId}
            role={isSortable ? 'button' : undefined}
            tabIndex={isSortable ? 0 : undefined}
            aria-label={isSortable && title ? `${title}, ${t(isSorted ? (field.sortDirection === 'DOWN' ? 'columns.sortedAsc' : 'columns.sortedDesc') : 'columns.sortHint')}` : undefined}
            onClick={sort}
            onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    sort();
                }
            }}
        >
            {altText ? <ReactTooltip place="top" type="dark" effect="float" id={uniqueId}>
                <span>{altText}</span>
            </ReactTooltip> : <></>}
            {title}
            {isSortable && title ? (
                // Стрелка только у активной колонки; у остальных — бледная подсказка на ховере
                <span className="sort-header__arrow" aria-hidden="true">
                    {isSorted ? arrowFor(field.sortDirection) : arrowFor(nextDirection)}
                </span>
            ) : null}
        </div>
    );
};

// Подсказка к заголовку колонки по её type (fieldHints.<type> в locales).
const HINT_TYPES: AvalibleFieldTypes[] = [
    AvalibleFieldTypes.linkedProxies,
    AvalibleFieldTypes.steamAccountName,
    AvalibleFieldTypes.steamPassword,
    AvalibleFieldTypes.steamAccountLevel,
    AvalibleFieldTypes.tradeState,
    AvalibleFieldTypes.tpState,
    AvalibleFieldTypes.ktState,
    AvalibleFieldTypes.steamAccountBalance,
    AvalibleFieldTypes.number,
    AvalibleFieldTypes.steamAccountNickname,
    AvalibleFieldTypes.steamId,
    AvalibleFieldTypes.proxyHost,
    AvalibleFieldTypes.proxyPort,
    AvalibleFieldTypes.proxyUsername,
    AvalibleFieldTypes.proxyPassword,
    AvalibleFieldTypes.linkedSteamAccounts,
    AvalibleFieldTypes.linkedProfiles,
];

const getAltText = (t: TFunction, field: Field, fullTitle: string) => {
    const hint = HINT_TYPES.includes(field.type) ? t(`fieldHints.${field.type}`) : "";
    if (!hint && !fullTitle) return "";
    return <div className='alt-text-container'>
        {fullTitle ? <strong className='alt-text-title'>{fullTitle}</strong> : null}
        {hint}
    </div>;
}

export default BasicTextField;
