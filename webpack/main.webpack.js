const externals = require("./externals");

module.exports = {
  resolve: {
    extensions: [".ts", ".js"],
  },
  entry: "./electron/main.ts",
  module: {
    rules: require("./rules.webpack"),
  },
  // externals задаются одним списком в webpack/externals.js — тот же список
  // forge.config.js копирует в собранное приложение.
  externals: Object.fromEntries(externals.map((name) => [name, name])),
};
