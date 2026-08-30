/**
 * Модули, которые НЕ бандлятся вебпаком в main-процесс.
 *
 * Причины: нативные бинарники (sharp), скачанный при установке браузер
 * (chromium), динамические require внутри самого пакета (puppeteer и его
 * плагины) и пакеты, ломающиеся при статическом анализе (steam-session,
 * steamcommunity).
 *
 * Один и тот же список нужен в двух местах, поэтому он вынесен сюда:
 *  - webpack/main.webpack.js — чтобы вебпак оставил require() как есть;
 *  - forge.config.js         — чтобы эти модули попали в собранное приложение.
 *
 * Если добавляете внешний модуль — добавляйте только сюда.
 */
module.exports = [
  'puppeteer',
  'puppeteer-extra',
  'puppeteer-extra-plugin-stealth',
  'puppeteer-extra-plugin-minmax',
  'sharp',
  'chromium',
  'steam-session',
  'steamcommunity',
];
