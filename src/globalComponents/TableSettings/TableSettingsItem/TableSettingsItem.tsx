import React from "react";
import Field from "../../../../electron/interfaces/TableFields/Field";
// import Checkbox from "../../Table/Fields/Checkbox";
import Checkbox from "../../Checkbox/Checkbox";

import './TableSettingsItem.css'
import { useTranslation } from "react-i18next";
import fieldTitle, { FieldsTable } from "../../Table/fieldTitle";


function TableSettingsItem(props: { field: Field, fieldsTable: FieldsTable, updateColumnList: any, columnsList: Field[] }) {
  const { updateColumnList, field, columnsList } = props;
  const { t } = useTranslation();
  const isChecked = !(columnsList.filter(column => column.type === field.type).length === 0);
  const title = fieldTitle(t, props.fieldsTable, field, field.title ? field.title : field.type);

  return (
    <div className="table-settings-item">
      <Checkbox
        isChecked={isChecked}
        ariaLabel={title}
        onChange={(isChecked: boolean) => {
          updateColumnList(isChecked ? 'add' : 'remove', field)
        }}
      />
      {/* Клик по названию переключает тот же чекбокс */}
      <div className="table-settings-item__label" onClick={() => updateColumnList(isChecked ? 'remove' : 'add', field)}>{title}</div>
    </div>
  );
}

export default TableSettingsItem;
