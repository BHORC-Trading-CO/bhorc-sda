import {
  DraggableProvidedDraggableProps,
  DraggableProvidedDragHandleProps,
} from "react-beautiful-dnd";
import Field from "../../../../electron/interfaces/TableFields/Field";
import "./ColumnsSelectetItem.css";
import { useTranslation } from "react-i18next";
import fieldTitle, { FieldsTable } from "../../Table/fieldTitle";

function ColumnsSelectetItem(props: ColumnsSelectetInterface) {
  const { data, innerRef, draggableProps, dragHandleProps, isDragging } = props;
  const { t } = useTranslation();

  return (
    <div
      className={`columns-selected-item${isDragging ? " columns-selected-item--dragging" : ""}`}
      ref={innerRef}
      title={t("tableSettings.dragHint")}
      {...draggableProps}
      {...dragHandleProps}
    >
      {/* Ручка перетаскивания: две колонки точек (CSS), тянется вся строка */}
      <span className="columns-selected-grip" aria-hidden="true"></span>
      <span className="columns-selected-title">{fieldTitle(t, props.fieldsTable, data, data.title ? data.title : data.type)}</span>
    </div>
  );
}

type ColumnsSelectetInterface = {
  data: Field;
  fieldsTable: FieldsTable;
  innerRef: any;
  draggableProps: DraggableProvidedDraggableProps;
  dragHandleProps: DraggableProvidedDragHandleProps | undefined;
  isDragging?: boolean;
};

export default ColumnsSelectetItem;
