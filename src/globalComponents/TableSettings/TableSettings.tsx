import react, { FC, useState } from "react";
import store from "../../store/store";
import "./tableSettings.css";
import { observer } from "mobx-react";
import MiniWindow from "../../pages/Main/components/MiniWindow/MiniWindow";
import Field from "../../../electron/interfaces/TableFields/Field";
import AvalibleFieldTypes from "../../../electron/interfaces/TableFields/AvalibleFieldTypes";
import { DragDropContext, Droppable, Draggable, DropResult, ResponderProvided } from "react-beautiful-dnd";
import ColumnsSelectetItem from "./ColumnsSelectetItem/ColumnsSelectetItem";
import Button from "../Button/Button";
import TableSettingsItem from "./TableSettingsItem/TableSettingsItem";
import { useTranslation } from "react-i18next";
import { FieldsTable } from "../Table/fieldTitle";

// Высота окна по числу полей, чтобы списки не обрезались и под ними не было пустоты.
// Строка списка 28px + 4px отступ (ColumnsSelectetItem.css, TableSettingsItem.css), у последней
// строки отступа нет. Остальное замерено в DOM собранного окна (кнопки 34px, Button.css):
// шапка 52 (Form.css) + рамка окна 2 + отступ сверху 16 + панель списка 54 (рамка 2, поля 18,
// заголовок 28 и отступ под ним 6) + нижняя панель 81 (отступ 16, линия 1, поля 30, кнопка 34)
// = 205, минус 4 у последней строки, плюс 1 на дробное округление = 202. Окна выше 820px
// не делаем (все поля аккаунтов помещаются в окне приложения 1512×949); в низком окне .form
// ограничен по высоте (Form.css), и списки прокручиваются внутри панелей.
const ROW_PITCH = 32;
const CHROME_HEIGHT = 202;
const MAX_HEIGHT = 820;

const TableSettings: FC<TableSettingsProps> = observer(
  (props: TableSettingsProps) => {
    const { t } = useTranslation();
    if (!props.isOpen) return <></>;
    const rows = Math.max(props.fields.length, props.currentFields.length);
    const height = Math.min(MAX_HEIGHT, CHROME_HEIGHT + rows * ROW_PITCH);

    return (
      <MiniWindow
        title={t("tableSettings.title")}
        width={"800px"}
        height={`${height}px`}
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
      // Перетаскивание отменено (Esc) или брошено вне списка: порядок не меняется. Раньше
      // колонка вырезалась и не возвращалась — пропадала из обоих списков, а после «Сохранить»
      // и из таблицы; повторная галочка падала на undefined в updateColumnList.
      if (!result.destination) return;
      const items = Array.from(columnsList.filter(f => f.isVisible));
      const hidenItems = Array.from(columnsList.filter(f => !f.isVisible));
      const [reorderItem] = items.splice(result.source.index, 1);
      if (result.destination)
      items.splice(result.destination.index, 0, reorderItem);

      setColumnsList([...hidenItems, ...items]);
    }

    // Стандартный набор — props.fields (списки по умолчанию из electron/interfaces/TableFields/defaults):
    // их порядок и видимость; title и sortDirection берутся у текущих колонок. Как и всё в этом
    // окне, применяется только по «Сохранить».
    function resetToDefault() {
      const current = new Map(columnsList.map((f) => [f.type, f]));
      const defaultTypes = new Set(props.fields.map((f) => f.type));
      const defaults = props.fields.map((d) => ({ ...(current.get(d.type) || d), isVisible: d.isVisible }));
      setColumnsList([...defaults, ...columnsList.filter((f) => !defaultTypes.has(f.type))]);
    }

    return (
      <div className="table-settings-body">
        <div className="table-settings-content">
          <div className="table-settings-panel">
            <div className="table-settings-panel__head">
              <div className="table-settings-heading">{t("tableSettings.allFields")}</div>
            </div>

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

          <div className="table-settings-panel">
            <div className="table-settings-panel__head">
              <div className="table-settings-heading">{t("tableSettings.selectedColumns")}</div>
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
                    isDragging={snapshot.isDragging}
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
                            isDragging={snapshot.isDragging}
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

        <div className="table-settings-footer">
          <button
            type="button"
            className="table-settings__reset"
            data-testid="table-settings-reset"
            onClick={() => resetToDefault()}
          >
            {t("tableSettings.reset")}
          </button>

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
