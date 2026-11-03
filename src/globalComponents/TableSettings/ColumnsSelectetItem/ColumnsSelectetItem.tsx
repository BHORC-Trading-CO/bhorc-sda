import {
  DraggableProvidedDraggableProps,
  DraggableProvidedDragHandleProps,
} from "react-beautiful-dnd";
import Field from "../../../../electron/interfaces/TableFields/Field";
import "./ColumnsSelectetItem.css";
import { useTranslation } from "react-i18next";
import fieldTitle, { FieldsTable } from "../../Table/fieldTitle";

function ColumnsSelectetItem(props: ColumnsSelectetInterface) {
  console.log(props);
  const { data, innerRef, draggableProps, dragHandleProps } = props;
  const { t } = useTranslation();

  return (
    <div
      className="columns-selected-item"
      ref={innerRef}
      {...draggableProps}
      {...dragHandleProps}
    >
      <img src="./assets/img/Layers.svg" className="columns-selected-img"></img>
      <span className="text-white-medium">{fieldTitle(t, props.fieldsTable, data, data.title ? data.title : data.type)}</span>
    </div>
  );
}

type ColumnsSelectetInterface = {
  data: Field;
  fieldsTable: FieldsTable;
  innerRef: any;
  draggableProps: DraggableProvidedDraggableProps;
  dragHandleProps: DraggableProvidedDragHandleProps | undefined;
};

export default ColumnsSelectetItem;
