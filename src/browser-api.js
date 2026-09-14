// UI storage adapter: Firefox promises and Chrome callbacks share one interface.
const browserAPI = (() => {
  const isFirefox = typeof browser !== 'undefined';
  const api = isFirefox ? browser : chrome;

  async function call(area, method, argument) {
    if (isFirefox) return api.storage[area][method](argument);
    return new Promise((resolve, reject) => {
      api.storage[area][method](argument, result => {
        const error = api.runtime.lastError;
        if (error) reject(error);
        else resolve(result);
      });
    });
  }

  return {
    storage: {
      get: keys => call('sync', 'get', keys),
      set: data => call('sync', 'set', data),
      remove: keys => call('sync', 'remove', keys),
    },
    storageLocal: {
      get: keys => call('local', 'get', keys),
      set: data => call('local', 'set', data),
      remove: keys => call('local', 'remove', keys),
    },
  };
})();

window.browserAPI = browserAPI;
