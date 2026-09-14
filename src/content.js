(() => {
  const IS_BROWSER = typeof browser !== "undefined";
  const API = IS_BROWSER ? browser : chrome;

  let parser = null;
  let startupFailed = false;
  let configRevision = 0;
  const changedSettings = new Set();
  let debug = false;
  let useDisplayLines = false;
  let executor = null;
  let mode = "normal"; // normal | insert | visual | visualLine
  let tempNormal = false; // from <C-O>
  let replaceMode = false; // insert-overwrite (R)
  // Ops array recording user activity during insert / replace mode for '.' repeat.
  // Each op is either { type: 'text', value: 'abc' } or { type: 'bs', count: N }.
  // Backspaces collapse trailing text first; once the buffer is empty, additional
  // backspaces accumulate as bs ops so we can faithfully replay over pre-existing text.
  let insertOps = [];
  let insertSize = 0;
  let insertRecordingInvalid = false;
  const insertSegmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
  const insertNavigationKeys = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown',
    'Home', 'End', 'PageUp', 'PageDown']);
  function resetInsertOps() {
    insertOps = [];
    insertSize = 0;
    insertRecordingInvalid = false;
  }
  function splitInsertAtNavigation(event) {
    if (mode === 'insert' && replaceMode && event.key !== 'Backspace' && !printable(event)) executor.resetReplaceHistory?.();
    if (mode !== 'insert' || !insertNavigationKeys.has(event.key)) return;
    resetInsertOps();
    executor.startInsert({ id: replaceMode ? 'replace_mode' : 'insert_before',
      kind: replaceMode ? 'replace' : 'insert', count: 1 });
    executor.captureInsertStart?.(true);
  }
  function appendOpText(s) {
    if (!s || insertRecordingInvalid) return;
    insertSize += s.length;
    if (insertSize > 1000000 || insertOps.length >= 10000) {
      insertOps = [];
      insertRecordingInvalid = true;
      executor.cancelPendingChange?.();
      if (ui) ui.setBufferText('Insert is too large to record for repeat. Typing is unaffected.');
      return;
    }
    const last = insertOps[insertOps.length - 1];
    if (last && last.type === "text") last.value += s;
    else insertOps.push({ type: "text", value: s });
  }
  function appendOpBs() {
    if (insertRecordingInvalid) return;
    const last = insertOps[insertOps.length - 1];
    if (last && last.type === "text" && last.value.length > 0) {
      const end = last.value.length;
      const low = last.value.charCodeAt(end - 1);
      const high = last.value.charCodeAt(end - 2);
      let width = low >= 0xdc00 && low <= 0xdfff && high >= 0xd800 && high <= 0xdbff ? 2 : 1;
      const tail = insertSegmenter.segment(last.value).containing(end - 1);
      // Docs removes emoji clusters together, but ordinary combining accents
      // one code point at a time. Repeat must record the same deletion.
      if (tail && /[\p{Extended_Pictographic}\p{Regional_Indicator}]/u.test(tail.segment)) {
        width = tail.segment.length;
      }
      last.value = last.value.slice(0, -width);
      insertSize -= width;
      if (!last.value) insertOps.pop();
      return;
    }
    if ((last && last.type === "bs" && last.count >= 10000) || insertOps.length >= 10000) {
      insertOps = [];
      insertRecordingInvalid = true;
      executor.cancelPendingChange?.();
      if (ui) ui.setBufferText('Insert is too large to record for repeat. Typing is unaffected.');
      return;
    }
    if (last && last.type === "bs") last.count++;
    else insertOps.push({ type: "bs", count: 1 });
  }
  let uiTheme = "vim";
  let ui = null;
  let vimEnabled = true;

  let executing = false;
  let draining = false;
  const commands = [];
  const inputs = [];
  const MAX_COMMANDS = 64;
  const MAX_INPUTS = 128;
  const MAX_PROMPT = 1000;
  let insertPending = [];
  let mappingTimer = null;
  let prompt = null;

  function suppress(e) {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
  }

  // Parse queued keys only after the preceding document operation has finished:
  // a change operator may enter Insert mode while it is awaiting Docs.
  function drain() {
    if (draining || executing) return;
    draining = true;
    try {
      while (!executing) {
        if (commands.length) {
          executing = true;
          const run = commands.shift();
          Promise.resolve().then(run).catch(err => {
            console.error("[VimExecutor]", err);
            commands.length = 0;
            inputs.length = 0;
            clearInsertMapping();
            prompt = null;
            resetInsertOps();
            tempNormal = false;
            replaceMode = false;
            executor.cancelPendingChange?.();
            executor.abortMacro?.('Macro cancelled: command failed.');
            setMode('normal');
            if (ui) ui.setBufferText('Edit failed; queued keys discarded. Check document before continuing.');
          }).finally(() => {
            executing = false;
            drain();
            if (!executing && !commands.length && !inputs.length) executor.releaseEditor?.();
          });
        } else if (inputs.length) {
          const { event, literal } = inputs.shift();
          if (event.target?.ownerDocument && event.target.ownerDocument !== findEditorDoc()) {
            cancelQueuedCommands('Editor changed; queued keys discarded.');
            break;
          }
          handleKey(event, true, literal);
        } else break;
      }
    } finally {
      draining = false;
    }
  }

  function storageCall(store, method, arg) {
    if (IS_BROWSER) return Promise.resolve().then(() => store[method](arg));
    return new Promise((resolve, reject) => {
      try {
        store[method](arg, result => {
          const err = API.runtime && API.runtime.lastError;
          if (err) reject(err);
          else resolve(result);
        });
      } catch (e) { reject(e); }
    });
  }

  function discardNotice(kind) {
    if (ui) ui.setBufferText(kind === "command"
      ? "Command queue full; input discarded. Check document before continuing."
      : "Input queue full; key discarded.");
  }

  function runExec(result, after) {
    const expectedDoc = findEditorDoc();
    const returnToInsert = tempNormal;
    if (commands.length >= MAX_COMMANDS) {
      discardNotice("command");
      return;
    }
    if (executor.isRecordingMacro?.()) {
      try { executor.recordMacro(tempNormal ? { ...result, temporaryNormal: true } : result); } catch (err) {
        console.error("[VimExecutor]", err);
        if (ui) ui.setBufferText("Macro recording stopped.");
      }
    }
    commands.push(async () => {
      await executor.exec(result, expectedDoc);
      if (after) await after();
      if (returnToInsert) restoreTempNormal();
    });
    drain();
  }

  function enqueueInput(event, literal) {
    // Held keys should follow editor throughput, not build seconds of stale
    // edits. Preserve separate presses and at most one pending auto-repeat.
    if (event.repeat && mode !== 'insert' && inputs.some(input =>
        input.event.repeat && input.event.code === event.code && input.event.key === event.key)) return;
    if (inputs.length >= MAX_INPUTS) {
      discardNotice("input");
      return;
    }
    inputs.push({ event, literal: !!literal });
  }

  function showPending(res) {
    if (!ui) return;
    const hint = parser && parser.hint ? parser.hint() : null;
    const parts = [];
    if (hint?.register) parts.push('"' + hint.register);
    if (res?.countProvided || (hint?.keys || []).some(k => /^[0-9]$/.test(k))) {
      parts.push(String(hint?.count || res?.count || 1));
    }
    const keys = (res && res.keys) || hint?.keys || [];
    if (keys.length) parts.push(keys.join(""));
    if (hint?.next?.length) parts.push("[" + hint.next.slice(0, 12).join(" ") + "]");
    ui.setBufferText(parts.join(" "));
  }

  function log(...args) {
    if (debug) console.log("[VimParser]", ...args);
  }

  const eventToToken = window.VimConfig.eventToToken;
  const printable = e => Array.from(e.key || "").length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey;

  function clearInsertMapping() {
    clearTimeout(mappingTimer);
    mappingTimer = null;
    insertPending = [];
  }

  function flushInsertMapping(nextEvent) {
    const literal = insertPending.filter(e => !e.ctrlKey && !e.altKey && !e.metaKey)
      .map(event => ({ event, literal: true }));
    clearInsertMapping();
    parser.reset();
    if (ui) ui.setBufferText("");
    if (nextEvent) literal.push({ event: nextEvent, literal: false });
    const room = Math.max(0, MAX_INPUTS - inputs.length);
    if (literal.length > room) discardNotice("input");
    inputs.unshift(...literal.slice(0, room));
    drain();
  }

  function focusEditorSoft() {
    try {
      const iframe = document.querySelector(".docs-texteventtarget-iframe");
      iframe?.contentWindow?.focus();
      const doc = iframe?.contentDocument;
      (doc?.querySelector('[contenteditable="true"]') || doc?.body)?.focus();
    } catch (_) {}
  }

  function renderPrompt() {
    if (!ui || !prompt) return;
    if (prompt.type === "surround") {
      ui.setBufferText("cs" + (prompt.from || ""));
      return;
    }
    const lead = prompt.type === "ex" ? ":" : (prompt.direction === "backward" ? "?" : "/");
    ui.setBufferText(lead + (prompt.buffer || ""));
  }

  function finishPrompt() {
    const p = prompt;
    prompt = null;
    if (ui) ui.setBufferText("");
    if (!p) return;
    if (p.type === "search") {
      runExec({
        kind: "command",
        command: {
          id: p.direction === "backward" ? "search_backward" : "search_forward",
          args: { pattern: p.buffer || "" },
          modes: ["normal"],
        },
        count: p.count || 1,
      }, () => focusEditorSoft());
      return;
    }
    if (p.type === "ex") {
      runExec({
        kind: "command",
        command: { id: "ex_command", args: { line: p.buffer || "" }, modes: ["normal"] },
        count: 1,
      }, () => focusEditorSoft());
    }
  }

  function handlePrompt(e, token) {
    suppress(e);
    token = parser.settings.tokenAliases[token] || token;
    if (parser.isCancel(token)) {
      prompt = null;
      if (ui) ui.setBufferText("");
      focusEditorSoft();
      restoreTempNormal();
      return;
    }
    if (parser.settings.promptSubmitTokens.includes(token)) {
      finishPrompt();
      return;
    }
    if (parser.settings.promptBackspaceTokens.includes(token)) {
      prompt.buffer = Array.from(prompt.buffer || "").slice(0, -1).join("");
      renderPrompt();
      return;
    }
    if (prompt.type === "surround") {
      const ch = token && Array.from(token).length === 1 && token[0] !== "<" ? token : (printable(e) ? e.key : "");
      if (!ch) return;
      const from = prompt.from;
      prompt = null;
      runExec({
        kind: "command",
        command: { id: "surround_change", args: { char: from, to: ch }, modes: ["normal"] },
        count: 1,
      });
      if (ui) ui.setBufferText("");
      return;
    }
    if (printable(e)) {
      const cur = prompt.buffer || "";
      if (Array.from(cur).length >= MAX_PROMPT) {
        if (ui) ui.setBufferText((prompt.type === "ex" ? ":" : (prompt.direction === "backward" ? "?" : "/")) + cur + " [truncated]");
        return;
      }
      prompt.buffer = cur + e.key;
      renderPrompt();
    }
  }

  function maybePrompt(res) {
    const id = res.command && res.command.id;
    if (id === "search_forward" || id === "search_backward") {
      prompt = { type: "search", direction: id === "search_backward" ? "backward" : "forward", buffer: "", count: res.count || 1 };
      renderPrompt();
      return true;
    }
    if (id === "ex_command") {
      prompt = { type: "ex", buffer: "" };
      renderPrompt();
      return true;
    }
    if (id === "surround_change" && !(res.command.args && res.command.args.to)) {
      prompt = { type: "surround", from: res.command.args && res.command.args.char };
      renderPrompt();
      return true;
    }
    return false;
  }

  function replayKey(event) {
    runExec({
      kind: "key",
      event: {
        key: event.key, code: event.code, keyCode: event.keyCode,
        ctrlKey: !!event.ctrlKey, altKey: !!event.altKey,
        metaKey: !!event.metaKey, shiftKey: !!event.shiftKey,
      },
    });
  }

  function applyConfig(config) {
    const error = window.VimConfig.validate(config);
    if (error) throw new Error(error);
    if (insertPending.length) flushInsertMapping();
    parser.setConfig(config);
    parser.reset();
  }

  function recordInsertCommand(id) {
    if (replaceMode && id !== 'insert_delete_char_back') executor.resetReplaceHistory?.();
    if (id === "insert_delete_char_back") appendOpBs();
    else if (id === "insert_line_break" && !replaceMode) appendOpText("\n");
    else if (id === "insert_delete_word") {
      try {
        const d = executor.nav.prevStartDelta("word");
        for (let i = 0; i < d; i++) appendOpBs();
      } catch (_) {}
    }
  }

  // Returns true if the parse result was handled (caller should stop).
  function dispatchInsertParse(res) {
    if (!res) return true;
    if (res.kind === "prefix" || res.kind === "await_char") {
      showPending(res);
      return true;
    }
    if (res.kind === "invalid") {
      if (ui) ui.setBufferText("");
      return false;
    }
    if (res.kind !== "command") return false;
    if (ui) ui.setBufferText("");
    const id = res.command && res.command.id;
    if (id === "insert_temp_normal") {
      tempNormal = true;
      setMode("normal");
      return true;
    }
    if (id === "exit_insert" || id === "exit_insert_ctrl_c" || (id && String(id).startsWith("exit_"))) {
      res.command.args = { ...res.command.args, insertOps: insertOps.map(op => ({ ...op })) };
      resetInsertOps();
      replaceMode = false;
      runExec(res);
      return true;
    }
    if (id === "insert_register") {
      if (replaceMode) executor.resetReplaceHistory?.();
      const ch = res.command.args && res.command.args.char;
      try {
        const text = ch ? executor.getRegisterText(ch) : "";
        if (text) appendOpText(text);
      } catch (_) {}
      runExec(res);
      return true;
    }
    if (maybePrompt(res)) return true;
    recordInsertCommand(id);
    runExec(res);
    return true;
  }

  function findEditorDoc() {
    const editorIframe = document.querySelector(".docs-texteventtarget-iframe");
    if (editorIframe && editorIframe.contentDocument)
      return editorIframe.contentDocument;
    return null;
  }

  function restoreTempNormal() {
    if (!tempNormal) return;
    tempNormal = false;
    const savedOps = insertOps;
    const savedSize = insertSize;
    const savedInvalid = insertRecordingInvalid;
    setMode("insert");
    insertOps = savedOps;
    insertSize = savedSize;
    insertRecordingInvalid = savedInvalid;
  }

  function handleKey(e, replay = false, literal = false) {
    const token = eventToToken(e);
    try {
      if (prompt && !literal) {
        handlePrompt(e, token);
        return;
      }
      if (!literal && vimEnabled && mode === 'normal' && executor.isRecordingMacro?.()) {
        const sequence = [...parser.buffer, parser.settings.tokenAliases[token] || token];
        const stop = (parser.config.commands || []).some(c => c.id === 'macro_record' &&
          (c.modes || ['normal']).includes('normal') && c.keys.at(-1) === '<char>' &&
          c.keys.length === sequence.length + 1 && sequence.every((key, index) =>
            key === window.VimConfig.normalizeToken(c.keys[index])));
        if (stop) {
          suppress(e);
          parser.reset();
          executor.stopMacro();
          if (ui) ui.setBufferText("");
          return;
        }
      }
      if (literal || !vimEnabled) {
        splitInsertAtNavigation(e);
        if (mode === "insert" && printable(e)) appendOpText(e.key);
        else if (mode === "insert" && e.key === "Enter" && !replaceMode) appendOpText("\n");
        else if (mode === "insert" && e.key === "Backspace") appendOpBs();
        if (replaceMode && e.key === 'Backspace' && vimEnabled) {
          runExec({ kind: 'command', command: { id: 'insert_delete_char_back' }, count: 1 });
        } else if (replaceMode && printable(e) && vimEnabled) {
          runExec({ kind: "command", command: { id: "insert_replace_char", args: { char: e.key } }, count: 1 });
        } else replayKey(e);
        return;
      }
      if (mode === "insert") {
        if (token && (parser.isPending() || parser.isBinding(token))) {
          suppress(e);
          clearTimeout(mappingTimer);
          const res = parser.feed(token);
          if (res.kind === "invalid") {
            flushInsertMapping(e);
            return;
          }
          if (res.kind === "prefix" || res.kind === "await_char") {
            insertPending.push(e);
            mappingTimer = setTimeout(() => flushInsertMapping(), parser.settings.mappingTimeoutMs);
          } else clearInsertMapping();
          dispatchInsertParse(res);
          return;
        }
        if (insertPending.length) {
          suppress(e);
          flushInsertMapping(e);
          return;
        }
        splitInsertAtNavigation(e);
        if (printable(e)) appendOpText(e.key);
        else if (e.key === "Enter" && !replaceMode) appendOpText("\n");
        else if (e.key === "Backspace") appendOpBs();
        if (replaceMode && e.key === 'Backspace') {
          suppress(e);
          runExec({ kind: 'command', command: { id: 'insert_delete_char_back' }, count: 1 });
        } else if (replaceMode && printable(e)) {
          suppress(e);
          runExec({ kind: "command", command: { id: "insert_replace_char", args: { char: e.key } }, count: 1 });
        } else if (replay) replayKey(e);
        else if (executor.isRecordingMacro?.() && (printable(e) ||
            insertNavigationKeys.has(e.key) || ['Enter', 'Backspace', 'Tab'].includes(e.key))) {
          executor.recordMacro({ kind: 'key', event: {
            key: e.key, code: e.code, keyCode: e.keyCode,
            ctrlKey: !!e.ctrlKey, altKey: !!e.altKey, metaKey: !!e.metaKey, shiftKey: !!e.shiftKey,
          } });
        }
        return;
      }

      // Unmapped navigation keys and application shortcuts retain native behavior.
      // Pending mappings can consume modified keys, even if those keys cannot start one.
      const nativeKey = !token || e.ctrlKey || e.altKey || e.metaKey ||
        (!printable(e) && !["Escape", "Enter", "Backspace", "Tab"].includes(e.key));
      if (parser.isCancel(token)) parser.reset();
      if (nativeKey && !parser.isBinding(token) && !parser.canContinue(token) && !parser.isCancel(token)) {
        parser.reset();
        if (ui) ui.setBufferText("");
        if (replay) replayKey(e);
        restoreTempNormal();
        return;
      }
      suppress(e);
      const res = parser.feed(token);
      if (!res || res.kind === "invalid") {
        if (ui) ui.setBufferText("");
        restoreTempNormal();
        return;
      }
      if (res.kind === "prefix" || res.kind === "await_char") {
        showPending(res);
        return;
      }
      log("complete", res.kind, res.command?.id || res.motion?.id || res.operator);
      if (maybePrompt(res)) return;
      runExec(res);
      if (ui) ui.setBufferText("");
    } catch (err) {
      console.error("Parser error", err);
    }
  }

  function cancelQueuedCommands(message) {
    executor.requestCancel?.();
    commands.length = 0;
    inputs.length = 0;
    clearInsertMapping();
    prompt = null;
    tempNormal = false;
    replaceMode = false;
    resetInsertOps();
    executor.cancelPendingChange?.();
    executor.abortMacro?.('Macro cancelled: pending commands were discarded.');
    setMode('normal');
    if (!executing) executor.releaseEditor?.();
    if (ui) ui.setBufferText(message);
  }

  function attachKeyListener() {
    const onPointerDown = event => {
      if (!event.isTrusted) return;
      executor.resetReplaceHistory?.();
      if (executing || commands.length || inputs.length) {
        cancelQueuedCommands('Pointer moved; pending commands cancelled. Check the document.');
      }
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    const onKeyDown = e => {
      if (!vimEnabled || !e.isTrusted || e.isComposing || e.key === "Dead" ||
          e.key === "Process" || e.getModifierState?.("AltGraph")) return;
      // Modifier-only events do not change the document and need no buffering.
      if (!eventToToken(e)) return;
      if (executor.editorIsWritable?.() === false) {
        if (executing) executor.requestCancel?.();
        commands.length = 0;
        inputs.length = 0;
        parser.reset();
        clearInsertMapping();
        prompt = null;
        tempNormal = false;
        replaceMode = false;
        resetInsertOps();
        executor.cancelPendingChange?.();
        executor.abortMacro?.('Macro cancelled: editor unavailable.');
        setMode('normal');
        if (ui) ui.setBufferText('Editor unavailable for editing; keys passed to Docs.');
        return;
      }
      // Insert-mode exit must follow already-typed input, not discard it.
      // Macro cancellation remains immediate even if playback entered Insert.
      if (executing && parser.isCancel(eventToToken(e)) &&
          (mode !== 'insert' || executor.isPlayingMacro?.())) {
        suppress(e);
        cancelQueuedCommands('Cancelled pending commands; check the document.');
        return;
      }
      // Browser shortcuts cannot be replayed with untrusted events.
      const promptToken = parser.settings.tokenAliases[eventToToken(e)] || eventToToken(e);
      const promptControl = prompt && (parser.settings.promptSubmitTokens.includes(promptToken) ||
        parser.settings.promptBackspaceTokens.includes(promptToken));
      if ((e.ctrlKey || e.metaKey || e.altKey) && !parser.isBinding(eventToToken(e)) &&
          !parser.canContinue(eventToToken(e)) && !parser.isCancel(eventToToken(e)) &&
          !promptControl &&
          !(mode === 'insert' && insertNavigationKeys.has(e.key)) &&
          !(executing && parser.commandsRootByMode.insert.children.has(eventToToken(e)))) {
        if (insertPending.length) flushInsertMapping();
        parser.reset();
        if (ui) ui.setBufferText("");
        if (executing) {
          cancelQueuedCommands('Native shortcut used; pending commands cancelled. Check the document.');
        } else restoreTempNormal();
        return;
      }
      if (prompt) {
        handlePrompt(e, eventToToken(e));
        return;
      }
      if (executing || inputs.length) {
        suppress(e);
        enqueueInput(e, false);
        drain();
      } else handleKey(e);
    };
    const attachedDocs = new WeakSet();
    const attachedFrames = new WeakSet();
    let currentFrame;
    let currentDoc;
    const attach = () => {
      // Most Docs mutations are edits, not iframe replacements. Avoid scanning
      // the outer document again while the known editor is still connected.
      if (currentFrame?.isConnected && currentFrame.contentDocument === currentDoc) return;
      const frame = document.querySelector(".docs-texteventtarget-iframe");
      if (frame && !attachedFrames.has(frame)) {
        frame.addEventListener('load', attach);
        attachedFrames.add(frame);
      }
      const doc = findEditorDoc();
      if (!doc || attachedDocs.has(doc)) return;
      currentFrame = frame;
      currentDoc = doc;
      doc.addEventListener('keydown', onKeyDown, true);
      doc.addEventListener('pointerdown', onPointerDown, true);
      doc.addEventListener('keyup', event => {
        if (!event.isTrusted || mode === 'insert') return;
        for (let i = inputs.length - 1; i >= 0; i--) {
          const pending = inputs[i].event;
          if (pending.repeat && pending.code === event.code && pending.key === event.key) inputs.splice(i, 1);
        }
      }, true);
      attachedDocs.add(doc);
    };
    attach();
    // Docs may create or replace its input iframe after the extension starts.
    const observer = new MutationObserver(attach);
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  function migrateConfig(stored, base) {
    const storedVersion = stored.schemaVersion || 1;
    const baseVersion = base.schemaVersion || 1;
    if (storedVersion >= baseVersion) return stored;

    log(`Migrating config from schema v${storedVersion} to v${baseVersion}`);
    const migrated = JSON.parse(JSON.stringify(stored));
    migrated.schemaVersion = baseVersion;

    function pushIfValid(section, item, label, insertIdx) {
      if (!item) return;
      migrated[section] = migrated[section] || [];
      const exists = section === "operatorSelf"
        ? migrated[section].some(e => e.operator === item.operator)
        : migrated[section].some(e => e.id === item.id);
      if (exists) return;
      if (Number.isInteger(insertIdx) && insertIdx >= 0) migrated[section].splice(insertIdx, 0, item);
      else migrated[section].push(item);
      const error = window.VimConfig.validate(migrated);
      if (error) {
        const idx = migrated[section].indexOf(item);
        if (idx >= 0) migrated[section].splice(idx, 1);
        log("Skipped " + label + " during migration (" + error + ")");
      } else {
        log("Added " + label + " during migration");
      }
    }

    // Migration v1 -> v2: Add first_non_blank_down motion
    if (storedVersion < 2) {
      const baseMotion = (base.motions || []).find(
        (m) => m.id === "first_non_blank_down",
      );
      const insertIdx = (migrated.motions || []).findIndex((m) => m.id === "line_end");
      pushIfValid("motions", baseMotion, "first_non_blank_down", insertIdx);
    }

    // Migration v3 -> v4: Add search/macro/surround/ex/gv commands if missing
    if (storedVersion < 4) {
      [
        "visual_reselect", "macro_record", "macro_play", "macro_repeat",
        "surround_delete", "surround_change", "surround_word", "surround_WORD",
        "visual_surround", "ex_command",
      ].forEach(id => {
        pushIfValid("commands", (base.commands || []).find(c => c.id === id), id);
      });
    }

    // Migration v2 -> v3: Add toggle_case_char command
    if (storedVersion < 3) {
      const baseCommand = (base.commands || []).find(
        (c) => c.id === "toggle_case_char",
      );
      const insertIdx = (migrated.commands || []).findIndex(
        (c) => c.id === "delete_char_back",
      );
      pushIfValid("commands", baseCommand, "toggle_case_char",
        insertIdx >= 0 ? insertIdx + 1 : undefined);
    }

    const migratedError = window.VimConfig.validate(migrated);
    if (migratedError) {
      log("Migration produced invalid config; keeping stored bindings");
      return stored;
    }

    // Save migrated config back to storage
    storageCall(API.storage.local, "set", { motionsConfig: migrated }).catch(e => {
      console.warn("Failed to save migrated config", e);
    });

    return migrated;
  }

  async function loadConfig() {
    const revision = configRevision;
    try {
      const base = await window.loadVimMotionsConfig();
      try {
        const data = await storageCall(API.storage.sync, "get", ["debug", "useDisplayLines"]);
        if (!changedSettings.has('debug')) debug = !!(data && data.debug);
        if (!changedSettings.has('useDisplayLines')) useDisplayLines = !!(data && data.useDisplayLines);
        try { window.__VIM_DEBUG__ = debug; } catch (_) {}
        try { window.__VIM_USE_DISPLAY_LINES__ = useDisplayLines; } catch (_) {}
      } catch (_) {}

      const finishWith = src => {
        if (typeof src === 'undefined') return base;
        const parsed = typeof src === "string" ? JSON.parse(src) : src;
        const error = window.VimConfig.validate(parsed);
        if (error) throw new Error(error);
        // Stale reads must not persist an old migration over newer bindings.
        return revision === configRevision ? migrateConfig(parsed, base) : parsed;
      };

      try {
        const localData = await storageCall(API.storage.local, "get", ["motionsConfig"]);
        if (localData && typeof localData.motionsConfig !== "undefined") {
          return finishWith(localData.motionsConfig);
        }
      } catch (e) {
        throw new Error('Could not load local bindings; fallback cancelled', { cause: e });
      }
      try {
        const syncData = await storageCall(API.storage.sync, "get", ["motionsConfig"]);
        if (syncData && typeof syncData.motionsConfig !== "undefined") {
          return finishWith(syncData.motionsConfig);
        }
      } catch (e) {
        throw new Error('Could not load synced bindings; fallback cancelled', { cause: e });
      }
      return base;
    } catch (e) {
      console.error("Failed to load motions config", e);
      throw e;
    }
  }

  async function init() {
    executor = window.createVimExecutor(modeAPI, settingsAPI);
    // Apply settings instantly when changed from popup/advanced (no tabs permission required)
    try {
      API.storage.onChanged.addListener((changes, area) => {
        if (startupFailed) return;
        // Sync-scoped settings (small, safe to sync)
        if (area === "sync") {
          for (const key of ['debug', 'useDisplayLines', 'theme', 'enabled']) {
            if (changes && changes[key]) changedSettings.add(key);
          }
          if (changes && changes.debug) {
            try {
              debug = !!changes.debug.newValue;
              window.__VIM_DEBUG__ = debug;
            } catch (_) {}
            log("Debug changed via storage", debug);
          }
          if (changes && changes.useDisplayLines) {
            try {
              useDisplayLines = !!changes.useDisplayLines.newValue;
              window.__VIM_USE_DISPLAY_LINES__ = useDisplayLines;
            } catch (_) {}
            log("useDisplayLines changed via storage", useDisplayLines);
          }
          if (changes && changes.theme) {
            try {
              uiTheme = changes.theme.newValue || "vim";
              if (ui) ui.setTheme(uiTheme);
            } catch (_) {}
          }
          if (changes && changes.enabled) {
            try {
              vimEnabled = changes.enabled.newValue == null ? true : !!changes.enabled.newValue;
              if (!vimEnabled) {
                commands.length = 0;
                inputs.length = 0;
                clearInsertMapping();
                prompt = null;
                resetInsertOps();
                tempNormal = false;
                replaceMode = false;
                executor.requestCancel?.();
                executor.cancelPendingChange?.();
                executor.abortMacro?.('Macro cancelled: extension disabled.');
                setMode('normal');
                if (ui) ui.setBufferText('');
                if (!executing) executor.releaseEditor?.();
              }
              if (ui) ui.setEnabled(vimEnabled);
            } catch (_) {}
          }
        }

        // Local motionsConfig always wins; ignore stale sync copies.
        if (changes && changes.motionsConfig) {
          const revision = ++configRevision;
          // Startup reloads its snapshot before constructing the parser.
          if (!parser) return;
          void (async () => {
            try {
              if (area === "sync") {
                const local = await storageCall(API.storage.local, "get", ["motionsConfig"]);
                if (local && typeof local.motionsConfig !== "undefined") return;
              }
              if (revision !== configRevision) return;
              const nv = changes.motionsConfig.newValue;
              if (typeof nv !== "undefined") {
                const newCfg = typeof nv === "string" ? JSON.parse(nv) : nv;
                applyConfig(newCfg);
                log("Applied updated motions config from storage");
              } else {
                const baseCfg = await loadConfig();
                if (revision !== configRevision) return;
                applyConfig(baseCfg);
                log("Reverted to base motions config");
              }
            } catch (e) {
              console.warn("Failed to apply motionsConfig change", e);
            }
          })();
        }
      });
    } catch (_) {}

    let cfg, revision;
    do {
      revision = configRevision;
      cfg = await loadConfig();
    } while (revision !== configRevision);
    parser = new window.VimMotionParser(cfg);
    log("Initialized with config", cfg);
    try {
      const data = await storageCall(API.storage.sync, "get", ["theme", "enabled"]);
      if (!changedSettings.has('theme')) uiTheme = data && data.theme ? data.theme : 'vim';
      if (!changedSettings.has('enabled')) vimEnabled = data?.enabled == null ? true : !!data.enabled;
    } catch (_) {}
    attachKeyListener();
    try {
      ui = new VimUIV2();
      ui.setTheme(uiTheme);
      setMode(mode);
      ui.setEnabled(vimEnabled);
    } catch (_) {}

    // Allow live reload via message
    API.runtime.onMessage.addListener((msg, sender, sendResponse) => {
      if (msg && msg.action === "reloadMotionsConfig") {
        const revision = ++configRevision;
        loadConfig().then((newCfg) => {
          if (revision !== configRevision) {
            sendResponse({ ok: true, superseded: true });
            return;
          }
          applyConfig(newCfg);
          log("Reloaded config");
          sendResponse({ ok: true });
        }).catch(error => sendResponse({ ok: false, error: String(error) }));
        return true;
      } else if (msg && msg.action === "updateSettings" && msg.settings) {
        try {
          if (typeof msg.settings.debug !== "undefined") {
            changedSettings.add('debug');
            debug = !!msg.settings.debug;
            try {
              window.__VIM_DEBUG__ = debug;
            } catch (_) {}
          }
          if (typeof msg.settings.theme !== "undefined") {
            changedSettings.add('theme');
            uiTheme = msg.settings.theme || "vim";
            if (ui) ui.setTheme(uiTheme);
          }
          log("Updated debug setting", debug);
          sendResponse({ ok: true });
        } catch (e) {
          console.warn("Failed to apply settings update", e);
          sendResponse({ ok: false, error: String(e) });
        }
        return true;
      }
      return false;
    });

    // Persist last-exit position when the tab/window is closing
    try {
      window.addEventListener("beforeunload", () => {
        try {
          executor.recordLastExit?.();
        } catch (_) {}
      });
    } catch (_) {}
  }

  // Simple mode manager used by executor
  function setMode(newMode) {
    if (newMode === 'insert' && mode !== 'insert') resetInsertOps();
    mode = newMode;
    try {
      if (parser && typeof parser.setMode === "function")
        parser.setMode(newMode);
    } catch (_) {}
    if (debug) console.log("[VimMode] ->", mode, tempNormal ? "(temp)" : "");
    try {
      if (ui) {
        ui.setTempNormal(!!tempNormal);
        ui.setReplaceMode(!!replaceMode);
        ui.setMode(mode);
        ui.updateCursorStyle();
      }
    } catch (_) {}
  }
  const modeAPI = {
    isEnabled: () => vimEnabled,
    reportWarning: message => { if (ui) ui.setBufferText(message); },
    setMode: (m) => {
      setMode(m);
      if (m === 'insert') executor?.captureInsertStart?.();
    },
    getMode: () => mode,
    isVisual: () => mode === "visual" || mode === "visualLine",
    getReplaceMode: () => replaceMode,
    setReplaceMode: (v) => {
      replaceMode = !!v;
      try {
        if (ui) ui.setReplaceMode(replaceMode);
      } catch (_) {}
    },
  };
  const settingsAPI = {
    getUseDisplayLines: () => useDisplayLines,
  };
  const start = () => init().catch(error => {
    startupFailed = true;
    vimEnabled = false;
    console.error('[Vim] Initialization failed; keyboard interception disabled', error);
    try {
      if (!ui) ui = new VimUIV2();
      ui.showStartupError('Vim could not start. Check your saved bindings, then reload the page to retry.');
    } catch (_) {}
  });
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
})();
