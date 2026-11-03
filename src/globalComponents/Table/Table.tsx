import React, { FC, useContext, useEffect, useRef, useState } from 'react';
import { observer } from 'mobx-react';
import Field from '../../../electron/interfaces/TableFields/Field';
import AvalibleTypes from '../../../electron/interfaces/TableFields/AvalibleFieldTypes';
import './Table.css';
import Context from './Context';
import getField from './Fields/getField';
import { FieldsTable } from './fieldTitle';

export interface Cell { type: AvalibleTypes, jsx: JSX.Element };
export interface Line { cells: Cell[], deleted: boolean, selected?: boolean };
export interface TableDataInterface {
    fields: Field[],
    fieldsTable: FieldsTable,
    lines: Line[],
    isSelected?: boolean,
    onSelect?: (isChecked: boolean) => void,
    onSort?: (fieldType: AvalibleTypes, direction: 'UP' | 'DOWN') => void,
    /**
     * Колонка, по которой сейчас отсортировано (только для отображения стрелки).
     * Не передана — таблица запоминает последнюю нажатую колонку сама.
     */
    sortedField?: AvalibleTypes | null
};

// Последняя колонка сортировки по таблицам: переживает переключение вкладок (Table размонтируется)
const lastSortedField: { [table: string]: AvalibleTypes | null } = {};

const Table: FC<TableDataInterface> = (props) => {
    const { fields, lines, fieldsTable } = props;
    const [localSortedField, setLocalSortedField] = useState<AvalibleTypes | null>(lastSortedField[fieldsTable] ?? null);
    // Часть колонок ушла под прилипшие кнопки справа: показываем тень-разделитель
    const contentRef = useRef<HTMLDivElement>(null);
    const [isClippedRight, setIsClippedRight] = useState(false);

    useEffect(() => {
        const el = contentRef.current;
        if (!el) return;
        const update = () => setIsClippedRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
        update();
        el.addEventListener('scroll', update, { passive: true });
        const observer = new ResizeObserver(update);
        observer.observe(el);
        if (el.firstElementChild) observer.observe(el.firstElementChild);
        return () => {
            el.removeEventListener('scroll', update);
            observer.disconnect();
        };
    }, []);

    const contextValue: TableDataInterface = {
        ...props,
        sortedField: props.sortedField !== undefined ? props.sortedField : localSortedField,
        onSort: props.onSort ? (fieldType, direction) => {
            lastSortedField[fieldsTable] = fieldType;
            setLocalSortedField(fieldType);
            props.onSort!(fieldType, direction);
        } : undefined,
    };

    return (
        <Context.Provider value={contextValue}>
            <div className="list-container">
                <div className="list-content" ref={contentRef}>
                    <div className={`list list--${fieldsTable}${isClippedRight ? ' list--clipped-right' : ''}`}>
                        <div className="list-headline-row table-header">
                            {
                                fields.filter(f => f.isVisible).map((field) => getField(field))
                            }
                        </div>
                        {
                            lines.map((line, index) => {
                                return <Element key={index} line={line} />
                            })
                        }
                    </div>
                </div>
            </div>
        </Context.Provider>
    );
};

const Element: FC<{ line: Line }> = observer((props) => {
    const tableProps = useContext(Context);
    if (!tableProps) return <></>;

    const rowClass = [
        'list-item-row',
        props.line.deleted ? 'list-item-row--deleted' : '',
        props.line.selected && !props.line.deleted ? 'list-item-row--selected' : '',
    ].filter(Boolean).join(' ');

    return (
        <div className={rowClass} aria-selected={props.line.selected ? true : undefined}>
            {
                tableProps.fields.filter(f=>f.isVisible).map((field) => {
                    const cell = props.line.cells.find(cell => cell.type === field.type);
                    if (!cell) return <React.Fragment key={field.type}></React.Fragment>;
                    return <div className={`list-item list-item--${field.type}`} key={field.type}>{
                        cell ? <>{cell.jsx}</> : <></>
                    }</div>
                })
            }
        </div>
    )
});

export default Table;
