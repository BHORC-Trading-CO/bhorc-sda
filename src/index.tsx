import '../electron/components/Functions/installConsoleRedaction';
import ReactDOM from 'react-dom';
//import Router from './Router';
//import './css/Switcher.css';
import './css/normalize.css'
import './css/default.css'
import './css/index.css';
import './css/CircleAnimation.css';

//import { GlobalStyle } from './css/GlobalStyle';
//import App from './components/App';
// Переводы инициализируются до Router: язык берётся синхронно из main, первая отрисовка уже на нём.
import './i18n/i18n';
import Router from './Router';
import { GlobalStyle } from './css/GlobalStyle';

ReactDOM.render(
  <>
    <GlobalStyle />
    <Router />
  </>,
  document.getElementById("root")
);