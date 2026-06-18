// Мок puppeteer (тяжёлый). В тестах реальный браузер не запускаем.
module.exports = {
  launch: async () => ({}),
};
