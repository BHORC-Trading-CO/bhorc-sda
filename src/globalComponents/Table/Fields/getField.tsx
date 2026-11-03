import React, { FC, useContext } from 'react';
import Field from "../../../../electron/interfaces/TableFields/Field"
import AvalibleTypes from "../../../../electron/interfaces/TableFields/AvalibleFieldTypes"
import Checkbox from '../../Checkbox/Checkbox';
import BasicTextField from './BasicTextField';
import { observer } from 'mobx-react';
import Context from '../Context';
import { useTranslation } from 'react-i18next';

export default (field: Field) => {
    // key по type: раньше uuid на каждом рендере пересоздавал все заголовки вместе с подсказками
    return <div key={field.type} className={`list-headline list-headline-text list-headline--${field.type}`}>
        <Element field={field} />
    </div>;
}

const Element: FC<{ field: Field }> = observer(({ field }) => {
    const tableProps = useContext(Context);
    const { t } = useTranslation();

    switch (field.type) {
        case AvalibleTypes.checkbox:
            return <Checkbox isChecked={tableProps?.isSelected} ariaLabel={t("common.selectAllOnPage")} onChange={() => {
                if (tableProps?.onSelect) tableProps.onSelect(!tableProps.isSelected);
            }} />
        default:
            return <BasicTextField field={field} />;
    }
});
