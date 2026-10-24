const CopyPlugin = require("copy-webpack-plugin");
const { DefinePlugin } = require("webpack");
const { version } = require("../package.json");

module.exports = {
  resolve: {
    fallback: {
      "react/jsx-runtime": "react/jsx-runtime.js",
      "react/jsx-dev-runtime": "react/jsx-dev-runtime.js",
      "crypto": require.resolve("crypto-browserify"),
      "https": false
    },
    extensions: [".ts", ".tsx", ".js"],
  },
  module: {
    rules: require("./rules.webpack"),
  },
  plugins: [
    // Версия из package.json — показывается в шапке главного окна.
    new DefinePlugin({ __APP_VERSION__: JSON.stringify(version) }),
    new CopyPlugin({
      patterns: [{ from: "./assets", to: "./assets" }]
    })
  ],
};
