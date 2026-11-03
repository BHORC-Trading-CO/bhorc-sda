import react, { FC, useState } from "react";
import store from "../../store/store";
import "./tableSettings.css";
import { observer } from "mobx-react";
import MiniWindow from "../../pages/Main/components/MiniWindow/MiniWindow";
import Field from "../../../electron/interfaces/TableFields/Field";
import AvalibleFieldTypes from "../../../electron/interfaces/TableFields/AvalibleFieldTypes";
import Search from "../Search/Search";
import { DragDropContext, Droppable, Draggable, DropResult, ResponderProvided } from "react-beautiful-dnd";
import Delimeter from "../Delimeter/Delimeter";
import ColumnsSelectetItem from "./ColumnsSelectetItem/ColumnsSelectetItem";
import Button from "../Button/Button";
import TableSettingsItem from "./TableSettingsItem/TableSettingsItem";
import { useTranslation } from "react-i18next";
import { FieldsTable } from "../Table/fieldTitle";

const TableSettings: FC<TableSettingsProps> = observer(
  (props: TableSettingsProps) => {
    const { t } = useTranslation();
    if (!props.isOpen) return <></>;

    return (
      <MiniWindow
        title={t("tableSettings.title")}
        width={"800px"}
        height={"600px"}
        content={
          <TableSettingsContent
            fields={props.fields}
            fieldsTable={props.fieldsTable}
            currentFields={props.currentFields}
            onSave={props.onSave}
            onClose={props.onClose}
            isOpen={props.isOpen}
          />
        }
        onClose={() => {
          props.onClose();
        }}
      />
    );
  }
);

const TableSettingsContent: FC<TableSettingsProps> = observer(
  (props: TableSettingsProps) => {
    const { t } = useTranslation();
    const [columnsList, setColumnsList] = useState<Array<Field>>(
      props.currentFields
    );

    console.log(columnsList);

    function updateColumnList(action: string, field: Field) {
      if (action == "add") {
        console.log(columnsList);
        const editingField = columnsList.filter(f => f.type === field.type)[0];
        editingField.isVisible = true;
        setColumnsList([...columnsList]);
      }

      if (action == "remove") {
        console.log('remove', field)
        const editingField = columnsList.filter(f => f.type === field.type)[0];
        editingField.isVisible = false;
        console.log(columnsList);
        setColumnsList([...columnsList]);
      }
    }

    function saveColumns() {
      console.log(columnsList);
      props.onSave(columnsList);
    }

    function handleOnDragEnd(result: DropResult, provided: ResponderProvided) {
      const items = Array.from(columnsList.filter(f => f.isVisible));
      const hidenItems = Array.from(columnsList.filter(f => !f.isVisible));
      const [reorderItem] = items.splice(result.source.index, 1);
      if (result.destination)
      items.splice(result.destination.index, 0, reorderItem);

      setColumnsList([...hidenItems, ...items]);
    }

    return (
      <div className="table-settings">
        <div className="table-settings-content">
          <div className="table-settings-left">
            <div className="table-settings-heading">{t("tableSettings.allFields")}</div>

            <div className="table-settings-list">
              <form>
                {props.fields.map((field: any, index: number) => {
                  return (
                    <TableSettingsItem
                      key={index}
                      columnsList={columnsList.filter(f => f.isVisible)}
                      updateColumnList={updateColumnList}
                      field={field}
                      fieldsTable={props.fieldsTable}
                    />
                  );
                })}
              </form>
            </div>
          </div>

          <div className="table-settings-right">
            <div className="table-settings_counter">
              <div className="table-settings_counter-text">{t("tableSettings.selectedColumns")}</div>
              <div className="table-settings_counter-counter">
                {columnsList.filter(f => f.isVisible).length}
              </div>
            </div>

            <DragDropContext onDragEnd={handleOnDragEnd}>
              <Droppable
                droppableId="droppable"
                renderClone={(provided, snapshot, item) => (
                  <ColumnsSelectetItem
                    data={
                      // type: columnsList[item.source.index].type,
                      // isSortable: columnsList[item.source.index].isSortable,
                      // title: columnsList[item.source.index].title,
                      // isVisible: columnsList[item.source.index].isVisible,
                      // sortDirection: columnsList[item.source.index].sortDirection
                      columnsList.filter(f => f.isVisible)[item.source.index]
                    }
                    fieldsTable={props.fieldsTable}
                    draggableProps={provided.draggableProps}
                    dragHandleProps={provided.dragHandleProps}
                    innerRef={provided.innerRef}
                  ></ColumnsSelectetItem>
                )}
              >
                {(provided, snapshot) => (
                  <div
                    className="column-select__container"
                    {...provided.droppableProps}
                    ref={provided.innerRef}
                  >
                    {columnsList.filter(f => f.isVisible).map((item, index) => (
                      <Draggable
                        key={index}
                        draggableId={index.toString()}
                        index={index}
                      >
                        {(provided, snapshot) => (
                          <ColumnsSelectetItem
                            data={item}
                            fieldsTable={props.fieldsTable}
                            draggableProps={provided.draggableProps}
                            dragHandleProps={provided.dragHandleProps}
                            innerRef={provided.innerRef}
                          ></ColumnsSelectetItem>
                        )}
                      </Draggable>
                    ))}
                    {provided.placeholder}
                  </div>
                )}
              </Droppable>
            </DragDropContext>
          </div>
        </div>

        <Delimeter marginTop="30px" marginBottom="20px"></Delimeter>

        <div className="table-settings-footer">
          <Button
            size="large"
            color="grey"
            hoverColor="grey"
            text={t("common.buttons.cancel")}
            className="table-settings__footer-button"
            onClick={() => {
              props.onClose();
            }}
          />

          <Button
            size="large"
            text={t("common.buttons.save")}
            className=""
            onClick={() => saveColumns()}
          />
        </div>
      </div>
    );
  }
);

export type TableSettingsProps = {
  fields: Array<Field>;
  fieldsTable: FieldsTable;
  currentFields: Array<Field>;
  onSave: (newFields: Field[]) => void;
  onClose: () => void;
  isOpen: boolean;
};

export default TableSettings;
