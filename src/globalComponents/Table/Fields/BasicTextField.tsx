import react, { FC, useContext, useState } from 'react';
import Field from '../../../../electron/interfaces/TableFields/Field';
import Context from '../Context';
import { observer } from 'mobx-react';
import ReactTooltip from 'react-tooltip';
import uuid from 'react-uuid';
import AvalibleFieldTypes from '../../../../electron/interfaces/TableFields/AvalibleFieldTypes';

const BasicTextField: FC<{ field: Field }> = (props) => {
    const { field } = props;
    const tableProps = useContext(Context);
    const altText = getAltText(field);
    const uniqueId = uuid();

    return (
        <div data-tip="React-tooltip" data-for={uniqueId} style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => {
            if (tableProps && tableProps.onSort) tableProps.onSort(field.type, field.sortDirection === 'UP' ? 'DOWN' : 'UP');
        }}>
            {uniqueId ? <ReactTooltip place="top" type="dark" effect="float" id={uniqueId}>
                <span>{altText}</span>
            </ReactTooltip> : <></>}
            {field.showTtitleInTable ? field.title : ""}
            {field.isSortable ? (field.sortDirection === 'UP' ? '↑' : '↓') : ""}
        </div>
    );
};

const getAltText = (field: Field) => {
    switch (field.type) {
        case AvalibleFieldTypes.linkedProxies:
            return <div className='alt-text-container'>Все действия с этим Steam аккаунтом программа будет выполнять через указанный прокси</div>
        case AvalibleFieldTypes.steamAccountName:
            return <div className='alt-text-container'>Это логин, который вы вводите при входе в Steam</div>
        case AvalibleFieldTypes.steamPassword:
            return <div className='alt-text-container'>Пароль от Steam аккаунта (что тут еще можно сказать???🙄)</div>
        case AvalibleFieldTypes.steamAccountLevel:
            return <div className='alt-text-container'>Ваш уровень Steam</div>
        case AvalibleFieldTypes.tradeState:
            return <div className='alt-text-container'>Может ли аккаунт отправлять трейды</div>
        case AvalibleFieldTypes.tpState:
            return <div className='alt-text-container'>Показывает открыта ли на аккаунте торговая площадка</div>
        case AvalibleFieldTypes.ktState:
            return <div className='alt-text-container'>Статус красной таблички в Steam. Упоси господь увидеть здесь что-то отличное от слова ОК 😈</div>
        case AvalibleFieldTypes.steamAccountBalance:
            return <div className='alt-text-container'>Здесь отображаются балансы Steam😙. Что еще сказать?</div>
        case AvalibleFieldTypes.csgoTmBalance:
            return <div className='alt-text-container'>Здесь отображаются балансы ваших аккаунтах на сайте https://market.csgo.com. Условие для отображение: необходимо указать api ключ в настройках</div>
        case AvalibleFieldTypes.number:
            return <div className='alt-text-container'>Это номер в системе. Его нельзя изменить. По сути это просто цифра для более удобной работы</div>
        case AvalibleFieldTypes.steamAccountNickname:
            return <div className='alt-text-container'>Тут отображаются никнеймы из Steam (из профиля)</div>;
        case AvalibleFieldTypes.steamId:
            return <div className='alt-text-container'>SteamID64 аккаунта (из maFile). По нему тоже работает поиск</div>;
        case AvalibleFieldTypes.tmApiKey:
            return <div className='alt-text-container'>Api ключ от сайта https://market.csgo.com Нужен для получения баланса оттуда. Если вы не работаете с маркетом, то вполне можно оставить это поле пустым</div>;

        case AvalibleFieldTypes.proxyHost:
            return <div className='alt-text-container'>Тут располагаются хосты прокси. Это часть ip адреса. Например: 123.123.123.123</div>;
        case AvalibleFieldTypes.proxyPort:
            return <div className='alt-text-container'>Тут отображаются порты прокси. Например: 30013</div>;
        case AvalibleFieldTypes.proxyUsername:
            return <div className='alt-text-container'>Тут отображаются логины от ваших прокси</div>;
        case AvalibleFieldTypes.proxyPassword:
            return <div className='alt-text-container'>Тут отображаются пароли от ваших прокси</div>;
        case AvalibleFieldTypes.linkedSteamAccounts:
            return <div className='alt-text-container'>Тут отображаются номера подключенных аккаунтов к данному прокси. (Каждый аккаунт из списка номеров будет работать через указанный прокси)</div>;
        case AvalibleFieldTypes.linkedProfiles:
            return <div className='alt-text-container'>Тут отображаются номера подключенных профилей к данному прокси (Каждый профиль из списка номеров будет работать через указанный прокси)</div>;
    }
    return "";
}

export default BasicTextField;