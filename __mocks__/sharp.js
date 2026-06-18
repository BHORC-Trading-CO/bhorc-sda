// Мок sharp (нативный модуль): цепочка resize().toFile(cb).
module.exports = () => ({
  resize: () => ({
    toFile: (_path, cb) => {
      if (cb) cb(null, {});
    },
  }),
});
