(() => {
  const names = {
    ' ': 'SPACE', Escape: 'ESC', Enter: 'CR', Backspace: 'BS', Tab: 'TAB',
    ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right',
    Delete: 'Del', Home: 'Home', End: 'End', PageUp: 'PageUp', PageDown: 'PageDown',
    Insert: 'Insert',
  };
  const defaults = {
    registerPrefix: '"', allowCountPrefix: true, mappingTimeoutMs: 500,
    tokenAliases: { '<C-[>': '<ESC>' },
    cancelTokens: ['<ESC>', '<C-C>'],
    promptSubmitTokens: ['<CR>'], promptBackspaceTokens: ['<BS>'],
  };
  const modes = ['normal', 'visual', 'visualLine', 'insert'];
  const sections = ['motions', 'operators', 'textObjects', 'operatorSelf', 'commands'];
  const isChar = value => typeof value === 'string' && Array.from(value).length === 1;
  const knownIds = {
    motions: [
      'left', 'down', 'up', 'right', 'display_down', 'display_up', 'screen_top',
      'screen_middle', 'screen_bottom', 'word_start_fwd', 'WORD_start_fwd',
      'word_end_fwd', 'WORD_end_fwd', 'word_start_back', 'WORD_start_back',
      'word_end_back', 'WORD_end_back', 'match_pair', 'line_start',
      'first_non_blank', 'first_non_blank_down', 'line_end', 'last_non_blank',
      'first_line', 'last_line', 'find_next', 'till_next', 'find_prev', 'till_prev',
      'repeat_ft', 'repeat_ft_back', 'paragraph_fwd', 'paragraph_back',
      'scroll_center', 'scroll_top', 'scroll_bottom', 'scroll_down', 'scroll_up',
      'page_up', 'page_down', 'half_page_down', 'half_page_up',
    ],
    operators: [
      'delete', 'change', 'yank', 'indent', 'dedent', 'reindent', 'toggle_case',
      'lowercase', 'uppercase', 'reflow',
    ],
    textObjects: [
      'iw', 'aw', 'iW', 'aW', 'i(', 'a(', 'ib', 'ab', 'iB', 'aB', 'it', 'at',
      'i"', 'a"', "i'", "a'", 'i`', 'a`', 'ip', 'ap', 'is', 'as',
    ],
    commands: [
      'insert_before', 'insert_start_line', 'append_after', 'append_end_line',
      'open_below', 'open_above', 'append_end_word', 'replace_char', 'replace_mode',
      'join_lines', 'join_lines_no_space', 'substitute_char', 'substitute_line',
      'change_to_eol', 'delete_to_eol', 'yank_to_eol', 'delete_char',
      'delete_char_back', 'toggle_case_char', 'paste_after', 'paste_before',
      'paste_after_cursor_stay', 'paste_before_cursor_stay', 'paste_adjust_indent',
      'undo', 'undo_line', 'redo', 'repeat', 'visual_mode', 'visual_line_mode',
      'visual_other_end', 'visual_yank', 'visual_delete', 'visual_change',
      'visual_indent', 'visual_dedent', 'visual_toggle_case', 'visual_lowercase',
      'visual_uppercase', 'exit_visual', 'exit_visual_ctrl_c', 'exit_insert',
      'exit_insert_ctrl_c', 'insert_delete_char_back', 'insert_delete_word',
      'insert_line_break', 'insert_indent', 'insert_dedent',
      'insert_autocomplete_next', 'insert_autocomplete_prev', 'insert_register',
      'insert_temp_normal', 'search_forward', 'search_backward', 'search_next',
      'search_prev', 'search_word_forward', 'search_word_backward', 'set_mark',
      'jump_mark', 'jump_prev_pos', 'jump_last_exit', 'jump_last_edit_pos',
      'jump_last_change', 'jump_newer', 'jump_older', 'change_next', 'change_prev',
      'increment', 'decrement', 'visual_reselect', 'macro_record', 'macro_play',
      'macro_repeat', 'surround_delete', 'surround_change', 'surround_word',
      'surround_WORD', 'visual_surround', 'ex_command', 'insert_text',
      'insert_replace_char', 'record_last_exit', 'exit_mode',
    ],
  };

  function eventToToken(event) {
    if (event.isComposing || event.key === 'Dead' || event.key === 'Process' ||
        event.getModifierState?.('AltGraph')) return null;
    const key = event.key;
    if (!key) return null;
    const chord = event.ctrlKey || event.altKey || event.metaKey;
    if (isChar(key) && !chord && key !== ' ') return key;
    const name = names[key] || (/^F(?:[1-9]|1[0-9]|2[0-4])$/.test(key) ? key :
      (isChar(key) ? key.toUpperCase() : null));
    if (!name) return null;
    const modifiers = [event.ctrlKey && 'C', event.altKey && 'A', event.metaKey && 'M', event.shiftKey && 'S'].filter(Boolean);
    return `<${modifiers.length ? modifiers.join('-') + '-' : ''}${name}>`;
  }

  function validToken(token, placeholder = true) {
    if (isChar(token)) return !/[\x00-\x1f\x7f]/.test(token);
    if (placeholder && token === '<char>') return true;
    if (typeof token !== 'string' || !token.startsWith('<') || !token.endsWith('>')) return false;
    let body = token.slice(1, -1);
    let chord = false;
    for (const modifier of ['C-', 'A-', 'M-', 'S-']) {
      if (body.startsWith(modifier)) { body = body.slice(2); if (modifier !== 'S-') chord = true; }
    }
    return Object.values(names).includes(body) || /^F(?:[1-9]|1[0-9]|2[0-4])$/.test(body) ||
      (chord && isChar(body) && body !== ' ' && body === body.toUpperCase());
  }

  const normalizeToken = token => token === ' ' ? '<SPACE>' : token;
  function normalizeSettings(input) {
    const settings = { ...defaults, ...input };
    settings.tokenAliases = Object.fromEntries(Object.entries(settings.tokenAliases)
      .map(([from, to]) => [normalizeToken(from), normalizeToken(to)]));
    const resolve = token => settings.tokenAliases[normalizeToken(token)] || normalizeToken(token);
    settings.registerPrefix = resolve(settings.registerPrefix);
    settings.cancelTokens = settings.cancelTokens.map(resolve);
    settings.promptSubmitTokens = settings.promptSubmitTokens.map(resolve);
    settings.promptBackspaceTokens = settings.promptBackspaceTokens.map(resolve);
    return settings;
  }
  function isExitId(id) {
    return id === 'exit_mode' || (typeof id === 'string' && id.startsWith('exit_'));
  }
  function isKeyPrefix(a, b) {
    if (a.length === b.length) return false;
    const n = Math.min(a.length, b.length);
    for (let i = 0; i < n; i++) if (a[i] !== b[i]) return false;
    return true;
  }
  // Operator+self (dd after d) is consumed by the pending operator parser.
  // The bundled ea shortcut is a composite: e runs immediately, then a.
  function allowCrossPrefix(short, longer, config, mode) {
    if (short.section === 'operators' && longer.section === 'operatorSelf') return true;
    if (short.section !== 'motions' || longer.section !== 'commands' ||
        short.item.id !== 'word_end_fwd' || longer.item.id !== 'append_end_word' || mode !== 'normal') return false;
    const suffix = longer.item.keys.slice(short.item.keys.length).map(normalizeToken);
    return (config.commands || []).some(c => c.id === 'append_after' &&
      (c.modes || ['normal']).includes(mode) &&
      JSON.stringify(c.keys.map(normalizeToken)) === JSON.stringify(suffix));
  }
  function validate(config) {
    if (!config || typeof config !== 'object' || Array.isArray(config)) return 'Configuration must be an object';
    if (config.settings !== undefined && (!config.settings || typeof config.settings !== 'object' || Array.isArray(config.settings))) return 'settings must be an object';
    let settings = { ...defaults, ...config.settings };
    if (!validToken(settings.registerPrefix, false)) return 'registerPrefix must be a supported key token';
    for (const name of ['allowCountPrefix', 'allowRegisterPrefix']) {
      if (settings[name] !== undefined && typeof settings[name] !== 'boolean') return `${name} must be true or false`;
    }
    if (!Number.isFinite(settings.mappingTimeoutMs) || settings.mappingTimeoutMs < 50 || settings.mappingTimeoutMs > 10000) return 'mappingTimeoutMs must be between 50 and 10000';
    const rawAliases = settings.tokenAliases;
    if (!Array.isArray(settings.cancelTokens) || !settings.cancelTokens.length || settings.cancelTokens.some(k => !validToken(k, false))) return 'cancelTokens must be a nonempty list of supported key tokens';
    for (const name of ['promptSubmitTokens', 'promptBackspaceTokens']) {
      if (!Array.isArray(settings[name]) || !settings[name].length || settings[name].some(k => !validToken(k, false))) return `${name} must be a nonempty list of supported key tokens`;
    }
    if (!rawAliases || typeof rawAliases !== 'object' || Array.isArray(rawAliases)) return 'tokenAliases must be an object';
    settings = normalizeSettings(settings);
    const aliases = settings.tokenAliases;
    const promptNames = ['cancelTokens', 'promptSubmitTokens', 'promptBackspaceTokens'];
    for (let i = 0; i < promptNames.length; i++) {
      for (let j = i + 1; j < promptNames.length; j++) {
        // New options must not invalidate old configs that only customized cancellation.
        const explicit = [promptNames[i], promptNames[j]].some(name => name !== 'cancelTokens' && Object.hasOwn(config.settings || {}, name));
        if (explicit && settings[promptNames[j]].some(key => settings[promptNames[i]].includes(key))) return 'Prompt cancel, submit and backspace keys must not overlap';
      }
    }
    if (Object.keys(rawAliases).length !== Object.keys(aliases).length) return 'Duplicate normalized token aliases';
    for (const [from, to] of Object.entries(aliases)) {
      if (!validToken(from, false) || !validToken(to, false) || from === to || Object.hasOwn(aliases, to)) return 'Aliases must map supported tokens directly, without cycles or chains';
    }
    for (const section of sections) {
      if (config[section] !== undefined && !Array.isArray(config[section])) return `${section} must be a list`;
      const items = config[section] || [];
      if (items.length > 2000) return `${section} exceeds the 2000-binding safety limit`;
      const normalizedKeys = items.map(item => Array.isArray(item?.keys) ? item.keys.map(normalizeToken) : []);
      const signatures = normalizedKeys.map(keys => JSON.stringify(keys));
      for (let index = 0; index < items.length; index++) {
        const item = items[index];
        const label = `${section}[${index + 1}]`;
        if (!item || typeof item !== 'object') return `${label} must be an object`;
        if (section !== 'operatorSelf' && (typeof item.id !== 'string' || !item.id)) return `${label} needs an ID`;
        if (section !== 'operatorSelf' && !knownIds[section].includes(item.id)) return `${label}: unknown id ${item.id}`;
        if (!Array.isArray(item.keys) || !item.keys.length || item.keys.some(k => !validToken(k))) return `${label} needs supported, nonempty key tokens`;
        if (item.keys.length > 32) return `${label} exceeds the 32-token mapping safety limit`;
        if (item.keys.some(k => Object.hasOwn(aliases, normalizeToken(k)))) return `${label}: remove the key's tokenAliases entry before binding it`;
        if (section === 'commands' && item.modes !== undefined && (!Array.isArray(item.modes) || !item.modes.length || item.modes.some(m => !modes.includes(m)))) return `${label} needs supported modes`;
        if (item.args !== undefined && (!Array.isArray(item.args) || item.args.some(a => !a || typeof a.name !== 'string'))) return `${label} has invalid arguments`;
        const charArgIds = new Set([
          'find_next', 'till_next', 'find_prev', 'till_prev', 'replace_char',
          'insert_register', 'set_mark', 'jump_mark', 'macro_record', 'macro_play',
          'surround_delete', 'surround_change', 'surround_word', 'surround_WORD', 'visual_surround',
        ]);
        const hasChar = (item.args || []).some(a => a.type === 'char') || (item.id && charArgIds.has(item.id));
        const placeholders = item.keys.filter(k => k === '<char>').length;
        if (placeholders && (!['motions', 'commands'].includes(section) || placeholders !== 1 || item.keys.at(-1) !== '<char>')) return `${label}: <char> must appear once, at the end of a motion or command`;
        if (hasChar && !placeholders) return `${label} requires a final <char> argument`;
        if (section === 'operatorSelf' && (typeof item.operator !== 'string' || item.target?.type !== 'line')) return `${label} needs an operator and a line target`;
        if (section === 'operatorSelf' && !knownIds.operators.includes(item.operator)) return `${label}: unknown operator ${item.operator}`;
        if (section === 'textObjects') {
          if (typeof item.type !== 'string' || !item.type) return `${label} needs a text object type`;
          if (!['word', 'word_around', 'WORD', 'WORD_around', 'paren_inner', 'paren_around',
            'quote_inner', 'quote_around', 'paragraph_inner', 'paragraph_around',
            'sentence_inner', 'sentence_around', 'tag_inner', 'tag_around'].includes(item.type)) return `${label}: unknown text object type`;
          if (item.delims !== undefined && (!Array.isArray(item.delims) || item.delims.length !== 2 || item.delims.some(d => !isChar(d)))) return `${label} needs two single-character delimiters`;
        }
        const activeModes = section === 'commands' ? (item.modes || ['normal']) : ['normal'];
        const usesPrefixes = activeModes.some(mode => mode !== 'insert');
        if (usesPrefixes && settings.allowCountPrefix && /^[1-9]$/.test(item.keys[0])) return `${label}: set allowCountPrefix to false to bind count digits`;
        if (usesPrefixes && settings.allowRegisterPrefix && normalizeToken(item.keys[0]) === settings.registerPrefix) return `${label}: change or disable registerPrefix before binding this key`;
        for (let previous = 0; previous < index; previous++) {
          const other = items[previous];
          const sameKeys = signatures[previous] === signatures[index];
          const overlap = section !== 'commands' || (other.modes || ['normal']).some(m => activeModes.includes(m));
          if (sameKeys && overlap) return `${label}: duplicate binding ${item.keys.join(' ')}`;
          const prefix = isKeyPrefix(normalizedKeys[previous], normalizedKeys[index]);
          if (prefix && overlap) return `${label}: a shorter binding in this section would hide the longer sequence`;
        }
      }
    }
    // Commands and motions use the same input stream within each mode.
    // Operator/text-object overlaps in Visual mode are intentional, because
    // Visual commands act on the existing selection instead of starting an operator.
    for (const mode of modes) {
      const tagged = [];
      for (const item of config.commands || []) {
        if ((item.modes || ['normal']).includes(mode)) tagged.push({ item, section: 'commands' });
      }
      if (mode !== 'insert') {
        for (const item of config.motions || []) tagged.push({ item, section: 'motions' });
      }
      if (mode === 'normal') {
        for (const item of config.operators || []) tagged.push({ item, section: 'operators' });
        for (const item of config.operatorSelf || []) tagged.push({ item, section: 'operatorSelf' });
      }
      if (mode === 'visual' || mode === 'visualLine') {
        for (const item of config.textObjects || []) tagged.push({ item, section: 'textObjects' });
      }
      const seen = new Set();
      for (const { item } of tagged) {
        const key = JSON.stringify(item.keys.map(normalizeToken));
        if (seen.has(key)) return `${mode}: conflicting binding ${item.keys.join(' ')}`;
        seen.add(key);
      }
      const normalizedKeys = tagged.map(({item}) => item.keys.map(normalizeToken));
      for (let i = 0; i < tagged.length; i++) {
        for (let j = i + 1; j < tagged.length; j++) {
          const a = normalizedKeys[i];
          const b = normalizedKeys[j];
          if (!isKeyPrefix(a, b)) continue;
          const short = a.length < b.length ? tagged[i] : tagged[j];
          const longer = a.length < b.length ? tagged[j] : tagged[i];
          if (allowCrossPrefix(short, longer, config, mode)) continue;
          return `${mode}: a shorter binding would hide the longer sequence ${longer.item.keys.join(' ')}`;
        }
      }
    }
    const commands = config.commands || [];
    const canInsert = (config.operators || []).some(o => o.id === 'change') ||
      (config.operatorSelf || []).some(o => o.operator === 'change') ||
      commands.some(c => c.id === 'replace_mode' || c.id === 'substitute_char' ||
        c.id === 'substitute_line' || c.id === 'change_to_eol' || c.id === 'visual_change' ||
        String(c.id).startsWith('insert_') || String(c.id).startsWith('append_') || String(c.id).startsWith('open_'));
    const canVisual = commands.some(c => c.id === 'visual_mode' || c.id === 'visual_line_mode');
    if (canInsert && !commands.some(c => isExitId(c.id) && (c.modes || ['normal']).includes('insert'))) {
      return 'insert: needs a reachable exit command (exit_* or exit_mode)';
    }
    if (canVisual) {
      for (const mode of ['visual', 'visualLine']) {
        if (!commands.some(c => isExitId(c.id) && (c.modes || ['normal']).includes(mode))) {
          return `${mode}: needs a reachable exit command (exit_* or exit_mode)`;
        }
      }
    }
    return null;
  }
  window.VimConfig = { defaults, eventToToken, validToken, validate, normalizeToken, normalizeSettings, knownIds };
})();
