// Мок puppeteer-extra: код вызывает .use(...) на этапе импорта и .launch() в start().
const puppeteer = {
  use: () => puppeteer,
  launch: async () => ({}),
  // Как у puppeteer 19: свой --disable-features и --disable-extensions среди флагов по умолчанию.
  defaultArgs: () => [
    '--disable-background-networking',
    '--disable-extensions',
    '--disable-features=Translate,BackForwardCache,AcceptCHFrame,MediaRouter,OptimizationHints',
    '--headless',
  ],
};
module.exports = puppeteer;
