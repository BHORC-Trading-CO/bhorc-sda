// Мок puppeteer-extra: код вызывает .use(...) на этапе импорта и .launch() в start(),
// а plugins читает для вкладок, открытых до подписки плагинов (SDA-33).
const puppeteer = {
  use: () => puppeteer,
  launch: async () => ({}),
  plugins: [],
};
module.exports = puppeteer;
