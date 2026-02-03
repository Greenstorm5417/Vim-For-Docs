(() => {
  const IS_BROWSER = typeof browser !== 'undefined';
  const API = IS_BROWSER ? browser : chrome;

  // Menu items for operations with class-based selectors
  const MENU_ITEMS = {
    cut: {
      iconClass: "docs-icon-editors-ia-cut",
      fallbackText: "Cut"
    },
    paste: {
      iconClass: "docs-icon-editors-ia-paste",
      fallbackText: "Paste"
    },
    undo: {
      iconClass: "docs-icon-editors-ia-undo",
      fallbackText: "Undo"
    },
    redo: {
      iconClass: "docs-icon-editors-ia-redo",
      fallbackText: "Redo"
    },
    copy: {
      iconClass: "docs-icon-editors-ia-copy",
      fallbackText: "Copy"
    }
  };

  const KEY_CODES = {
    backspace: 8,
    tab: 9,
    enter: 13,
    space: 32,
    esc: 27,
    pageUp: 33,
    pageDown: 34,
    end: 35,
    home: 36,
    left: 37,
    up: 38,
    right: 39,
    down: 40,
    delete: 46
  };

  function createKeyboardEvent(eventType, keyCode, mods) {
    const event = new KeyboardEvent(eventType, {
      bubbles: true,
      cancelable: true,
      view: window,
      keyCode: keyCode,
      which: keyCode,
      ctrlKey: mods.control || false,
      altKey: mods.alt || false,
      shiftKey: mods.shift || false,
      metaKey: mods.meta || false
    });
    try { Object.defineProperties(event, { keyCode: { value: keyCode }, which: { value: keyCode } }); } catch (e) {}
    return event;
  }

  function findEditorElement() {
    const editorIframe = document.querySelector('.docs-texteventtarget-iframe');
    if (editorIframe && editorIframe.contentDocument) {
      return editorIframe.contentDocument.activeElement || editorIframe.contentDocument.body;
    }
    const iframe = document.getElementsByTagName('iframe')[0];
    if (iframe && iframe.contentDocument) {
      return iframe.contentDocument.activeElement || iframe.contentDocument.body;
    }
    return document.activeElement || document.body;
  }

  function sendKeyEvent(key, mods = { shift: false, control: false, alt: false, meta: false }) {
    const isMac = /Mac|iPod|iPhone|iPad/.test(navigator.platform);
    let keyCode = KEY_CODES[key];
    let finalMods = { ...mods };
    if (finalMods.alt === undefined) finalMods.alt = false;

    if (isMac) {
      if (key === 'home') {
        if (finalMods.control) {
          keyCode = KEY_CODES.up; finalMods.meta = true; finalMods.control = false;
        } else {
          keyCode = KEY_CODES.left; finalMods.meta = true;
        }
      } else if (key === 'end') {
        if (finalMods.control) {
          keyCode = KEY_CODES.down; finalMods.meta = true; finalMods.control = false;
        } else {
          keyCode = KEY_CODES.right; finalMods.meta = true;
        }
      }
    }

    // macOS specific: swap Control and Alt as per legacy behavior
    if (isMac) {
      const tempControl = finalMods.control; finalMods.control = finalMods.alt; finalMods.alt = tempControl;
    }

    try {
      const editorEl = findEditorElement();
      if (!editorEl) return;
      // Dispatch real modifier keydowns so Docs honors combos like Shift+Arrow
      const modKeys = [];
      if (finalMods.control) modKeys.push('Control');
      if (finalMods.alt) modKeys.push('Alt');
      if (finalMods.meta) modKeys.push('Meta');
      if (finalMods.shift) modKeys.push('Shift');
      modKeys.forEach(m => editorEl.dispatchEvent(new KeyboardEvent('keydown', { key: m, code: m, bubbles: true })));

      const keyDownEvent = createKeyboardEvent('keydown', keyCode, finalMods);
      const keyUpEvent = createKeyboardEvent('keyup', keyCode, finalMods);
      editorEl.dispatchEvent(keyDownEvent);
      editorEl.dispatchEvent(keyUpEvent);

      // Release modifiers
      modKeys.slice().reverse().forEach(m => editorEl.dispatchEvent(new KeyboardEvent('keyup', { key: m, code: m, bubbles: true })));
    } catch (e) { console.error('sendKeyEvent error', e); }
  }

  function focusEditor() {
    const editorIframe = document.querySelector('.docs-texteventtarget-iframe');
    const editorWindow = editorIframe?.contentWindow;
    const editorDocument = editorWindow?.document;
    if (editorWindow && editorDocument) {
      if (typeof editorWindow.focus === 'function') editorWindow.focus();
      const editorRoot = editorDocument.querySelector('[contenteditable="true"]') || editorDocument.body;
      editorRoot?.focus();
    }
  }

  function simulateClick(el, x = 0, y = 0) {
    if (!el) {
      console.warn("No element provided to simulateClick");
      return;
    }
    const eventSequence = ["mouseover", "mousedown", "mouseup", "click"];
    for (const eventName of eventSequence) {
      const event = document.createEvent("MouseEvents");
      event.initMouseEvent(
        eventName, true, true, window, 1, x, y, x, y,
        false, false, false, false, 0, null
      );
      el.dispatchEvent(event);
    }
  }

  function findMenuItemElement(item) {
    // Try finding by icon class first (most reliable across languages)
    const iconSelector = `.docs-icon-img.${item.iconClass}`;
    let iconElements = document.querySelectorAll(iconSelector);

    for (const iconEl of iconElements) {
      // Find the parent menuitem element
      let parent = iconEl;
      while (parent && !parent.classList.contains("goog-menuitem")) {
        parent = parent.parentElement;
      }
      if (parent) return parent;
    }

    // Fallback: Try to find by text content in the menuitem label
    let menuItems = document.querySelectorAll('.goog-menuitem');
    for (const menuItem of menuItems) {
      const labelEl = menuItem.querySelector('.goog-menuitem-label');
      if (labelEl && labelEl.textContent.includes(item.fallbackText)) {
        return menuItem;
      }
    }

    // Second fallback: Try to find by aria-label
    for (const menuItem of menuItems) {
      if (menuItem.getAttribute('aria-label') &&
        menuItem.getAttribute('aria-label').includes(item.fallbackText)) {
        return menuItem;
      }
    }

    // If all fails, try opening the Edit menu and searching again
    const editMenus = Array.from(document.querySelectorAll('.menu-button'))
      .filter(button => button.textContent.trim() === 'Edit');

    if (editMenus.length > 0) {
      simulateClick(editMenus[0]);

      // Try again to find by icon class after menu is open
      iconElements = document.querySelectorAll(iconSelector);
      for (const iconEl of iconElements) {
        let parent = iconEl;
        while (parent && !parent.classList.contains("goog-menuitem")) {
          parent = parent.parentElement;
        }

        if (parent) {
          return parent;
        }
      }
    }

    return null;
  }

  function clickMenu(item) {
    const element = findMenuItemElement(item);
    if (element) {
      simulateClick(element);
    } else {
      console.warn(`Menu item with icon class ${item.iconClass} not found`);
      // Try to use keyboard shortcuts as last resort
      if (item === MENU_ITEMS.cut) {
        document.execCommand('cut');
      } else if (item === MENU_ITEMS.copy) {
        document.execCommand('copy');
      } else if (item === MENU_ITEMS.paste) {
        document.execCommand('paste');
      }
    }
  }

  function getIframeSelection() {
    const iframe = document.querySelector('.docs-texteventtarget-iframe');
    if (!iframe) return null;
    try {
      const iframeWindow = iframe.contentWindow;
      const selection = iframeWindow.getSelection();
      if (!selection || selection.rangeCount === 0) return null;
      const range = selection.getRangeAt(0);
      const text = selection.toString();
      return {
        text,
        length: text.length,
        startOffset: range.startOffset,
        endOffset: range.endOffset,
        collapsed: selection.isCollapsed,
        rangeCount: selection.rangeCount,
        selection,
        range
      };
    } catch(e) {
      console.warn('[VimExecutor] selection access error', e);
      return null;
    }
  }

  function getSelectedText() {
    const s = getIframeSelection();
    return s?.text || '';
  }

  function scrollSelectionIntoView(position /* 'top' | 'center' | 'bottom' */) {
    try {
      const desiredOffset = (rect, viewportH) => {
        return position === 'top' ? 20 : (position === 'bottom' ? Math.max(viewportH - rect.height - 20, 0) : Math.max((viewportH - rect.height) / 2, 0));
      };

      const getScrollParent = (el) => {
        let node = el;
        while (node && node !== document.body) {
          const cs = window.getComputedStyle(node);
          const oy = cs && cs.overflowY;
          const isScrollable = oy === 'auto' || oy === 'scroll' || oy === 'overlay';
          if (isScrollable && node.scrollHeight > node.clientHeight) return node;
          node = node.parentElement;
        }
        return null;
      };

      const scrollWithin = (container, targetRect) => {
        const cRect = container.getBoundingClientRect();
        const viewH = container.clientHeight || (window.innerHeight || 0);
        const desiredTop = desiredOffset(targetRect, viewH);
        const visibleTop = targetRect.top - cRect.top;
        const delta = visibleTop - desiredTop;
        container.scrollTo({ top: container.scrollTop + delta, behavior: 'auto' });
      };

      // 1) Prefer top-level caret overlay and scroll its nearest scrollable ancestor
      const caret = document.querySelector('.kix-cursor-caret, .kix-cursor, .kix-selection-overlay');
      if (caret && typeof caret.getBoundingClientRect === 'function') {
        const rect = caret.getBoundingClientRect();
        if (rect && Number.isFinite(rect.top)) {
          const sp = getScrollParent(caret.parentElement || caret);
          if (sp) { scrollWithin(sp, rect); return; }
          // Try known Docs containers as fallback
          const candidates = document.querySelectorAll('.kix-appview-editor, .kix-appview, .kix-zoomdocumentplugin-outer');
          for (const c of candidates) {
            if (c && c.scrollHeight > c.clientHeight) { scrollWithin(c, rect); return; }
          }
          // Last resort: window scroll
          const viewH = window.innerHeight || document.documentElement.clientHeight || 0;
          const desiredTop = desiredOffset(rect, viewH);
          const delta = rect.top - desiredTop;
          window.scrollTo({ top: (window.scrollY || document.documentElement.scrollTop || 0) + delta, behavior: 'auto' });
          return;
        }
      }

      // 2) Fallback to selection inside the event-target iframe
      const iframe = document.querySelector('.docs-texteventtarget-iframe');
      const win = iframe && iframe.contentWindow;
      if (!win) return;
      const sel = win.getSelection();
      if (!sel || sel.rangeCount === 0) return;
      const range = sel.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      const iframeRect = iframe.getBoundingClientRect();
      // Convert iframe-local rect to top-level viewport coordinates
      const topRect = {
        top: rect.top + iframeRect.top,
        height: rect.height
      };
      const scrollContainer = document.querySelector('.kix-appview-editor, .kix-appview, .kix-zoomdocumentplugin-outer');
      if (scrollContainer) {
        const cRect = scrollContainer.getBoundingClientRect();
        const viewH = scrollContainer.clientHeight || (window.innerHeight || 0);
        const desiredTop = desiredOffset(topRect, viewH);
        const visibleTop = topRect.top - cRect.top;
        const delta = visibleTop - desiredTop;
        scrollContainer.scrollTo({ top: scrollContainer.scrollTop + delta, behavior: 'auto' });
        return;
      }
      // Fallback to window scroll
      const viewH = window.innerHeight || document.documentElement.clientHeight || 0;
      const desiredTop = desiredOffset(topRect, viewH);
      const delta = topRect.top - desiredTop;
      window.scrollTo({ top: (window.scrollY || document.documentElement.scrollTop || 0) + delta, behavior: 'auto' });
    } catch (_) {}
  }

  const Adapter = {
    left: (opts={}) => sendKeyEvent('left', opts),
    right: (opts={}) => sendKeyEvent('right', opts),
    up: (opts={}) => sendKeyEvent('up', opts),
    down: (opts={}) => sendKeyEvent('down', opts),
    home: (opts={}) => sendKeyEvent('home', opts),
    end: (opts={}) => sendKeyEvent('end', opts),
    pageUp: (opts={}) => sendKeyEvent('pageUp', opts),
    pageDown: (opts={}) => sendKeyEvent('pageDown', opts),
    delete: (opts={}) => sendKeyEvent('delete', opts),
    backspace: (opts={}) => {
      const isMac = /Mac|iPod|iPhone|iPad/.test(navigator.platform);
      const key = isMac ? 'delete' : 'backspace';
      const code = isMac ? 'delete' : 'backspace';
      if (key === 'delete') sendKeyEvent('delete', opts); else {
        const editorEl = findEditorElement(); if (!editorEl) return;
        const evDown = new KeyboardEvent('keydown', { key: 'Backspace', keyCode: KEY_CODES.backspace, which: KEY_CODES.backspace, bubbles: true, cancelable: true });
        const evUp = new KeyboardEvent('keyup', { key: 'Backspace', keyCode: KEY_CODES.backspace, which: KEY_CODES.backspace, bubbles: true, cancelable: true });
        editorEl.dispatchEvent(evDown); editorEl.dispatchEvent(evUp);
      }
    },
    ctrlLeft: (opts={}) => sendKeyEvent('left', { ...opts, control: true }),
    ctrlRight: (opts={}) => sendKeyEvent('right', { ...opts, control: true }),
    ctrlUp: (opts={}) => sendKeyEvent('up', { ...opts, control: true }),
    ctrlDown: (opts={}) => sendKeyEvent('down', { ...opts, control: true }),
    ctrlHome: (opts={}) => sendKeyEvent('home', { ...opts, control: true }),
    ctrlEnd: (opts={}) => sendKeyEvent('end', { ...opts, control: true })
  };

  // Precise scanner over Docs selection using safe peeks
  class GDocsNavigator {
    constructor() {
      this.MAX_SCAN = 2048;
    }
    getSelAndRange() {
      const iframe = document.querySelector('.docs-texteventtarget-iframe');
      if (!iframe) return { sel: null, range: null };
      try {
        const sel = iframe.contentWindow.getSelection();
        if (!sel || sel.rangeCount === 0) return { sel: null, range: null };
        const range = sel.getRangeAt(0).cloneRange();
        return { sel, range };
      } catch (e) { return { sel: null, range: null }; }
    }
    isWhitespace(ch) { return !ch || /\s/.test(ch); }
    isNewline(ch) { return ch === '\n'; }
    isWordChar(ch) { return /[A-Za-z0-9_]/.test(ch || ''); }

    classify(ch, kind /* 'word' | 'WORD' */) {
      if (this.isWhitespace(ch)) return 'ws';
      if (kind === 'WORD') return 'nonws';
      return this.isWordChar(ch) ? 'word' : 'punct';
    }

    // Peeks return a character without changing the final selection
    peekRightCharN(n) {
      const { sel, range } = this.getSelAndRange();
      if (!sel || !range) return null;
      let prevLen = sel.toString().length || 0;
      let progressed = 0;
      for (let i = 0; i < n; i++) {
        sel.modify('extend', 'forward', 'character');
        const curLen = sel.toString().length || 0;
        if (curLen <= prevLen) break;
        prevLen = curLen; progressed++;
      }
      const s = sel.toString();
      const ch = progressed > 0 ? s.charAt(s.length - 1) : null;
      sel.removeAllRanges(); sel.addRange(range);
      return ch || null;
    }

    peekLeftCharN(n) {
      const { sel, range } = this.getSelAndRange();
      if (!sel || !range) return null;
      let prevLen = sel.toString().length || 0;
      let progressed = 0;
      for (let i = 0; i < n; i++) {
        sel.modify('extend', 'backward', 'character');
        const curLen = sel.toString().length || 0;
        if (curLen <= prevLen) break;
        prevLen = curLen; progressed++;
      }
      const s = sel.toString();
      const ch = progressed > 0 ? s.charAt(0) : null;
      sel.removeAllRanges(); sel.addRange(range);
      return ch || null;
    }

    moveRightBy(n, withShift) {
      if (n <= 0) return;
      const { sel } = this.getSelAndRange();
      if (!sel) return;
      const action = withShift ? 'extend' : 'move';
      for (let i = 0; i < n; i++) {
        sel.modify(action, 'forward', 'character');
      }
    }
    moveLeftBy(n, withShift) {
      if (n <= 0) return;
      const { sel } = this.getSelAndRange();
      if (!sel) return;
      const action = withShift ? 'extend' : 'move';
      for (let i = 0; i < n; i++) {
        sel.modify(action, 'backward', 'character');
      }
    }

    // ---- word/WORD ----
    nextStartDelta(kind) {
      const { sel, range } = this.getSelAndRange();
      if (!sel || !range) return 0;
      sel.removeAllRanges(); sel.addRange(range);
      let n = 0; let prevLen = sel.toString().length || 0;
      // step into first char
      if (typeof sel.modify === 'function') {
        sel.modify('extend', 'forward', 'character');
        let s = sel.toString(); let curLen = s.length || 0;
        if (window.__VIM_DEBUG__) console.log('[VimDebug] nextStartDelta first step: prevLen=', prevLen, 'curLen=', curLen, 'char=', s.charAt(s.length - 1) || '<empty string>');
        if (curLen > prevLen) {
          let ch = s.charAt(s.length - 1);
          const firstT = this.classify(ch, kind);
          // consume non-ws cluster if first is non-ws
          if (firstT !== 'ws') {
            while (this.classify(ch, kind) === firstT) {
              n++;
              prevLen = curLen;
              sel.modify('extend', 'forward', 'character');
              s = sel.toString(); curLen = s.length || 0;
              if (curLen <= prevLen) break;
              ch = s.charAt(s.length - 1);
              if (n > this.MAX_SCAN) break;
            }
          }
          // then consume following whitespace
          let seenNL = false;
          while (this.classify(ch, kind) === 'ws') {
            n++;
            prevLen = curLen;
            sel.modify('extend', 'forward', 'character');
            s = sel.toString(); curLen = s.length || 0;
            if (curLen <= prevLen) break;
            ch = s.charAt(s.length - 1);
            if (this.isNewline(ch)) {
              if (seenNL) { n = Math.max(n - 1, 0); break; }
              seenNL = true;
            }
            if (n > this.MAX_SCAN) break;
          }
          sel.removeAllRanges(); sel.addRange(range);
          return n;
        }
        // didn't advance; restore and fall back
        sel.removeAllRanges(); sel.addRange(range);
      }
      // Fallback: compute from linearized text (Firefox/Docs quirk)
      try {
        const ci = this.caretIndex();
        const text = this.extractDocumentText();
        if (!ci || typeof ci.index !== 'number' || ci.index < 0 || !text) return 0;
        let i = ci.index;
        if (i >= text.length) return 0;
        let local = 0;
        let ch = text[i];
        const firstT = this.classify(ch, kind);
        if (firstT !== 'ws') {
          while (i < text.length && this.classify(text[i], kind) === firstT) {
            local++; i++; if (local > this.MAX_SCAN) break;
          }
        }
        let seenNL = false;
        while (i < text.length && this.classify(text[i], kind) === 'ws') {
          const c = text[i];
          local++; i++;
          if (this.isNewline(c)) { if (seenNL) { local = Math.max(local - 1, 0); break; } seenNL = true; }
          if (local > this.MAX_SCAN) break;
        }
        return local;
      } catch (_) { return 0; }
    }

    nextEndDelta(kind) {
      const { sel, range } = this.getSelAndRange();
      if (!sel || !range) return 0;
      sel.removeAllRanges(); sel.addRange(range);
      let n = 0; let prevLen = sel.toString().length || 0;
      // skip leading whitespace
      if (typeof sel.modify === 'function') {
        sel.modify('extend', 'forward', 'character');
        let s = sel.toString(); let curLen = s.length || 0;
        if (curLen <= prevLen) { sel.removeAllRanges(); sel.addRange(range); return 0; }
        let ch = s.charAt(s.length - 1);
        while (this.classify(ch, kind) === 'ws') {
          n++;
          prevLen = curLen;
          sel.modify('extend', 'forward', 'character');
          s = sel.toString(); curLen = s.length || 0;
          if (curLen <= prevLen) { sel.removeAllRanges(); sel.addRange(range); return Math.max(n - 1, 0); }
          ch = s.charAt(s.length - 1);
          if (n > this.MAX_SCAN) { sel.removeAllRanges(); sel.addRange(range); return Math.max(n - 1, 0); }
        }
        // consume run of same class, landing on last char
        const t = this.classify(ch, kind);
        while (this.classify(ch, kind) === t) {
          n++;
          prevLen = curLen;
          sel.modify('extend', 'forward', 'character');
          s = sel.toString(); curLen = s.length || 0;
          if (curLen <= prevLen) break;
          ch = s.charAt(s.length - 1);
          if (n > this.MAX_SCAN) break;
        }
        sel.removeAllRanges(); sel.addRange(range);
        return n;
      }
      // Fallback string-based computation
      try {
        const ci = this.caretIndex();
        const text = this.extractDocumentText();
        if (!ci || typeof ci.index !== 'number' || ci.index < 0 || !text) return 0;
        let i = ci.index;
        let local = 0;
        const len = text.length;
        if (i >= len) return 0;
        while (i < len && this.classify(text[i], kind) === 'ws') {
          local++; i++; if (i >= len) return Math.max(local - 1, 0);
          if (local > this.MAX_SCAN) return Math.max(local - 1, 0);
        }
        if (i >= len) return Math.max(local - 1, 0);
        const t = this.classify(text[i], kind);
        while (i < len && this.classify(text[i], kind) === t) {
          local++; i++; if (local > this.MAX_SCAN) break;
        }
        return Math.max(local - 1, 0);
      } catch (_) { return 0; }
    }

    // Distance to previous line boundary (newline) without crossing it
    prevLineBoundaryDelta() {
      const { sel, range } = this.getSelAndRange();
      if (!sel || !range) return 0;
      sel.removeAllRanges(); sel.addRange(range);
      let n = 0; let prevLen = sel.toString().length || 0; let guard = 0;
      while (true) {
        sel.modify('extend', 'backward', 'character');
        const s = sel.toString(); const curLen = s.length || 0;
        if (curLen <= prevLen) break;
        const ch = s.charAt(0);
        if (this.isNewline(ch)) break;
        n++;
        prevLen = curLen;
        if (++guard > this.MAX_SCAN) break;
      }
      sel.removeAllRanges(); sel.addRange(range);
      return n;
    }

    // ---- whitespace scan across line boundary (for J) ----
    whitespaceForwardDelta() {
      const { sel, range } = this.getSelAndRange();
      if (!sel || !range) return 0;
      sel.removeAllRanges(); sel.addRange(range);
      let n = 0; let prevLen = sel.toString().length || 0; let guard = 0;
      while (true) {
        sel.modify('extend', 'forward', 'character');
        const s = sel.toString(); const curLen = s.length || 0;
        if (curLen <= prevLen) break;
        prevLen = curLen;
        const ch = s.charAt(s.length - 1);
        if (this.classify(ch, 'word') !== 'ws') break;
        n++;
        if (++guard > this.MAX_SCAN) break;
      }
      sel.removeAllRanges(); sel.addRange(range);
      return n;
    }

    // Delta to first non-blank character to the right (stops at newline)
    firstNonBlankForwardDelta() {
      const { sel, range } = this.getSelAndRange();
      if (!sel || !range) return 0;
      sel.removeAllRanges(); sel.addRange(range);
      let n = 0; let prevLen = sel.toString().length || 0; let guard = 0;
      while (true) {
        sel.modify('extend', 'forward', 'character');
        const s = sel.toString(); const curLen = s.length || 0;
        if (curLen <= prevLen) break;
        const ch = s.charAt(s.length - 1);
        if (!this.isWhitespace(ch)) break;
        if (this.isNewline(ch)) { n = 0; break; }
        n++;
        prevLen = curLen;
        if (++guard > this.MAX_SCAN) break;
      }
      sel.removeAllRanges(); sel.addRange(range);
      return n;
    }

    prevStartDelta(kind) {
      const { sel, range } = this.getSelAndRange();
      if (!sel || !range) return 0;
      sel.removeAllRanges(); sel.addRange(range);
      let n = 0; let prevLen = sel.toString().length || 0;
      // step into first char to the left
      if (typeof sel.modify === 'function') {
        sel.modify('extend', 'backward', 'character');
        let s = sel.toString(); let curLen = s.length || 0;
        if (curLen > prevLen) {
          let ch = s.charAt(0);
          // skip whitespace on the left
          while (this.classify(ch, kind) === 'ws') {
            n++;
            prevLen = curLen;
            sel.modify('extend', 'backward', 'character');
            s = sel.toString(); curLen = s.length || 0;
            if (curLen <= prevLen) { sel.removeAllRanges(); sel.addRange(range); return n; }
            ch = s.charAt(0);
            if (n > this.MAX_SCAN) { sel.removeAllRanges(); sel.addRange(range); return n; }
          }
          // consume run of same class
          const t = this.classify(ch, kind);
          while (this.classify(ch, kind) === t) {
            n++;
            prevLen = curLen;
            sel.modify('extend', 'backward', 'character');
            s = sel.toString(); curLen = s.length || 0;
            if (curLen <= prevLen) break;
            ch = s.charAt(0);
            if (n > this.MAX_SCAN) break;
          }
          sel.removeAllRanges(); sel.addRange(range);
          return n;
        }
        // didn't advance; restore and fall back
        sel.removeAllRanges(); sel.addRange(range);
      }
      // Fallback: string-based scanning to the left
      try {
        const ci = this.caretIndex();
        const text = this.extractDocumentText();
        if (!ci || typeof ci.index !== 'number' || ci.index <= 0 || !text) return 0;
        let i = ci.index - 1;
        let local = 0;
        if (i < 0) return 0;
        while (i >= 0 && this.classify(text[i], kind) === 'ws') {
          local++; i--; if (local > this.MAX_SCAN) return local;
          if (i < 0) return local;
        }
        if (i < 0) return local;
        const t = this.classify(text[i], kind);
        while (i >= 0 && this.classify(text[i], kind) === t) {
          local++; i--; if (local > this.MAX_SCAN) break;
        }
        return local;
      } catch (_) { return 0; }
    }

    prevEndDelta(kind) {
      const { sel, range } = this.getSelAndRange();
      if (!sel || !range) return 0;
      sel.removeAllRanges(); sel.addRange(range);
      let n = 0; let prevLen = sel.toString().length || 0;
      // step into first char to the left
      if (typeof sel.modify === 'function') {
        sel.modify('extend', 'backward', 'character');
        let s = sel.toString(); let curLen = s.length || 0;
        if (curLen > prevLen) {
          let ch = s.charAt(0);
          // skip whitespace on the left
          while (this.classify(ch, kind) === 'ws') {
            n++;
            prevLen = curLen;
            sel.modify('extend', 'backward', 'character');
            s = sel.toString(); curLen = s.length || 0;
            if (curLen <= prevLen) { sel.removeAllRanges(); sel.addRange(range); return Math.max(n - 1, 0); }
            ch = s.charAt(0);
            if (n > this.MAX_SCAN) { sel.removeAllRanges(); sel.addRange(range); return Math.max(n - 1, 0); }
          }
          // consume run of same class, landing just before its start
          const t = this.classify(ch, kind);
          while (this.classify(ch, kind) === t) {
            n++;
            prevLen = curLen;
            sel.modify('extend', 'backward', 'character');
            s = sel.toString(); curLen = s.length || 0;
            if (curLen <= prevLen) break;
            ch = s.charAt(0);
            if (n > this.MAX_SCAN) break;
          }
          sel.removeAllRanges(); sel.addRange(range);
          return Math.max(n - 1, 0);
        }
        // didn't advance; restore and fall back
        sel.removeAllRanges(); sel.addRange(range);
      }
      // Fallback string-based scanning
      try {
        const ci = this.caretIndex();
        const text = this.extractDocumentText();
        if (!ci || typeof ci.index !== 'number' || ci.index <= 0 || !text) return 0;
        let i = ci.index - 1;
        let local = 0;
        while (i >= 0 && this.classify(text[i], kind) === 'ws') {
          local++; i--; if (i < 0) return Math.max(local - 1, 0);
          if (local > this.MAX_SCAN) return Math.max(local - 1, 0);
        }
        if (i < 0) return Math.max(local - 1, 0);
        const t = this.classify(text[i], kind);
        while (i >= 0 && this.classify(text[i], kind) === t) {
          local++; i--; if (local > this.MAX_SCAN) break;
        }
        return Math.max(local - 1, 0);
      } catch (_) { return 0; }
    }

    // ---- find/till ----
    findRightDelta(target, till=false) {
      const { sel, range } = this.getSelAndRange();
      if (!sel || !range) return 0;
      sel.removeAllRanges(); sel.addRange(range);
      let n = 0; let prevLen = sel.toString().length || 0; let guard = 0;
      const CHUNK_CHARS = 32; // scan up to 32 characters per pass
      while (n <= this.MAX_SCAN) {
        const before = prevLen;
        // Advance by several character steps to amortize DOM calls
        for (let i = 0; i < CHUNK_CHARS; i++) { sel.modify('extend', 'forward', 'character'); }
        const s = sel.toString();
        const curLen = s.length || 0;
        if (curLen <= prevLen) { sel.removeAllRanges(); sel.addRange(range); return till ? Math.max(n - 1, 0) : n; }
        const appended = s.slice(prevLen);
        // Look for target in newly appended substring
        const hit = appended.indexOf(target);
        if (hit !== -1) {
          const delta = n + hit + 1;
          sel.removeAllRanges(); sel.addRange(range);
          return till ? Math.max(delta - 1, 0) : delta;
        }
        const advanced = curLen - prevLen;
        n += advanced;
        prevLen = curLen;
        if (++guard > 128) break;
        if (n >= this.MAX_SCAN) break;
      }
      sel.removeAllRanges(); sel.addRange(range);
      return till ? Math.max(n - 1, 0) : n;
    }

    findLeftDelta(target, till=false) {
      const { sel, range } = this.getSelAndRange();
      if (!sel || !range) return 0;
      sel.removeAllRanges(); sel.addRange(range);
      let n = 0; let prevLen = sel.toString().length || 0; let guard = 0;
      const CHUNK_CHARS = 32;
      while (n <= this.MAX_SCAN) {
        const before = prevLen;
        for (let i = 0; i < CHUNK_CHARS; i++) { sel.modify('extend', 'backward', 'character'); }
        const s = sel.toString();
        const curLen = s.length || 0;
        if (curLen <= prevLen) { sel.removeAllRanges(); sel.addRange(range); return till ? Math.max(n - 1, 0) : n; }
        const appendedLen = curLen - prevLen;
        const appended = s.slice(0, appendedLen);
        // We want the closest char to the caret (right side), so search from end of appended
        const hit = appended.lastIndexOf(target);
        if (hit !== -1) {
          const within = appendedLen - hit; // distance inside this chunk
          const delta = n + within;
          sel.removeAllRanges(); sel.addRange(range);
          return till ? Math.max(delta - 1, 0) : delta;
        }
        n += appendedLen;
        prevLen = curLen;
        if (++guard > 128) break;
        if (n >= this.MAX_SCAN) break;
      }
      sel.removeAllRanges(); sel.addRange(range);
      return till ? Math.max(n - 1, 0) : n;
    }

    // ---- pairs ----
    matchPairMove(withShift) {
      const pairs = { '(': ')', '[': ']', '{': '}', '<': '>' };
      const rev = { ')': '(', ']': '[', '}': '{', '>': '<' };
      const right = this.peekRightCharN(1);
      const left = this.peekLeftCharN(1);
      let cur = null; let dir = null; let opener = null; let closer = null; let offsetLeft = 0;
      if (right && pairs[right]) { cur = right; dir = 'right'; opener = right; closer = pairs[right]; }
      else if (left && rev[left]) { cur = left; dir = 'left'; opener = rev[left]; closer = left; offsetLeft = 1; }
      else return false;

      const { sel, range } = this.getSelAndRange();
      if (!sel || !range) return false;

      if (dir === 'right') {
        // scan right with stack using incremental selection
        sel.removeAllRanges(); sel.addRange(range);
        let depth = 0; let n = 0; let prevLen = 0;
        for (let guard = 0; guard < this.MAX_SCAN; guard++) {
          sel.modify('extend', 'forward', 'character');
          const s = sel.toString(); const curLen = s.length || 0;
          if (curLen <= prevLen) break;
          const ch = s.charAt(s.length - 1);
          n++;
          if (ch === opener) depth++;
          else if (ch === closer) {
            depth--;
            if (depth === 0) {
              sel.removeAllRanges(); sel.addRange(range);
              this.moveRightBy(n, withShift);
              return true;
            }
          }
          prevLen = curLen;
        }
        sel.removeAllRanges(); sel.addRange(range);
      } else {
        // scan left with stack using incremental selection
        sel.removeAllRanges(); sel.addRange(range);
        let depth = 0; let n = 0; let prevLen = 0;
        for (let guard = 0; guard < this.MAX_SCAN; guard++) {
          sel.modify('extend', 'backward', 'character');
          const s = sel.toString(); const curLen = s.length || 0;
          if (curLen <= prevLen) break;
          const ch = s.charAt(0);
          n++;
          if (ch === closer) depth++;
          else if (ch === opener) {
            depth--;
            if (depth === 0) {
              sel.removeAllRanges(); sel.addRange(range);
              this.moveLeftBy(n - offsetLeft, withShift);
              return true;
            }
          }
          prevLen = curLen;
        }
        sel.removeAllRanges(); sel.addRange(range);
      }
      return false;
    }

    // Compute absolute caret index from document start using DOM traversal.
    // Based on Google Docs extractor approach - builds offset map and computes position.
    caretIndex() {
      const { sel, range } = this.getSelAndRange();
      if (!sel || !range) return { index: -1, min: 0, max: 0 };
      const iframe = document.querySelector('.docs-texteventtarget-iframe');
      if (!iframe) return { index: -1, min: 0, max: 0 };
      
      // Find editor root - use the page canvas which excludes headers/footers
      const editorDoc = iframe.contentDocument;
      if (!editorDoc) return { index: -1, min: 0, max: 0 };
      
      // The kix-page-paginated contains only the actual document content (no headers/footers)
      // If that fails, try kix-paginateddocumentplugin which wraps the pages
      const editorSelectors = [
        '.kix-page-paginated',
        '.kix-paginateddocumentplugin',
        '.kix-page',
        "[contenteditable='true']"
      ];
      
      let editorRoot = null;
      for (const selector of editorSelectors) {
        editorRoot = editorDoc.querySelector(selector);
        if (editorRoot) break;
      }
      if (!editorRoot) editorRoot = editorDoc.body;
      if (!editorRoot) return { index: -1, min: 0, max: 0 };

      // Build offset map by walking DOM tree
      const nodeStartOffsets = new Map();
      const nodeEndOffsets = new Map();
      const blockLevelTags = new Set(['P', 'DIV', 'LI', 'TABLE', 'TR', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6']);
      let text = '';

      const visit = (node) => {
        const startOffset = text.length;
        nodeStartOffsets.set(node, startOffset);

        if (node.nodeType === Node.TEXT_NODE) {
          text += node.nodeValue || '';
        } else if (node.nodeType === Node.ELEMENT_NODE) {
          if (node.tagName === 'BR') {
            text += '\n';
          } else {
            for (let child = node.firstChild; child; child = child.nextSibling) {
              visit(child);
            }
            if (blockLevelTags.has(node.tagName) && !text.endsWith('\n')) {
              text += '\n';
            }
          }
        }
        nodeEndOffsets.set(node, text.length);
      };

      visit(editorRoot);

      // Compute offset from range
      const computeOffset = (container, offset) => {
        if (!container) return 0;
        const base = nodeStartOffsets.get(container);
        if (base == null) {
          const parent = container.parentNode;
          const index = Array.prototype.indexOf.call(parent?.childNodes || [], container);
          return computeOffset(parent, index < 0 ? 0 : index);
        }
        if (container.nodeType === Node.TEXT_NODE) {
          const textLength = (container.nodeValue || '').length;
          return base + Math.min(offset, textLength);
        }
        let acc = base;
        const children = container.childNodes;
        const limit = Math.min(offset, children.length);
        for (let i = 0; i < limit; i++) {
          const child = children[i];
          const childEnd = nodeEndOffsets.get(child);
          if (childEnd != null) acc = childEnd;
        }
        return acc;
      };

      const caretOffset = range.collapsed 
        ? computeOffset(range.startContainer, range.startOffset)
        : computeOffset(range.endContainer, range.endOffset);

      return { 
        index: caretOffset,
        min: 0,
        max: Math.max(0, text.length - 1)
      };
    }

    // Return editor root inside the event-target iframe
    getEditorRoot() {
      const iframe = document.querySelector('.docs-texteventtarget-iframe');
      if (!iframe) return { root: null, doc: null, win: null };
      const editorDoc = iframe.contentDocument;
      if (!editorDoc) return { root: null, doc: null, win: null };
      const editorSelectors = [
        '.kix-page-paginated',
        '.kix-paginateddocumentplugin',
        '.kix-page',
        "[contenteditable='true']"
      ];
      let editorRoot = null;
      for (const selector of editorSelectors) { editorRoot = editorDoc.querySelector(selector); if (editorRoot) break; }
      if (!editorRoot) editorRoot = editorDoc.body;
      return { root: editorRoot, doc: editorDoc, win: iframe.contentWindow };
    }

    extractDocumentText() {
      const { root } = this.getEditorRoot();
      if (!root) return '';
      const blockLevelTags = new Set(['P', 'DIV', 'LI', 'TABLE', 'TR', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6']);
      let text = '';
      const visit = (node) => {
        if (node.nodeType === Node.TEXT_NODE) {
          text += node.nodeValue || '';
        } else if (node.nodeType === Node.ELEMENT_NODE) {
          if (node.tagName === 'BR') { text += '\n'; }
          else {
            for (let child = node.firstChild; child; child = child.nextSibling) visit(child);
            if (blockLevelTags.has(node.tagName) && !text.endsWith('\n')) { text += '\n'; }
          }
        }
      };
      visit(root);
      return text;
    }
    // Compute a path of child indices from editor root to the selection focus node, with its offset
    getFocusPathAndOffset() {
      const { sel } = this.getSelAndRange();
      const { root, doc } = this.getEditorRoot();
      if (!sel || !root || !doc) return null;
      try {
        const focusNode = sel.focusNode;
        let node = focusNode;
        const path = [];
        // Walk up to root building indices
        while (node && node !== root) {
          const parent = node.parentNode;
          if (!parent) break;
          const idx = Array.prototype.indexOf.call(parent.childNodes || [], node);
          path.push(idx < 0 ? 0 : idx);
          node = parent;
        }
        if (node !== root) return null; // not under recognized root
        path.reverse();
        return { path, offset: sel.focusOffset };
      } catch (_) { return null; }
    }

    // Resolve a node by path from editor root; returns Node or null
    resolvePath(path) {
      const { root } = this.getEditorRoot();
      if (!root || !Array.isArray(path)) return null;
      let node = root;
      for (const idx of path) {
        const children = node.childNodes || [];
        if (idx < 0 || idx >= children.length) return null;
        node = children[idx];
      }
      return node || null;
    }

    // Set collapsed selection using a path + offset (fast jump)
    setSelectionByPath(path, offset) {
      const { sel } = this.getSelAndRange();
      const { doc } = this.getEditorRoot();
      if (!sel || !doc) return false;
      const node = this.resolvePath(path);
      if (!node) return false;
      try {
        const r = doc.createRange();
        const off = Math.max(0, Math.min(offset || 0, (node.nodeType === Node.TEXT_NODE ? (node.nodeValue || '').length : (node.childNodes?.length || 0))));
        r.setStart(node, off);
        r.collapse(true);
        sel.removeAllRanges(); sel.addRange(r);
        return true;
      } catch (_) { return false; }
    }

    // Set caret (or extend selection if withShift) to absolute index using the same DOM traversal mapping.
    // Falls back to no-op if mapping cannot be built.
    setCaretIndex(absIndex, withShift=false) {
      const { sel, range } = this.getSelAndRange();
      if (!sel) return false;
      const iframe = document.querySelector('.docs-texteventtarget-iframe');
      if (!iframe) return false;
      const editorDoc = iframe.contentDocument;
      if (!editorDoc) return false;

      const editorSelectors = [
        '.kix-page-paginated',
        '.kix-paginateddocumentplugin',
        '.kix-page',
        "[contenteditable='true']"
      ];
      let editorRoot = null;
      for (const selector of editorSelectors) { editorRoot = editorDoc.querySelector(selector); if (editorRoot) break; }
      if (!editorRoot) editorRoot = editorDoc.body;
      if (!editorRoot) return false;

      const nodeStartOffsets = new Map();
      const nodeEndOffsets = new Map();
      const blockLevelTags = new Set(['P', 'DIV', 'LI', 'TABLE', 'TR', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6']);
      let text = '';
      const visit = (node) => {
        const startOffset = text.length; nodeStartOffsets.set(node, startOffset);
        if (node.nodeType === Node.TEXT_NODE) {
          text += node.nodeValue || '';
        } else if (node.nodeType === Node.ELEMENT_NODE) {
          if (node.tagName === 'BR') { text += '\n'; }
          else { for (let child = node.firstChild; child; child = child.nextSibling) visit(child);
            if (blockLevelTags.has(node.tagName) && !text.endsWith('\n')) { text += '\n'; }
          }
        }
        nodeEndOffsets.set(node, text.length);
      };
      visit(editorRoot);

      const clamp = (n, lo, hi) => Math.max(lo, Math.min(n, hi));
      const target = clamp(absIndex, 0, Math.max(0, text.length));

      // Locate the deepest node and offset corresponding to target
      const locate = (node, targetAbs) => {
        const start = nodeStartOffsets.get(node) || 0;
        const end = nodeEndOffsets.get(node) || start;
        if (node.nodeType === Node.TEXT_NODE) {
          const len = (node.nodeValue || '').length;
          const off = clamp(targetAbs - start, 0, len);
          return { container: node, offset: off };
        }
        const children = node.childNodes || [];
        // If no children, place by child index on element
        if (!children.length) {
          const off = 0; return { container: node, offset: off };
        }
        // Find child whose range contains targetAbs; otherwise place after last child
        for (let i = 0; i < children.length; i++) {
          const c = children[i]; const cs = nodeStartOffsets.get(c); const ce = nodeEndOffsets.get(c);
          if (cs == null || ce == null) continue;
          if (targetAbs < ce) {
            return locate(c, targetAbs);
          }
        }
        // Place at end of this element if beyond last child mapping
        return { container: node, offset: children.length };
      };

      try {
        const spot = locate(editorRoot, target);
        const newRange = editorDoc.createRange();
        if (withShift) {
          // Extend current selection's anchor to new focus
          sel.removeAllRanges(); sel.addRange(range);
          sel.extend(spot.container, spot.offset);
        } else {
          newRange.setStart(spot.container, spot.offset);
          newRange.collapse(true);
          sel.removeAllRanges(); sel.addRange(newRange);
        }
        return true;
      } catch (_) { return false; }
    }
  }

  function repeat(n, fn) { for (let i = 0; i < (n || 1); i++) fn(i); }

  class MotionExecutor {
    constructor(modeAPI, settingsAPI) {
      this.modeAPI = modeAPI;
      this.settingsAPI = settingsAPI || { getUseDisplayLines: () => false };
      this.nav = new GDocsNavigator();
      this.lastFind = null; // { dir: 'right'|'left', target: 'x', till: boolean }
      this.vlDisp = null; // visual-line displacement counter
      this.registers = { '"': { text: '', type: 'char' } }; // in-memory registers with type
      this._lastSelType = 'char';
      this._lastChange = null; // for '.' repeat
      this.marks = {}; // map from char -> { index }
      this._prevPos = null; // previous jump position for ``
      this._jumpList = [];
      this._jumpIdx = -1;
      this._changeList = [];
      this._changeIdx = -1;
      this._lastExitPos = null; // { index, path, offset }
      this._lastSearch = null; // { pattern, dir: 'forward'|'backward' }
      // Load persisted last-exit position (per-document) if available
      try {
        const key = 'vim_last_exit:' + (location && location.pathname ? location.pathname : '');
        const raw = window.localStorage ? window.localStorage.getItem(key) : null;
        if (raw) {
          const obj = JSON.parse(raw);
          if (obj && typeof obj.index === 'number') this._lastExitPos = obj;
        }
      } catch (_) {}
    }

    exec(result) {
      focusEditor();
      if (!result || !result.kind) return;
      switch (result.kind) {
        case 'motion':
          return this.execMotion(result.motion.id, result.count || 1, this.modeAPI.isVisual(), result.motion.args || {});
        case 'operator_motion':
          return this.execOperatorMotion(result);
        case 'operator_self':
          return this.execOperatorSelf(result);
        case 'operator_textobj':
          return this.execOperatorTextObj(result);
        case 'visual_textobj':
          // Expand selection to the requested text object while in visual modes
          this.selectTextObject(result.textobj);
          return;
        case 'command':
          // Mode gating based on config-provided modes
          const curMode = this.modeAPI.getMode();
          const modes = (result.command && result.command.modes);
          if (modes && !modes.includes(curMode)) return; // ignore if explicitly gated
          return this.execCommand(result.command.id, result);
        default:
          return;
      }
    }

    setLastChange(change) { this._lastChange = change; }
    replayLastChange(overrideCount) {
      const c = this._lastChange;
      if (!c) return false;
      const useCount = (overrideCount && overrideCount > 0) ? overrideCount : (c.count || 1);
      switch (c.type) {
        case 'operator_motion':
          return this.execOperatorMotion({ operator: c.operator, motion: c.motion, count: useCount, register: c.register });
        case 'operator_self':
          return this.execOperatorSelf({ operator: c.operator, count: useCount, register: c.register });
        case 'operator_textobj':
          return this.execOperatorTextObj({ operator: c.operator, textobj: c.textobj, register: c.register });
        case 'command':
          return this.execCommand(c.id, { count: useCount, register: c.register, command: { id: c.id, args: c.args || {}, modes: ['normal'] } });
        default:
          return false;
      }
    }

    _recordJumpBeforeMove() {
      const pf = this.nav.getFocusPathAndOffset();
      const ci = this.nav.caretIndex();
      if (!ci || ci.index < 0) return;
      this._prevPos = { index: ci.index };
      const pos = { index: ci.index, path: pf?.path, offset: pf?.offset };
      const last = this._jumpList[this._jumpList.length - 1];
      if (!last || last.index !== pos.index) this._jumpList.push(pos);
      this._jumpIdx = this._jumpList.length - 1;
    }

    moveToCaretIndex(targetIndex) {
      const ci = this.nav.caretIndex();
      if (!ci || ci.index < 0) return;
      const target = Math.max(ci.min, Math.min(targetIndex, ci.max));
      // Fast path: set selection directly
      const ok = this.nav.setCaretIndex(target, false);
      if (ok) return;
      // Fallback: arrow-walk (rare)
      const delta = target - ci.index;
      if (delta > 0) this.nav.moveRightBy(delta, false);
      else if (delta < 0) this.nav.moveLeftBy(-delta, false);
    }

    jumpToPosition(pos) {
      if (!pos) return;
      if (!(pos.path && this.nav.setSelectionByPath(pos.path, pos.offset))) {
        this.moveToCaretIndex(pos.index);
      }
    }

    pushChangePosition() {
      const pf = this.nav.getFocusPathAndOffset();
      const ci = this.nav.caretIndex();
      if (!ci || ci.index < 0) return;
      const pos = { index: ci.index, path: pf?.path, offset: pf?.offset };
      const last = this._changeList[this._changeList.length - 1];
      if (!last || last.index !== pos.index) {
        this._changeList.push(pos);
        this._changeIdx = this._changeList.length - 1;
      }
    }

    // (helpers are provided by this.nav)

    execMotion(id, count, withShift, args={}) {
      const S = withShift ? { shift: true } : {};
      const nav = this.nav;
      const curMode = this.modeAPI.getMode();
      // In visualLine, ignore motions that are horizontal or charwise-only to avoid breaking linewise selection
      if (curMode === 'visualLine') {
        const disallow = (
          id === 'left' || id === 'right' ||
          id === 'line_start' || id === 'line_end' || id === 'first_non_blank' || id === 'last_non_blank' ||
          id === 'match_pair' ||
          id.startsWith('word_') || id.startsWith('WORD_') ||
          id.startsWith('find_') || id.startsWith('till_') ||
          id === 'repeat_ft' || id === 'repeat_ft_back'
        );
        if (disallow) return;
      }
      switch (id) {
        case 'left':
          if (curMode === 'visualLine') { /* no-op in visual-line */ break; }
          repeat(count, () => Adapter.left(S));
          break;
        case 'right':
          if (curMode === 'visualLine') { /* no-op in visual-line */ break; }
          repeat(count, () => Adapter.right(S));
          break;
        case 'up':
          if (curMode === 'visualLine') { this.visualLineUp(count); break; }
          if (this.settingsAPI.getUseDisplayLines()) {
            repeat(count, () => Adapter.up(S));
          } else {
            Adapter.right(S)
            repeat(count, () => Adapter.ctrlUp(S));
            Adapter.left(S);
          }
          break;
        case 'down':
          if (curMode === 'visualLine') { this.visualLineDown(count); break; }
          if (this.settingsAPI.getUseDisplayLines()) {
            repeat(count, () => Adapter.down(S));
          } else {
            Adapter.right(S)
            repeat(count, () => Adapter.ctrlDown(S));
            Adapter.left(S);
          }
          break;
        case 'display_up':
          if (curMode === 'visualLine') { this.visualLineUp(count); break; }
          repeat(count, () => Adapter.up(S)); break;
        case 'display_down':
          if (curMode === 'visualLine') { this.visualLineDown(count); break; }
          repeat(count, () => Adapter.down(S)); break;
        case 'line_start': Adapter.home(S); break;
        case 'first_non_blank': {
          // Move to start of current visual line (respects wrapping)
          Adapter.home({ shift: withShift });
          // Then skip over whitespace to first non-blank
          const d = nav.firstNonBlankForwardDelta();
          if (d > 0) nav.moveRightBy(d, withShift);
          break; }
        case 'first_non_blank_down': {
          // In Vim, _ with count n moves down n-1 lines then to first non-blank
          if (count > 1) repeat(count - 1, () => Adapter.down(S));
          // Move to start of current visual line (respects wrapping)
          Adapter.home({ shift: withShift });
          // Then skip over whitespace to first non-blank
          const d = nav.firstNonBlankForwardDelta();
          if (d > 0) nav.moveRightBy(d, withShift);
          break; }
        case 'line_end': Adapter.end(S); break;
        case 'last_non_blank': { Adapter.end(S); let d=0; while (true){ const ch=nav.peekLeftCharN(d+1); if (ch==null) break; if (!nav.isWhitespace(ch)) break; d++; if (d>nav.MAX_SCAN) break; } if (d>0) nav.moveLeftBy(d, withShift); break; }
        // All 'word' motions use scanning; 'WORD' motions use non-whitespace scanning
        case 'word_start_fwd': for (let i=0;i<count;i++){ const d=nav.nextStartDelta('word'); if (window.__VIM_DEBUG__) console.log('[VimDebug] word_start_fwd delta=', d); if (d>0) nav.moveRightBy(d, withShift);} break;
        case 'WORD_start_fwd': for (let i=0;i<count;i++){ const d=nav.nextStartDelta('WORD'); if (d>0) nav.moveRightBy(d, withShift);} break;
        case 'word_end_fwd':   for (let i=0;i<count;i++){ const d=nav.nextEndDelta('word'); if (d>0) nav.moveRightBy(d, withShift);} break;
        case 'WORD_end_fwd':   for (let i=0;i<count;i++){ const d=nav.nextEndDelta('WORD'); if (d>0) nav.moveRightBy(d, withShift);} break;
        case 'word_start_back':for (let i=0;i<count;i++){ const d=nav.prevStartDelta('word'); if (d>0) nav.moveLeftBy(d, withShift);} break;
        case 'WORD_start_back':for (let i=0;i<count;i++){ const d=nav.prevStartDelta('WORD'); if (d>0) nav.moveLeftBy(d, withShift);} break;
        case 'word_end_back':  for (let i=0;i<count;i++){ const d=nav.prevEndDelta('word'); if (d>0) nav.moveLeftBy(d, withShift);} break;
        case 'WORD_end_back':  for (let i=0;i<count;i++){ const d=nav.prevEndDelta('WORD'); if (d>0) nav.moveLeftBy(d, withShift);} break;
        case 'first_line': Adapter.ctrlHome(S); break;
        case 'last_line': Adapter.ctrlEnd(S); break;
        case 'screen_top': Adapter.pageUp(S); break;
        case 'screen_middle': scrollSelectionIntoView('center'); break;
        case 'screen_bottom': Adapter.pageDown(S); break;
        case 'scroll_down': Adapter.down({ ...S }); break;
        case 'scroll_up': Adapter.up({ ...S }); break;
        case 'page_up': Adapter.pageUp(S); break;
        case 'page_down': Adapter.pageDown(S); break;
        case 'half_page_down': Adapter.pageDown(S); break;
        case 'half_page_up': Adapter.pageUp(S); break;
        case 'match_pair': nav.matchPairMove(withShift) || this.stub('match_pair'); break;
        case 'find_next': { const ch=args.char; if (!ch) break; this.lastFind = { dir: 'right', target: ch, till: false }; for (let i=0;i<count;i++){ const d = nav.findRightDelta(ch, false); if (d>0) nav.moveRightBy(d, withShift);} break; }
        case 'till_next': { const ch=args.char; if (!ch) break; this.lastFind = { dir: 'right', target: ch, till: true }; for (let i=0;i<count;i++){ const d = nav.findRightDelta(ch, true); if (d>0) nav.moveRightBy(d, withShift);} break; }
        case 'find_prev': { const ch=args.char; if (!ch) break; this.lastFind = { dir: 'left', target: ch, till: false }; for (let i=0;i<count;i++){ const d = nav.findLeftDelta(ch, false); if (d>0) nav.moveLeftBy(d, withShift);} break; }
        case 'till_prev': { const ch=args.char; if (!ch) break; this.lastFind = { dir: 'left', target: ch, till: true }; for (let i=0;i<count;i++){ const d = nav.findLeftDelta(ch, true); if (d>0) nav.moveLeftBy(d, withShift);} break; }
        case 'paragraph_fwd': repeat(count, () => Adapter.ctrlDown(S)); break;
        case 'paragraph_back': repeat(count, () => Adapter.ctrlUp(S)); break;
        case 'scroll_top': scrollSelectionIntoView('top'); break;
        case 'scroll_center': scrollSelectionIntoView('center'); break;
        case 'scroll_bottom': scrollSelectionIntoView('bottom'); break;
        case 'repeat_ft': { const lf=this.lastFind; if (!lf) break; const times=count; if (lf.dir==='right'){ for (let i=0;i<times;i++){ const d=nav.findRightDelta(lf.target, lf.till); if (d>0) nav.moveRightBy(d, withShift);} } else { for (let i=0;i<times;i++){ const d=nav.findLeftDelta(lf.target, lf.till); if (d>0) nav.moveLeftBy(d, withShift);} } break; }
        case 'repeat_ft_back': { const lf=this.lastFind; if (!lf) break; const times=count; if (lf.dir==='right'){ for (let i=0;i<times;i++){ const d=nav.findLeftDelta(lf.target, lf.till); if (d>0) nav.moveLeftBy(d, withShift);} } else { for (let i=0;i<times;i++){ const d=nav.findRightDelta(lf.target, lf.till); if (d>0) nav.moveRightBy(d, withShift);} } break; }
        default: this.stub('motion:' + id); break;
      }
      // Debug: print caret index after motion (with small delay to let Google Docs process key events)
      try {
        if (window.__VIM_DEBUG__) {
          setTimeout(() => {
            const ci = this.nav.caretIndex();
            console.log('[VimDebug] motion', id, 'index=', ci.index, 'min=', ci.min, 'max=', ci.max);
          }, 10);
        }
      } catch (_) {}
    }

    selectByMotion(motion, count) {
      this.execMotion(motion.id, count, true, motion.args || {});
    }

    applyOperator(op, register) {
      focusEditor();
      const selected = getSelectedText();
      const setReg = (name, text, type) => {
        const r = (name && typeof name === 'string') ? name : '"';
        const obj = { text: text || '', type: type || 'char' };
        this.registers[r] = obj;
        this.registers['"'] = obj;
      };
      switch (op) {
        case 'delete':
          if (selected && selected.length) {
            setReg(register, selected, this._lastSelType || 'char');
            this.insertReplacementText('');
          } else {
            Adapter.delete({});
          }
          return;
        case 'yank':
          if (selected && selected.length) setReg(register, selected, this._lastSelType || 'char');
          // keep system clipboard copy as a convenience; internal register always updated
          try { document.execCommand('copy'); } catch (_) {}
          { const { sel } = this.nav.getSelAndRange(); if (sel && sel.collapseToEnd) sel.collapseToEnd(); }
          return;
        case 'change':
          if (selected && selected.length) {
            setReg(register, selected, this._lastSelType || 'char');
            this.insertReplacementText('');
          } else {
            Adapter.delete({});
          }
          this.modeAPI.setMode('insert');
          return;
        case 'indent': {
          // Indent current selection (or current line) once using Tab
          if (!selected || !selected.length) { this.selectWholeLines(1); }
          sendKeyEvent('tab', {});
          return;
        }
        case 'dedent': {
          // Dedent current selection (or current line) once using Shift+Tab
          if (!selected || !selected.length) { this.selectWholeLines(1); }
          sendKeyEvent('tab', { shift: true });
          return;
        }
        case 'reindent': {
          // Reindent selection by replacing leading whitespace of each line with base indent of current line
          if (!selected || !selected.length) { this.selectWholeLines(1); }
          const selText = getSelectedText();
          if (!selText || !selText.length) return;
          const baseIndent = this.computeCurrentLineIndent();
          const out = this.indentBlock(selText, baseIndent || '');
          this.insertReplacementText(out);
          return;
        }
        case 'reflow': {
          if (selected && selected.length) {
            const out = this.reflowString(selected);
            this.insertReplacementText(out);
          }
          return;
        }
        case 'toggle_case': {
          if (selected && selected.length) {
            const out = Array.from(selected).map(ch => {
              const lc = ch.toLowerCase(); const uc = ch.toUpperCase();
              if (ch === lc && ch !== uc) return uc; if (ch === uc && ch !== lc) return lc; return ch;
            }).join('');
            this.insertReplacementText(out);
          }
          return;
        }
        case 'lowercase': {
          if (selected && selected.length) this.insertReplacementText(selected.toLowerCase());
          return;
        }
        case 'uppercase': {
          if (selected && selected.length) this.insertReplacementText(selected.toUpperCase());
          return;
        }
        default:
          return this.stub('operator:' + op);
      }
    }

    execOperatorMotion(result) {
      const { operator, motion, count = 1, opCount } = result;
      const times = opCount || count || 1;
      this._lastSelType = 'char';
      this.selectByMotion(motion, times);
      // Allow Docs time to apply the selection before operating
      setTimeout(() => {
        this.applyOperator(operator, result.register);
      }, 20);
      this.setLastChange({ type: 'operator_motion', operator, motion: { id: motion.id, args: motion.args || {} }, count: times, register: result.register });
    }

    execOperatorSelf(result) {
      const { operator, count = 1 } = result;
      this.selectWholeLines(count);
      this._lastSelType = 'line';
      this.applyOperator(operator, result.register);
      this.setLastChange({ type: 'operator_self', operator, count, register: result.register });
    }

    execOperatorTextObj(result) {
      const { operator, textobj } = result;
      if (!textobj || !textobj.type) { this.stub('operator_textobj'); return; }
      const ok = this.selectTextObject(textobj);
      if (!ok) { this.stub('operator_textobj:' + textobj.type); return; }
      // Mark linewise for paragraph objects
      if (textobj.type === 'paragraph_inner' || textobj.type === 'paragraph_around') this._lastSelType = 'line'; else this._lastSelType = 'char';
      setTimeout(() => {
        this.applyOperator(operator, result.register);
      }, 10);
      this.setLastChange({ type: 'operator_textobj', operator, textobj, register: result.register });
    }

    selectTextObject(textobj) {
      const t = textobj.type;
      const del = textobj.delims || [];
      switch (t) {
        // words
        case 'word': return this.selectWordLike('word', false);
        case 'word_around': return this.selectWordLike('word', true);
        case 'WORD': return this.selectWordLike('WORD', false);
        case 'WORD_around': return this.selectWordLike('WORD', true);
        // parentheses / braces via delims
        case 'paren_inner': {
          const open = del[0] || '('; const close = del[1] || ')';
          return this.selectDelims(open, close, false);
        }
        case 'paren_around': {
          const open = del[0] || '('; const close = del[1] || ')';
          return this.selectDelims(open, close, true);
        }
        // quotes
        case 'quote_inner': return (del[0] ? this.selectQuote(del[0], false) : false);
        case 'quote_around': return (del[0] ? this.selectQuote(del[0], true) : false);
        // paragraphs / sentences
        case 'paragraph_inner': return this.selectParagraph(false);
        case 'paragraph_around': return this.selectParagraph(true);
        case 'sentence_inner': return this.selectSentence(false);
        case 'sentence_around': return this.selectSentence(true);
        // tags
        case 'tag_inner': return this.selectTag(false);
        case 'tag_around': return this.selectTag(true);
        default:
          return false;
      }
    }

    selectWordLike(kind, around) {
      const nav = this.nav;
      // Check if we're already at the start of a word
      const charUnderCursor = nav.peekRightCharN(1);
      const charBefore = nav.peekLeftCharN(1);
      const isAtWordStart = charUnderCursor && nav.classify(charUnderCursor, kind) !== 'ws' &&
                            (!charBefore || nav.classify(charBefore, kind) === 'ws' || 
                             nav.classify(charBefore, kind) !== nav.classify(charUnderCursor, kind));
      
      // Only move left if we're not already at a word start
      if (!isAtWordStart) {
        const leftToStart = nav.prevStartDelta(kind);
        if (leftToStart > 0) nav.moveLeftBy(leftToStart, false);
      }
      
      let rightToEnd = nav.nextEndDelta(kind);
      if (rightToEnd <= 0) return false;
      nav.moveRightBy(rightToEnd, true);
      if (around) {
        let extra = 0; let guard = 0;
        while (true) {
          const ch = nav.peekRightCharN(extra + 1);
          if (ch == null) break;
          if (!nav.isWhitespace(ch)) break;
          extra++;
          if (++guard > nav.MAX_SCAN) break;
        }
        if (extra > 0) nav.moveRightBy(extra, true);
      }
      return true;
    }

    selectDelims(open, close, includeDelims) {
      const leftDist = this.findEnclosingOpenDelta(open, close);
      if (leftDist == null) return false;
      this.nav.moveLeftBy(leftDist, false);
      if (!includeDelims) this.nav.moveRightBy(1, false);
      const rightDist = this.findMatchingCloseFromHere(open, close, includeDelims);
      if (rightDist == null) return false;
      this.nav.moveRightBy(rightDist, true);
      return true;
    }

    selectQuote(q, includeDelim) {
      // left quote
      const { sel, range } = this.nav.getSelAndRange();
      if (!sel || !range) return false;
      sel.removeAllRanges(); sel.addRange(range);
      let left = 0; let prevLen = 0; let foundL = false;
      for (let guard = 0; guard < this.nav.MAX_SCAN; guard++) {
        sel.modify('extend', 'backward', 'character');
        const s = sel.toString(); const curLen = s.length || 0;
        if (curLen <= prevLen) break;
        const ch = s.charAt(0);
        if (ch === q) { foundL = true; break; }
        left++; prevLen = curLen;
      }
      sel.removeAllRanges(); sel.addRange(range);
      if (!foundL) return false;
      this.nav.moveLeftBy(left, false);
      if (!includeDelim) this.nav.moveRightBy(1, false);
      // right quote
      const sr2 = this.nav.getSelAndRange();
      if (!sr2.sel || !sr2.range) return false;
      sr2.sel.removeAllRanges(); sr2.sel.addRange(sr2.range);
      let right = 0; prevLen = 0; let foundR = false;
      for (let guard = 0; guard < this.nav.MAX_SCAN; guard++) {
        sr2.sel.modify('extend', 'forward', 'character');
        const s = sr2.sel.toString(); const curLen = s.length || 0;
        if (curLen <= prevLen) break;
        const ch = s.charAt(s.length - 1);
        if (ch === q) { foundR = true; break; }
        right++; prevLen = curLen;
      }
      sr2.sel.removeAllRanges(); sr2.sel.addRange(sr2.range);
      if (!foundR) return false;
      this.nav.moveRightBy(includeDelim ? (right + 1) : right, true);
      return true;
    }

    selectParagraph(around) {
      // Find blank line boundaries (\n\n) or start/end of document
      const nav = this.nav;
      const { sel, range } = nav.getSelAndRange();
      if (!sel || !range) return false;
      
      // Move to first non-blank of current line as anchor
      const toLineStart = nav.prevLineBoundaryDelta();
      if (toLineStart > 0) {
        for (let i = 0; i < toLineStart; i++) sel.modify('move', 'backward', 'character');
      }
      
      // Scan left to blank line, extending selection backwards
      sel.collapseToStart();
      let prevLen = 0; let prevNL = false;
      for (let guard = 0; guard < nav.MAX_SCAN; guard++) {
        sel.modify('extend', 'backward', 'character');
        const s = sel.toString(); const curLen = s.length || 0;
        if (curLen <= prevLen) break;
        const ch = s.charAt(0);
        if (ch === '\n') {
          if (prevNL) {
            // Hit double newline - back up one and stop
            sel.modify('extend', 'forward', 'character');
            break;
          }
          prevNL = true;
        } else {
          prevNL = false;
        }
        prevLen = curLen;
      }
      
      // Now selection extends from paragraph start to current position
      // Collapse to start (paragraph beginning)
      sel.collapseToStart();
      
      // inner: skip any leading blank lines
      if (!around) {
        prevLen = 0;
        for (let guard = 0; guard < nav.MAX_SCAN; guard++) {
          sel.modify('extend', 'forward', 'character');
          const s = sel.toString(); const curLen = s.length || 0;
          if (curLen <= prevLen) break;
          const ch = s.charAt(s.length - 1);
          if (ch !== '\n') {
            // Hit non-newline, back up and stop
            sel.modify('extend', 'backward', 'character');
            break;
          }
          prevLen = curLen;
        }
        sel.collapseToEnd();
      }
      
      // Scan right to blank line, extending selection forwards
      prevLen = 0; prevNL = false;
      for (let guard = 0; guard < nav.MAX_SCAN; guard++) {
        sel.modify('extend', 'forward', 'character');
        const s = sel.toString(); const curLen = s.length || 0;
        if (curLen <= prevLen) break;
        const ch = s.charAt(s.length - 1);
        if (ch === '\n') {
          if (prevNL) {
            if (!around) {
              // For inner, exclude the blank line
              sel.modify('extend', 'backward', 'character');
            }
            break;
          }
          prevNL = true;
        } else {
          prevNL = false;
        }
        prevLen = curLen;
      }
      
      return true;
    }

    selectSentence(around) {
      const isEnd = (ch) => ch === '.' || ch === '!' || ch === '?';
      const nav = this.nav;
      // Scan left to previous sentence end
      const { sel, range } = nav.getSelAndRange();
      if (!sel || !range) return false;
      sel.removeAllRanges(); sel.addRange(range);
      let left = 0; let prevLen = 0;
      for (let guard = 0; guard < nav.MAX_SCAN; guard++) {
        sel.modify('extend', 'backward', 'character');
        const s = sel.toString(); const curLen = s.length || 0;
        if (curLen <= prevLen) break;
        const ch = s.charAt(0);
        if (isEnd(ch)) break;
        left++; prevLen = curLen;
      }
      sel.removeAllRanges(); sel.addRange(range);
      if (left > 0) nav.moveLeftBy(left, false);
      if (!around && nav.peekLeftCharN(1) && isEnd(nav.peekLeftCharN(1))) nav.moveRightBy(1, false);
      // Scan right to next sentence end
      const sr2 = nav.getSelAndRange();
      if (!sr2.sel || !sr2.range) return false;
      sr2.sel.removeAllRanges(); sr2.sel.addRange(sr2.range);
      let right = 0; prevLen = 0;
      for (let guard = 0; guard < nav.MAX_SCAN; guard++) {
        sr2.sel.modify('extend', 'forward', 'character');
        const s = sr2.sel.toString(); const curLen = s.length || 0;
        if (curLen <= prevLen) break;
        right++; prevLen = curLen;
        const ch = s.charAt(s.length - 1);
        if (isEnd(ch)) break;
      }
      sr2.sel.removeAllRanges(); sr2.sel.addRange(sr2.range);
      if (around) this.nav.moveRightBy(right + 1, true); else this.nav.moveRightBy(right, true);
      return true;
    }

    selectTag(around) {
      const nav = this.nav;
      // Find preceding '<'
      let left = 0; let guard = 0; let foundL = false; let tagName = '';
      while (true) {
        const ch = nav.peekLeftCharN(left + 1);
        if (ch == null) break;
        if (ch === '<') { foundL = true; break; }
        left++;
        if (++guard > nav.MAX_SCAN) break;
      }
      if (!foundL) return false;
      // Get tag name to the right of this '<'
      let i = 0; let name = '';
      while (true) {
        const ch = nav.peekRightCharN(i + 1);
        if (ch == null) break;
        if (/\s|>|\//.test(ch)) break;
        name += ch; i++;
        if (i > nav.MAX_SCAN) break;
      }
      if (!name) return false;
      // Move caret to the '<'
      if (left > 0) nav.moveLeftBy(left, false);
      if (!around) nav.moveRightBy(1, false); // inside '<'
      // Now find matching closing tag
      let depth = 0; let r = 0; guard = 0; const openPat = `<${name}`; const closePat = `</${name}`;
      while (true) {
        const ch = nav.peekRightCharN(r + 1);
        if (ch == null) break;
        r++;
        // naive pattern checks
        const w = this.windowRight(r + 8);
        if (w.startsWith(openPat)) depth++;
        if (w.startsWith(closePat)) {
          if (depth === 0) break; else depth--;
        }
        if (++guard > nav.MAX_SCAN) break;
      }
      this.nav.moveRightBy(around ? r + 1 : r, true);
      return true;
    }

    windowRight(n) {
      // returns last n chars of selection.toString() when extended right by n
      const { sel, range } = this.nav.getSelAndRange();
      if (!sel || !range) return '';
      let prevLen = sel.toString().length || 0;
      for (let i = 0; i < n; i++) sel.modify('extend', 'forward', 'character');
      const s = sel.toString();
      sel.removeAllRanges(); sel.addRange(range);
      return s.slice(-n);
    }

    findEnclosingOpenDelta(open, close) {
      const { sel, range } = this.nav.getSelAndRange();
      if (!sel || !range) return null;
      sel.removeAllRanges(); sel.addRange(range);
      let depth = 0; let i = 0; let prevLen = 0;
      for (let guard = 0; guard < this.nav.MAX_SCAN; guard++) {
        sel.modify('extend', 'backward', 'character');
        const s = sel.toString(); const curLen = s.length || 0;
        if (curLen <= prevLen) break;
        const ch = s.charAt(0);
        i++;
        if (ch === close) depth++;
        else if (ch === open) {
          if (depth === 0) {
            sel.removeAllRanges(); sel.addRange(range);
            return i;
          }
          depth--;
        }
        prevLen = curLen;
      }
      sel.removeAllRanges(); sel.addRange(range);
      return null;
    }

    findMatchingCloseFromHere(open, close, includeDelims) {
      const { sel, range } = this.nav.getSelAndRange();
      if (!sel || !range) return null;
      sel.removeAllRanges(); sel.addRange(range);
      let depth = 0; let i = 0; let prevLen = 0;
      for (let guard = 0; guard < this.nav.MAX_SCAN; guard++) {
        sel.modify('extend', 'forward', 'character');
        const s = sel.toString(); const curLen = s.length || 0;
        if (curLen <= prevLen) break;
        const ch = s.charAt(s.length - 1);
        i++;
        if (ch === open) depth++;
        else if (ch === close) {
          if (depth === 0) {
            sel.removeAllRanges(); sel.addRange(range);
            return includeDelims ? i : (i - 1);
          }
          depth--;
        }
        prevLen = curLen;
      }
      sel.removeAllRanges(); sel.addRange(range);
      return null;
    }

    selectWholeLines(count) {
      Adapter.ctrlUp({});
      Adapter.ctrlDown({ shift: true });
      if (count > 1) {
        repeat(count - 1, () => {
          Adapter.ctrlDown({ shift: true });
        });
      }
      this._lastSelType = 'line';
    }

    _persistLastExit(pos) {
      try {
        const key = 'vim_last_exit:' + (location && location.pathname ? location.pathname : '');
        if (window.localStorage) window.localStorage.setItem(key, JSON.stringify(pos || {}));
      } catch (_) {}
    }

    _recordLastExit() {
      try {
        const pf = this.nav.getFocusPathAndOffset();
        const ci = this.nav.caretIndex();
        if (!ci || ci.index < 0) return;
        const pos = { index: ci.index, path: pf?.path, offset: pf?.offset };
        this._lastExitPos = pos;
        this._persistLastExit(pos);
      } catch (_) {}
    }

    _escapeRegExp(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

    _searchFindAndMove(pattern, dir, times=1, wordBound=false) {
      if (!pattern) return;
      const text = this.nav.extractDocumentText();
      if (!text) return;
      const ci = this.nav.caretIndex();
      if (!ci || ci.index < 0) return;
      // Build matcher
      let matcherType = wordBound ? 'regex' : 'literal';
      let lit = null, re = null;
      if (matcherType === 'literal') {
        lit = pattern;
      } else {
        const pat = `\\b${this._escapeRegExp(pattern)}\\b`;
        re = new RegExp(pat, 'g');
      }
      const stepForward = (startIdx) => {
        if (matcherType === 'literal') return text.indexOf(lit, Math.max(0, startIdx));
        re.lastIndex = Math.max(0, startIdx);
        const m = re.exec(text);
        return m ? m.index : -1;
      };
      const stepBackward = (startIdx) => {
        if (matcherType === 'literal') return text.lastIndexOf(lit, Math.max(0, startIdx));
        // Regex backward: scan all matches up to startIdx and pick the last
        let idx = -1; re.lastIndex = 0; let m;
        while ((m = re.exec(text)) && m.index <= Math.max(0, startIdx)) { idx = m.index; if (re.lastIndex === m.index) re.lastIndex++; }
        return idx;
      };

      // Start positions exclude current caret for forward, include up to caret for backward
      let pos = ci.index;
      const doOne = (direction) => {
        if (direction === 'forward') {
          return stepForward(pos + 1);
        } else {
          return stepBackward(pos - 1);
        }
      };

      let found = -1;
      for (let i = 0; i < Math.max(1, times); i++) {
        const idx = doOne(dir);
        if (idx === -1) { found = -1; break; }
        found = idx; pos = idx;
      }
      if (found !== -1) {
        this._recordJumpBeforeMove();
        this.moveToCaretIndex(found);
        this._lastSearch = { pattern, dir };
      }
    }

    execCommand(id, result) {
      const count = result.count || 1;
      switch (id) {
        // Insert family
        case 'insert_before': this.modeAPI.setMode('insert'); return;
        case 'insert_start_line': Adapter.home({}); this.modeAPI.setMode('insert'); return;
        case 'append_after': Adapter.right({}); this.modeAPI.setMode('insert'); return;
        case 'append_end_line': Adapter.end({}); this.modeAPI.setMode('insert'); return;
        case 'open_below': Adapter.end({}); repeat(count, () => sendKeyEvent('enter', {})); this.modeAPI.setMode('insert'); return;
        case 'open_above': {
          const times = count || 1;
          for (let i = 0; i < times; i++) {
            Adapter.home({});
            sendKeyEvent('enter', {});
            Adapter.up({});
          }
          this.modeAPI.setMode('insert');
          return;
        }
        case 'append_end_word': this.execMotion('word_end_fwd', 1, false); this.modeAPI.setMode('insert'); return;
        case 'insert_register': {
          const name = (result.command && result.command.args && result.command.args.char) || '"';
          const reg = this.registers[name] || this.registers['"'];
          const textVal = typeof reg === 'string' ? reg : (reg?.text || '');
          if (!textVal) return;
          this.insertReplacementText(textVal);
          return;
        }

        // Replace / join / substitute / to EOL
        case 'replace_char': {
          const ch = result.command && result.command.args && result.command.args.char;
          if (!ch) return;
          const times = Math.max(1, result.count || 1);
          repeat(times, () => Adapter.right({ shift: true }));
          this.insertReplacementText(ch.repeat(times));
          this.setLastChange({ type: 'command', id: 'replace_char', count: times, args: { char: ch } });
          return;
        }
        case 'replace_mode': {
          if (this.modeAPI && typeof this.modeAPI.setReplaceMode === 'function') this.modeAPI.setReplaceMode(true);
          this.modeAPI.setMode('insert');
          return;
        }
        case 'join_lines': {
          const times = count || 1;
          for (let i = 0; i < times; i++) this.joinOnce(true);
          this.setLastChange({ type: 'command', id: 'join_lines', count: times });
          return;
        }
        case 'join_lines_no_space': {
          const times = count || 1;
          for (let i = 0; i < times; i++) this.joinOnce(false);
          this.setLastChange({ type: 'command', id: 'join_lines_no_space', count: times });
          return;
        }
        case 'substitute_char': {
          repeat(count, () => Adapter.right({ shift: true }));
          this.insertReplacementText('');
          this.modeAPI.setMode('insert');
          this.setLastChange({ type: 'command', id: 'substitute_char', count });
          return;
        }
        case 'insert_replace_char': {
          // Overwrite next character with provided char; if no char to the right or newline, insert instead.
          const ch = result.command && result.command.args && result.command.args.char;
          if (!ch || typeof ch !== 'string') return;
          const next = this.nav.peekRightCharN(1);
          if (next != null && !this.nav.isNewline(next)) {
            // Delete the next character (under caret), then insert our char. This advances the caret correctly.
            Adapter.delete({});
          }
          this.insertReplacementText(ch);
          // remain in insert mode; replaceMode stays true until ESC handled by content script
          this.setLastChange({ type: 'command', id: 'insert_replace_char', args: { char: ch }, count: 1 });
          return;
        }
        case 'substitute_line': {
          this.selectWholeLines(count);
          this.insertReplacementText('');
          this.modeAPI.setMode('insert');
          this.setLastChange({ type: 'command', id: 'substitute_line', count });
          return;
        }
        case 'change_to_eol': {
          Adapter.end({ shift: true });
          if (count > 1) {
            repeat(count - 1, () => { Adapter.right({ shift: true }); Adapter.end({ shift: true }); });
          }
          this._lastSelType = 'char';
          this.applyOperator('change', result.register);
          this.setLastChange({ type: 'command', id: 'change_to_eol', count });
          return;
        }
        case 'delete_to_eol': {
          Adapter.end({ shift: true });
          if (count > 1) {
            repeat(count - 1, () => { Adapter.right({ shift: true }); Adapter.end({ shift: true }); });
          }
          this._lastSelType = 'char';
          this.applyOperator('delete', result.register);
          this.setLastChange({ type: 'command', id: 'delete_to_eol', count });
          return;
        }
        case 'yank_to_eol':   {
          Adapter.end({ shift: true });
          if (count > 1) {
            repeat(count - 1, () => { Adapter.right({ shift: true }); Adapter.end({ shift: true }); });
          }
          this._lastSelType = 'char';
          this.applyOperator('yank',   result.register);
          return;
        }
        case 'delete_char': this.pushChangePosition(); repeat(count, () => Adapter.delete({})); this.setLastChange({ type: 'command', id: 'delete_char', count }); return;
        case 'delete_char_back': this.pushChangePosition(); repeat(count, () => Adapter.backspace({})); this.setLastChange({ type: 'command', id: 'delete_char_back', count }); return;
        case 'toggle_case_char': {
          this.pushChangePosition();
          this._lastSelType = 'char';
          repeat(count, () => Adapter.right({ shift: true }));
          setTimeout(() => {
            this.applyOperator('toggle_case', result.register);
          }, 20);
          setTimeout(() => Adapter.left({}), 20);
          this.setLastChange({ type: 'command', id: 'toggle_case_char', count });
          return;
        }

        // Paste (uses internal registers; Docs-friendly insertion)
        case 'paste_after': { this.pasteFromRegister(result.register, { before: false, times: count }); this.setLastChange({ type: 'command', id: 'paste_after', count, register: result.register }); return; }
        case 'paste_before': { this.pasteFromRegister(result.register, { before: true, times: count }); this.setLastChange({ type: 'command', id: 'paste_before', count, register: result.register }); return; }
        case 'paste_after_cursor_stay': { this.pasteFromRegister(result.register, { before: false, cursorStay: true, times: count }); this.setLastChange({ type: 'command', id: 'paste_after_cursor_stay', count, register: result.register }); return; }
        case 'paste_before_cursor_stay': { this.pasteFromRegister(result.register, { before: true, cursorStay: true, times: count }); this.setLastChange({ type: 'command', id: 'paste_before_cursor_stay', count, register: result.register }); return; }
        case 'paste_adjust_indent': { this.pasteFromRegister(result.register, { before: false, adjustIndent: true, times: count }); this.setLastChange({ type: 'command', id: 'paste_adjust_indent', count, register: result.register }); return; }

        // Number increment/decrement
        case 'increment': { this.incDecNumber(count); this.setLastChange({ type: 'command', id: 'increment', count }); return; }
        case 'decrement': { this.incDecNumber(-count); this.setLastChange({ type: 'command', id: 'decrement', count }); return; }

        // Undo/redo/repeat
        case 'undo': {
          for (let i = 0; i < count; i++) {
            clickMenu(MENU_ITEMS.undo);
          }
          // Deselect any selected text after undo
          setTimeout(() => {
            Adapter.left({});
            setTimeout(() => Adapter.right({}), 10);
          }, 50);
          return;
        }
        case 'undo_line': {
          clickMenu(MENU_ITEMS.undo);
          setTimeout(() => {
            Adapter.left({});
            setTimeout(() => Adapter.right({}), 10);
          }, 50);
          return;
        }
        case 'redo': {
          for (let i = 0; i < count; i++) {
            clickMenu(MENU_ITEMS.redo);
          }
          // Deselect any selected text after redo
          setTimeout(() => {
            Adapter.left({});
            setTimeout(() => Adapter.right({}), 10);
          }, 50);
          return;
        }
        case 'repeat': {
          const override = result.count || 1;
          this.replayLastChange(override);
          return;
        }

        // Marks and jumps
        case 'set_mark': {
          const ch = result.command && result.command.args && result.command.args.char;
          const ci = this.nav.caretIndex();
          if (!ch || !ci || ci.index < 0) return;
          const pf = this.nav.getFocusPathAndOffset();
          this.marks[ch] = { index: ci.index, path: pf?.path, offset: pf?.offset };
          return;
        }
        case 'jump_mark': {
          const ch = result.command && result.command.args && result.command.args.char;
          const m = ch && this.marks[ch];
          if (!m) return;
          this._recordJumpBeforeMove();
          if (!(m.path && this.nav.setSelectionByPath(m.path, m.offset))) {
            this.moveToCaretIndex(m.index);
          }
          return;
        }
        case 'jump_prev_pos': {
          if (!this._prevPos || this._prevPos.index == null) return;
          const cur = this.nav.caretIndex();
          const dest = this._prevPos.index;
          if (cur && cur.index === dest) return;
          const before = cur && cur.index;
          this._recordJumpBeforeMove(); // update prev to current before move
          this.moveToCaretIndex(dest);
          return;
        }
        case 'jump_older': {
          if (!this._jumpList || this._jumpList.length === 0) return;
          if (this._jumpIdx <= 0) return;
          this._jumpIdx--;
          const dest = this._jumpList[this._jumpIdx];
          this.jumpToPosition(dest);
          return;
        }
        case 'jump_newer': {
          if (!this._jumpList || this._jumpList.length === 0) return;
          if (this._jumpIdx >= this._jumpList.length - 1) return;
          this._jumpIdx++;
          const dest = this._jumpList[this._jumpIdx];
          this.jumpToPosition(dest);
          return;
        }
        case 'change_prev': {
          if (!this._changeList || this._changeList.length === 0) return;
          if (this._changeIdx <= 0) return;
          this._recordJumpBeforeMove();
          this._changeIdx--;
          const dest = this._changeList[this._changeIdx];
          this.jumpToPosition(dest);
          return;
        }
        case 'change_next': {
          if (!this._changeList || this._changeList.length === 0) return;
          if (this._changeIdx >= this._changeList.length - 1) return;
          this._recordJumpBeforeMove();
          this._changeIdx++;
          const dest = this._changeList[this._changeIdx];
          this.jumpToPosition(dest);
          return;
        }
        case 'jump_last_change': {
          if (!this._changeList || this._changeList.length === 0) return;
          this._recordJumpBeforeMove();
          const dest = this._changeList[this._changeList.length - 1];
          this.jumpToPosition(dest);
          return;
        }
        case 'jump_last_edit_pos': {
          if (!this._changeList || this._changeList.length === 0) return;
          this._recordJumpBeforeMove();
          const dest = this._changeList[this._changeList.length - 1];
          this.jumpToPosition(dest);
          return;
        }
        case 'jump_last_exit': {
          // Try in-memory mark first, then restore from storage
          if (!this._lastExitPos) {
            try {
              const key = 'vim_last_exit:' + (location && location.pathname ? location.pathname : '');
              const raw = window.localStorage ? window.localStorage.getItem(key) : null;
              if (raw) this._lastExitPos = JSON.parse(raw);
            } catch (_) {}
          }
          if (!this._lastExitPos || typeof this._lastExitPos.index !== 'number') return;
          this._recordJumpBeforeMove();
          this.jumpToPosition(this._lastExitPos);
          return;
        }

        case 'record_last_exit': { this._recordLastExit(); return; }

        // Search
        case 'search_forward': {
          const last = (this._lastSearch && this._lastSearch.pattern) || '';
          let pattern = '';
          try { pattern = prompt('/ pattern:', last) || ''; } catch (_) { pattern = last || ''; }
          if (!pattern) return;
          this._searchFindAndMove(pattern, 'forward', 1, false);
          return;
        }
        case 'search_backward': {
          const last = (this._lastSearch && this._lastSearch.pattern) || '';
          let pattern = '';
          try { pattern = prompt('? pattern:', last) || ''; } catch (_) { pattern = last || ''; }
          if (!pattern) return;
          this._searchFindAndMove(pattern, 'backward', 1, false);
          return;
        }
        case 'search_next': {
          const times = count || 1;
          const ls = this._lastSearch;
          if (!ls || !ls.pattern) return;
          this._searchFindAndMove(ls.pattern, ls.dir || 'forward', times, false);
          return;
        }
        case 'search_prev': {
          const times = count || 1;
          const ls = this._lastSearch;
          if (!ls || !ls.pattern) return;
          const rev = (ls.dir === 'forward') ? 'backward' : 'forward';
          this._searchFindAndMove(ls.pattern, rev, times, false);
          return;
        }
        case 'search_word_forward': {
          // Determine word under caret and search forward using word boundaries
          const text = this.nav.extractDocumentText();
          const ci = this.nav.caretIndex(); if (!text || !ci || ci.index < 0) return;
          // Expand around caret to find contiguous \w word
          const isWord = (ch) => /[A-Za-z0-9_]/.test(ch || '');
          let L = ci.index - 1, R = ci.index; // consider char to left as part of word if caret is between
          while (L >= 0 && isWord(text[L])) L--;
          while (R < text.length && isWord(text[R])) R++;
          const word = text.slice(L + 1, R);
          if (!word) return;
          this._searchFindAndMove(word, 'forward', 1, true);
          return;
        }
        case 'search_word_backward': {
          const text = this.nav.extractDocumentText();
          const ci = this.nav.caretIndex(); if (!text || !ci || ci.index < 0) return;
          const isWord = (ch) => /[A-Za-z0-9_]/.test(ch || '');
          let L = ci.index - 1, R = ci.index;
          while (L >= 0 && isWord(text[L])) L--;
          while (R < text.length && isWord(text[R])) R++;
          const word = text.slice(L + 1, R);
          if (!word) return;
          this._searchFindAndMove(word, 'backward', 1, true);
          return;
        }

        // Visual modes and actions
        case 'visual_mode': {
          const cm = this.modeAPI.getMode();
          if (cm === 'visual') {
            const { sel } = this.nav.getSelAndRange();
            if (sel && sel.collapseToEnd) sel.collapseToEnd();
            this.modeAPI.setMode('normal');
          } else {
            this.modeAPI.setMode('visual');
          }
          return;
        }
        case 'visual_line_mode': {
          const cm = this.modeAPI.getMode();
          if (cm === 'visualLine') {
            const { sel } = this.nav.getSelAndRange();
            if (sel && sel.collapseToEnd) sel.collapseToEnd();
            this.modeAPI.setMode('normal');
            this.vlDisp = null;
          } else {
            this.modeAPI.setMode('visualLine');
            // Select current line
            Adapter.home({});
            Adapter.end({ shift: true });
            this.vlDisp = 0;
          }
          return;
        }
        case 'visual_other_end': {
          const { sel } = this.nav.getSelAndRange();
          if (sel && sel.rangeCount) {
            try {
              const aN = sel.anchorNode, aO = sel.anchorOffset, fN = sel.focusNode, fO = sel.focusOffset;
              if (aN && fN && typeof sel.setBaseAndExtent === 'function') sel.setBaseAndExtent(fN, fO, aN, aO);
            } catch (_) {}
          }
          return;
        }
        case 'visual_yank':   { this._lastSelType = (this.modeAPI.getMode() === 'visualLine') ? 'line' : 'char'; this.applyOperator('yank',   result.register); this.modeAPI.setMode('normal'); return; }
        case 'visual_delete': { this._lastSelType = (this.modeAPI.getMode() === 'visualLine') ? 'line' : 'char'; this.applyOperator('delete', result.register); this.modeAPI.setMode('normal'); return; }
        case 'visual_change': { this._lastSelType = (this.modeAPI.getMode() === 'visualLine') ? 'line' : 'char'; this.applyOperator('change', result.register); /* applyOperator sets insert */ return; }
        case 'visual_indent': {
          this._lastSelType = (this.modeAPI.getMode() === 'visualLine') ? 'line' : 'char';
          this.applyOperator('indent', result.register);
          this.modeAPI.setMode('normal');
          this.setLastChange({ type: 'command', id: 'visual_indent', count: 1 });
          return;
        }
        case 'visual_dedent': {
          this._lastSelType = (this.modeAPI.getMode() === 'visualLine') ? 'line' : 'char';
          this.applyOperator('dedent', result.register);
          this.modeAPI.setMode('normal');
          this.setLastChange({ type: 'command', id: 'visual_dedent', count: 1 });
          return;
        }
        case 'visual_toggle_case': {
          const currentMode = this.modeAPI.getMode();
          this._lastSelType = (currentMode === 'visualLine') ? 'line' : 'char';
          this.applyOperator('toggle_case', result.register);
          // Stay in visual mode to allow repeated toggling
          this.modeAPI.setMode(currentMode);
          this.setLastChange({ type: 'command', id: 'visual_toggle_case', count: 1 });
          return;
        }
        case 'visual_lowercase': {
          this._lastSelType = (this.modeAPI.getMode() === 'visualLine') ? 'line' : 'char';
          this.applyOperator('lowercase', result.register);
          this.modeAPI.setMode('normal');
          this.setLastChange({ type: 'command', id: 'visual_lowercase', count: 1 });
          return;
        }
        case 'visual_uppercase': {
          this._lastSelType = (this.modeAPI.getMode() === 'visualLine') ? 'line' : 'char';
          this.applyOperator('uppercase', result.register);
          this.modeAPI.setMode('normal');
          this.setLastChange({ type: 'command', id: 'visual_uppercase', count: 1 });
          return;
        }

        // Exit modes
        case 'exit_mode':
        case 'exit_visual':
        case 'exit_visual_ctrl_c':
        case 'exit_insert':
        case 'exit_insert_ctrl_c': {
          const { sel } = this.nav.getSelAndRange();
          if (sel && sel.collapseToEnd) sel.collapseToEnd();
          this.modeAPI.setMode('normal');
          this.vlDisp = null;
          this._recordLastExit();
          return;
        }

        // Searches / marks / jumps / inc-dec (stubs)
        default:
          if (id.startsWith('insert_')) return;
          if (id.startsWith('search_')) return this.stub('search');
          if (id.startsWith('set_mark') || id.startsWith('jump_') || id === 'change_next' || id === 'change_prev') return this.stub('marks_jumps');
          if (id === 'increment' || id === 'decrement') return this.stub('inc_dec');
          // Fallback: treat any 'exit_*' as exit mode
          if (id && id.startsWith && id.startsWith('exit_')) {
            const { sel } = this.nav.getSelAndRange();
            if (sel && sel.collapseToEnd) sel.collapseToEnd();
            this.modeAPI.setMode('normal');
            this.vlDisp = null;
            return;
          }
          return this.stub('command:' + id);
      }
    }

    visualLineDown(count) {
      for (let i = 0; i < count; i++) {
        if (this.vlDisp === 0) {
          Adapter.home({});
          Adapter.down({ shift: true });
          Adapter.end({ shift: true });
        } else {
          Adapter.down({ shift: true });
        }
        this.vlDisp = (this.vlDisp || 0) + 1;
      }
    }

    visualLineUp(count) {
      for (let i = 0; i < count; i++) {
        if (this.vlDisp === 0) {
          Adapter.end({});
          Adapter.up({ shift: true });
          Adapter.home({ shift: true });
        } else {
          Adapter.up({ shift: true });
          if (this.vlDisp === 1) {
            // when returning to original line from below, ensure full line selection
            Adapter.end({ shift: true });
          }
        }
        this.vlDisp = (this.vlDisp || 0) - 1;
      }
    }

    shortcut(mods, keyCode, times=1) {
      const doc = document;
      const editorIframe = document.querySelector('.docs-texteventtarget-iframe');
      const targetDoc = editorIframe?.contentDocument || document;
      repeat(times, () => {
        mods.forEach(m => targetDoc.dispatchEvent(new KeyboardEvent('keydown', { key: m, code: m, bubbles: true })));
        targetDoc.dispatchEvent(new KeyboardEvent('keydown', { key: keyCode, code: keyCode, bubbles: true }));
        targetDoc.dispatchEvent(new KeyboardEvent('keyup', { key: keyCode, code: keyCode, bubbles: true }));
        mods.slice().reverse().forEach(m => targetDoc.dispatchEvent(new KeyboardEvent('keyup', { key: m, code: m, bubbles: true })));
      });
    }

    pasteFromRegister(register, opts={}) {
      const name = (register && typeof register === 'string') ? register : '"';
      const reg = this.registers[name] || this.registers['"'];
      const textVal = typeof reg === 'string' ? reg : (reg?.text || '');
      const kind = (reg && typeof reg === 'object' && reg.type) ? reg.type : 'char';
      if (!textVal) { this.stub('paste_empty_register'); return; }

      const nav = this.nav;
      const before = !!opts.before;
      const cursorStay = !!opts.cursorStay;
      const adjustIndent = !!opts.adjustIndent;
      const times = Math.max(1, opts.times || 1);

      if (kind === 'char') {
        // collapse non-collapsed selection at start/end
        const { sel, range } = nav.getSelAndRange();
        if (sel && range && !sel.isCollapsed) {
          range.collapse(before /* collapse at start for P, end for p */);
          sel.removeAllRanges(); sel.addRange(range);
        }
        if (!before) {
          // 'p' -> insert after cursor: move one right if possible
          nav.moveRightBy(1, false);
        }
        const payload = times > 1 ? textVal.repeat(times) : textVal;
        this.insertReplacementText(payload);
        if (cursorStay) {
          // Move back by text length to restore cursor position
          setTimeout(() => {
            const len = payload.length;
            if (len > 0) nav.moveLeftBy(len, false);
          }, 20);
        }
        return;
      }

      // linewise
      let unit = textVal;
      // normalize to end with a newline
      if (!unit.endsWith('\n')) unit = unit + '\n';
      if (adjustIndent) {
        const baseIndent = this.computeCurrentLineIndent();
        unit = this.indentBlock(unit, baseIndent);
      }
      const repeated = times > 1 ? unit.repeat(times) : unit;
      if (before) {
        // 'P' -> put above: go to start of current line
        const toStart = nav.prevLineBoundaryDelta();
        if (toStart > 0) nav.moveLeftBy(toStart, false);
        this.insertReplacementText(repeated);
      } else {
        // 'p' -> put below: go to end of current line, insert newline+block(s)
        Adapter.end({});
        // ensure a leading newline to paste on next line
        const payload = (repeated.startsWith('\n') ? repeated : ('\n' + repeated));
        this.insertReplacementText(payload);
      }
      if (cursorStay) {
        // For linewise, move up by number of lines pasted
        setTimeout(() => {
          const lines = repeated.split('\n').length - 1;
          if (lines > 0) {
            for (let i = 0; i < lines; i++) Adapter.up({});
          }
        }, 20);
      }
    }

    incDecNumber(delta) {
      const nav = this.nav;
      const { sel, range } = nav.getSelAndRange();
      if (!sel || !range) return;
      // Count consecutive digits around caret
      let leftDigits = 0;
      while (true) {
        const ch = nav.peekLeftCharN(leftDigits + 1);
        if (ch == null || !/\d/.test(ch)) break;
        leftDigits++; if (leftDigits > nav.MAX_SCAN) break;
      }
      let rightDigits = 0;
      while (true) {
        const ch = nav.peekRightCharN(rightDigits + 1);
        if (ch == null || !/\d/.test(ch)) break;
        rightDigits++; if (rightDigits > nav.MAX_SCAN) break;
      }
      if (leftDigits + rightDigits === 0) return; // no number near caret
      // Optional minus immediately before the digit cluster
      const prevCh = nav.peekLeftCharN(leftDigits + 1);
      const hasMinus = (prevCh === '-');
      const moveLeft = leftDigits + (hasMinus ? 1 : 0);
      if (moveLeft > 0) nav.moveLeftBy(moveLeft, false);
      nav.moveRightBy(leftDigits + rightDigits + (hasMinus ? 1 : 0), true);
      const text = getSelectedText();
      if (!text || !/^\-?\d+$/.test(text)) { sel.removeAllRanges(); sel.addRange(range); return; }
      const neg = text.startsWith('-');
      const digits = neg ? text.slice(1) : text;
      const width = digits.length;
      const curVal = parseInt(text, 10);
      if (Number.isNaN(curVal)) { sel.removeAllRanges(); sel.addRange(range); return; }
      const nextVal = curVal + delta;
      const absStr = Math.abs(nextVal).toString().padStart(width, '0');
      const out = (nextVal < 0 ? '-' : '') + absStr;
      this.insertReplacementText(out);
    }

    insertReplacementText(replacement) {
      focusEditor();
      const iframe = document.querySelector('iframe.docs-texteventtarget-iframe');
      const doc = iframe?.contentDocument;
      const target = doc && (doc.querySelector('[contenteditable="true"]') || doc.body);
      if (!target || !doc) { this.stub('paste_target_missing'); return; }
      try {
        target.focus();
        this.pushChangePosition();
        const dt = new DataTransfer();
        dt.setData('text/plain', replacement);
        const ev = new InputEvent('beforeinput', {
          inputType: 'insertReplacementText',
          data: replacement,
          dataTransfer: dt,
          bubbles: true,
          cancelable: true
        });
        target.dispatchEvent(ev);
      } catch (_) {
        try { doc.execCommand('insertText', false, replacement); } catch (e) {}
      }
    }

    stub(name) {
      try {
        if (window.__VIM_DEBUG__) console.warn('[VimExecutor] stub', name);
      } catch (_) {}
    }

    // Expose utilities
    getSelectionInfo() { return getIframeSelection(); }
    getSelectedText() { return getSelectedText(); }

    joinOnce(withSpace) {
      Adapter.end({});
      const d = this.nav.whitespaceForwardDelta();
      if (d <= 0) return;
      this.nav.moveRightBy(d, true);
      this.pushChangePosition();
      document.execCommand('delete');
      if (withSpace) {
        const left = this.nav.peekLeftCharN(1);
        const right = this.nav.peekRightCharN(1);
        if (left && !this.nav.isWhitespace(left) && right && !this.nav.isWhitespace(right)) {
          // Insert 2 spaces after sentence-ending punctuation (.!?)
          const isSentenceEnd = left === '.' || left === '!' || left === '?';
          sendKeyEvent('space', {});
          if (isSentenceEnd) {
            sendKeyEvent('space', {});
          }
        }
      }
    }

    computeCurrentLineIndent() {
      // Returns indentation (spaces/tabs) of current line
      const nav = this.nav;
      const { sel, range } = nav.getSelAndRange();
      if (!sel || !range) return '';
      const origRange = range.cloneRange();
      // Move to start of line
      const toStart = nav.prevLineBoundaryDelta();
      if (toStart > 0) nav.moveLeftBy(toStart, false);
      // Scan for leading whitespace
      let s = '';
      let i = 0; let guard = 0;
      while (true) {
        const ch = nav.peekRightCharN(i + 1);
        if (ch == null) break;
        if (!(ch === ' ' || ch === '\t')) break;
        s += ch; i++;
        if (++guard > nav.MAX_SCAN) break;
      }
      // Restore original position
      sel.removeAllRanges(); sel.addRange(origRange);
      return s;
    }

    reflowString(text) {
      if (!text) return '';
      // Preserve paragraph breaks (>=2 newlines) and collapse intra-paragraph whitespace to single spaces
      const paras = text.split(/\n{2,}/);
      const out = paras.map(p => p.replace(/[\t \r\n]+/g, ' ').trim()).join('\n\n');
      return out;
    }

    indentBlock(text, indent) {
      if (!indent) return text;
      const lines = text.split(/\r?\n/);
      for (let i = 0; i < lines.length; i++) {
        if (!lines[i]) continue;
        const trimmed = lines[i].replace(/^[\t ]+/, '');
        lines[i] = indent + trimmed;
      }
      return lines.join('\n');
    }
  }

  function createExecutor(modeAPI, settingsAPI) { return new MotionExecutor(modeAPI, settingsAPI); }

  window.createVimExecutor = createExecutor;
  
  })();
