// Мок puppeteer-extra: код вызывает .use(...) на этапе импорта и .launch() в start().
const puppeteer = {
  use: () => puppeteer,
  launch: async () => ({}),
};
module.exports = puppeteer;
