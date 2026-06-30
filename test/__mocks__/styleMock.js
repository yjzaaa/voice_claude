module.exports = new Proxy(
  {},
  {
    get: (_target, key) => {
      if (key === '__esModule') return false;
      return typeof key === 'string' ? key : '';
    },
  }
);

