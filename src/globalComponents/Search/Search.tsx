import React, { FC, useRef } from "react";
import { useTranslation } from "react-i18next";
import Icon from "../Icon/Icon";
import { canClearSearch, clearSearch, handleSearchKeyDown } from "./searchClear";
import "./Search.css";

interface SearchPropsInterface {
  onChange: (value: string) => void;
  /** Что ищет поле (подсказка внутри и имя для скринридера) */
  placeholder?: string;
  /** Текущий запрос из стора: поле управляемое и после перемонтирования (смена вкладки)
   *  показывает действующий фильтр; по нему же видно, показывать ли крестик очистки. */
  value: string;
}

const Search: FC<SearchPropsInterface> = (props) => {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const clearLabel = t("common.clearSearch");
  const clear = () => clearSearch(props.onChange, inputRef.current);

  return (
    <div className="search">
      <Icon name="search" size={14} className="search-img" />
      <input
        ref={inputRef}
        type="text"
        className="search-input text-white-medium"
        placeholder={props.placeholder}
        aria-label={props.placeholder}
        value={props.value}
        onChange={(event) => {
          const target = event.target;
          props.onChange(target.value);
        }}
        onKeyDown={(event) => {
          handleSearchKeyDown(event, props.value, clear);
        }}
      ></input>
      {/* Место под крестик есть всегда: поле и текст не сдвигаются, когда он появляется */}
      <span className="search-clear-slot">
        {canClearSearch(props.value) && (
          <button
            type="button"
            className="search-clear"
            aria-label={clearLabel}
            title={clearLabel}
            onClick={clear}
          >
            <Icon name="x" size={14} />
          </button>
        )}
      </span>
    </div>
  );
};

export default Search;
