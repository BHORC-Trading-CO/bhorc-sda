import { useEffect } from 'react';
import { createGlobalStyle } from 'styled-components';

//здесь только подключение картинок и ховеров с картинками

export const GlobalStyle = createGlobalStyle`
  .table_bottom_icon{
    background-image: url(./assets/img/MiniTriangle.svg);
    background-size: 10px;
    background-repeat: no-repeat;
    background-position: center;
  }
  /* Window button icons are masks; Attic.css sets their colour from tokens. */
  .attic-button_minimize::before {
    -webkit-mask-image: url(./assets/img/Line5.svg);
  }
  .attic-button_maximize::before {
    -webkit-mask-image: url(./assets/img/Square2.svg);
  }
  .attic-button_close::before {
    -webkit-mask-image: url(./assets/img/Cross.svg);
  }
  .form-cross {
    background-image: url(./assets/img/Cross.svg);
    background-size: 10px;
    background-repeat: no-repeat;
    background-position: center;
  }
  .header-content__buttons-container #panel_settings {
    background-image: url(./assets/img/Subtract.svg);
  }
  .header-content__buttons-container #panel_settings:hover {
    background-image: url(./assets/img/SubtractHover.svg);
  }
  .header-content__buttons-container #panel_refresh {
    background-image: url(./assets/img/Refresh.svg);
  }
  .header-content__buttons-container #panel_refresh:hover {
    background-image: url(./assets/img/RefreshHover.svg);
  }
  .panel-content__options #panel_hide {
    background-image: url(./assets/img/Hide.svg);
  }
  .panel-content__options #panel_hide:hover {
    background-image: url(./assets/img/HideHover.svg);
  }
  #navigation-main {
    background-image: url(./assets/img/Home.svg);
  }
  #navigation-main-hover {
    background-image: url(./assets/img/HomeHover.svg);
  }
  /* Navigation icons are masks; Navigation.css sets the colour (muted, white on hover, gradient when active). */
  #navigation-steam-accounts {
    -webkit-mask-image: url(./assets/img/SteamAccount.svg);
  }
  #navigation-proxy {
    -webkit-mask-image: url(./assets/img/Proxy.svg);
  }
  #navigation-extension {
    -webkit-mask-image: url(./assets/img/Extension.svg);
  }
  .checkbox-default {
    background-image: url(./assets/img/checkbox.svg);
  }
  .checkbox-default__proxy {
    background-image: url(./assets/img/checkboxProxy.svg);
  }
  .checkbox-checked {
    background-image: url(./assets/img/checkboxChecked.svg);
  }
  .checkbox-circle-checked {
    background-image: url(./assets/img/checkboxCircleChecked.svg);
  }
  .checkbox-circle-default {
    background-image: url(./assets/img/checkboxCircle.svg);
  }
`