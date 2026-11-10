(function (root, factory) {
  const mod = factory();
  if (typeof module === 'object' && module.exports) module.exports = mod;
  else (root.Tezcatl = root.Tezcatl || {}).middleware = mod;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function run(events, currentContext) {
    return events;
  }

  return { run: run };
});
