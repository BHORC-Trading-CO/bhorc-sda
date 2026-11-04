import '../electron/components/Functions/installConsoleRedaction';
import ReactDOM from 'react-dom';
//import Router from './Router';
//import './css/Switcher.css';
import './css/normalize.css'
import './css/default.css'
import './css/fonts.css';
import './css/tokens.css';
import './css/motion.css';
import './css/index.css';
import './css/CircleAnimation.css';

//import { GlobalStyle } from './css/GlobalStyle';
//import App from './components/App';
// Переводы инициализируются до Router: язык берётся синхронно из main, первая отрисовка уже на нём.
import './i18n/i18n';
import Router from './Router';
import { GlobalStyle } from './css/GlobalStyle';

// Платформа окна для CSS ([data-platform] на <html>): рамка окна и место под системные кнопки.
// У каждого окна свой preload, поэтому берём platform из того моста, который есть.
const platform = window.Main?.platform ?? window.Confirmations?.platform
  ?? window.AskFamilyPin?.platform ?? window.ErrorWindow?.platform;
if (platform) document.documentElement.dataset.platform = platform;

ReactDOM.render(
  <>
    <GlobalStyle />
    <Router />
  </>,
  document.getElementById("root")
);