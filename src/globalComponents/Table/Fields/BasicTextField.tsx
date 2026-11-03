import react, { FC, useContext, useState } from 'react';
import Field from '../../../../electron/interfaces/TableFields/Field';
import Context from '../Context';
import { observer } from 'mobx-react';
import ReactTooltip from 'react-tooltip';
import uuid from 'react-uuid';
import AvalibleFieldTypes from '../../../../electron/interfaces/TableFields/AvalibleFieldTypes';
import { useTranslation } from 'react-i18next';
import { TFunction } from 'i18next';
import fieldTitle from '../fieldTitle';

const BasicTextField: FC<{ field: Field }> = (props) => {
    const { field } = props;
    const tableProps = useContext(Context);
    const { t } = useTranslation();
    const altText = getAltText(t, field);
    const uniqueId = uuid();

    return (
        <div data-tip="React-tooltip" data-for={uniqueId} style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => {
            if (tableProps && tableProps.onSort) tableProps.onSort(field.type, field.sortDirection === 'UP' ? 'DOWN' : 'UP');
        }}>
            {uniqueId ? <ReactTooltip place="top" type="dark" effect="float" id={uniqueId}>
                <span>{altText}</span>
            </ReactTooltip> : <></>}
            {field.showTtitleInTable ? (tableProps ? fieldTitle(t, tableProps.fieldsTable, field) : field.title) : ""}
            {field.isSortable ? (field.sortDirection === 'UP' ? '↑' : '↓') : ""}
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

const getAltText = (t: TFunction, field: Field) => {
    if (HINT_TYPES.includes(field.type))
        return <div className='alt-text-container'>{t(`fieldHints.${field.type}`)}</div>;
    return "";
}

export default BasicTextField;