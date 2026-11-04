/**
 * Jest для main-процесса (electron/). Типы снимает babel-jest через babel.config.js
 * (тот же конфиг, что и сборка). Тяжёлые/нативные модули (puppeteer, sharp, electron,
 * electron-store) замоканы в корневом __mocks__ и подхватываются автоматически.
 */
module.exports = {
  testEnvironment: "node",
  testMatch: ["<rootDir>/electron/**/__tests__/**/*.test.ts"],
  transform: {
    "^.+\\.[tj]sx?$": "babel-jest",
  },
  // Компоненты рендерера (src/) импортируют свои .css: в тестах вместо них пустой модуль.
  moduleNameMapper: {
    "\\.css$": "<rootDir>/__mocks__/styleStub.js",
  },
  clearMocks: true,
  // request/steamcommunity тянут большой граф — даём запас по времени на первый прогон.
  testTimeout: 15000,
};
