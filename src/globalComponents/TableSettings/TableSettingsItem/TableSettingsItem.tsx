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

  return (
    <div className="table-settings-item">
      <Checkbox
        isChecked={!(columnsList.filter(column => column.type === field.type).length === 0)}
        onChange={(isChecked: boolean) => {
          updateColumnList(isChecked ? 'add' : 'remove', field)
        }}
      />
      <div>{fieldTitle(t, props.fieldsTable, field, field.title ? field.title : field.type)}</div>
    </div>
  );
}

export default TableSettingsItem;
