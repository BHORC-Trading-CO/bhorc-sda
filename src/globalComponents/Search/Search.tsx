import React, { FC } from "react";
import "./Search.css";

interface SearchPropsInterface {
  onChange: (value: string) => void;
  /** Что ищет поле (подсказка внутри и имя для скринридера) */
  placeholder?: string;
  /** Текущий запрос из стора: поле управляемое и после перемонтирования (смена вкладки)
   *  показывает действующий фильтр. Не передан — поле, как раньше, хранит значение само. */
  value?: string;
}

const Search: FC<SearchPropsInterface> = (props) => {
  return (
    <div className="search">
      <img src="./assets/img/Search.svg" className="search-img" alt=""></img>
      <input
        type="text"
        className="search-input text-white-medium"
        placeholder={props.placeholder}
        aria-label={props.placeholder}
        value={props.value}
        onChange={(event) => {
          const target = event.target;
          props.onChange(target.value);
        }}
      ></input>
    </div>
  );
};

export default Search;
