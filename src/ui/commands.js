document.addEventListener('DOMContentLoaded', async function () {
  const status = document.getElementById('status');
  const rows = document.getElementById('rows');
  const search = document.getElementById('search');

  function setStatus(msg, kind) {
    status.className = 'status' + (kind ? ' ' + kind : '');
    status.textContent = msg || '';
  }

  function deepClone(o) { return JSON.parse(JSON.stringify(o || {})); }

  async function loadHelper() {
    await new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = chrome.runtime.getURL('browser-api.js');
      script.onload = () => window.browserAPI ? resolve() : reject(new Error('missing browserAPI'));
      script.onerror = () => reject(new Error('load failed'));
      document.head.appendChild(script);
    });
  }

  async function loadBaseConfig() {
    const url = chrome.runtime.getURL('motions.json');
    const res = await fetch(url, { cache: 'no-cache' });
    if (!res.ok) throw new Error('Bundled bindings request failed');
    return parseStored(await res.json());
  }

  function parseStored(raw) {
    const value = typeof raw === 'string' ? JSON.parse(raw) : raw;
    const error = window.VimConfig.validate(value);
    if (error) throw new Error(error);
    return value;
  }

  async function loadStoredConfig() {
    if (!window.browserAPI) return null;
    try {
      const localData = await window.browserAPI.storageLocal.get(['motionsConfig']);
      if (localData && typeof localData.motionsConfig !== 'undefined') {
        return parseStored(localData.motionsConfig);
      }
    } catch (e) {
      const err = new Error(e.message || 'Invalid local config');
      err.malformed = true;
      throw err;
    }
    try {
      const syncData = await window.browserAPI.storage.get(['motionsConfig']);
      if (!syncData || typeof syncData.motionsConfig === 'undefined') return null;
      return parseStored(syncData.motionsConfig);
    } catch (e) {
      const err = new Error(e.message || 'Invalid sync config');
      err.malformed = true;
      throw err;
    }
  }

  function modesFor(section, item) {
    if (section === 'commands') return (item.modes || ['normal']).join(', ');
    if (section === 'motions') return 'normal, visual, visualLine';
    if (section === 'textObjects') return 'normal (after operator), visual, visualLine';
    return 'normal';
  }

  function noteFor(section, item) {
    const id = section === 'operatorSelf' ? item.operator : item.id;
    if (id === 'insert_autocomplete_next' || id === 'insert_autocomplete_prev') {
      return 'Unsupported: Google Docs has no Vim keyword completion';
    }
    const known = window.VimConfig.knownIds;
    if (section === 'operatorSelf') {
      return known.operators.includes(item.operator) ? '' : 'Unknown operator';
    }
    if (known[section] && !known[section].includes(item.id)) return 'Unknown ID';
    return '';
  }

  function addRows(section, items) {
    for (const item of items || []) {
      const tr = document.createElement('tr');
      const id = section === 'operatorSelf' ? item.operator : item.id;
      const keys = Array.isArray(item.keys) ? item.keys.join(' ') : '';
      const modes = modesFor(section, item);
      const notes = noteFor(section, item);
      tr.dataset.search = [section, id, keys, modes, notes].join(' ').toLowerCase();
      const values = [section, id, keys, modes, notes];
      values.forEach((value, i) => {
        const td = document.createElement('td');
        if (i === 2) td.className = 'keys';
        td.textContent = value;
        tr.appendChild(td);
      });
      rows.appendChild(tr);
    }
  }

  function render(config) {
    rows.innerHTML = '';
    addRows('motions', config.motions);
    addRows('operators', config.operators);
    addRows('textObjects', config.textObjects);
    addRows('operatorSelf', config.operatorSelf);
    addRows('commands', config.commands);
    filterRows();
  }

  function filterRows() {
    const q = search.value.trim().toLowerCase();
    Array.from(rows.rows).forEach(tr => {
      tr.style.display = !q || tr.dataset.search.includes(q) ? '' : 'none';
    });
  }
  search.addEventListener('input', filterRows);

  let helperFailed = false;
  try {
    await loadHelper();
  } catch (e) {
    helperFailed = true;
    setStatus('Failed to load browser helper script. Showing bundled defaults.', 'err');
  }

  let baseConfig;
  try {
    baseConfig = await loadBaseConfig();
  } catch (e) {
    setStatus('Failed to load bundled motions.json.', 'err');
    return;
  }

  let config = deepClone(baseConfig);
  if (!helperFailed) {
    try {
      const stored = await loadStoredConfig();
      if (stored) config = deepClone(stored);
    } catch (e) {
      config = deepClone(baseConfig);
      setStatus('Could not load stored bindings; showing defaults. ' + (e.message || ''), 'warn');
    }
  }

  render(config);
});
