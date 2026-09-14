(() => {
  const IS_BROWSER = typeof browser !== "undefined";
  const API = IS_BROWSER ? browser : chrome;

  // Menu items for operations with class-based selectors
  const MENU_ITEMS = {
    cut: {
      iconClass: "docs-icon-editors-ia-cut",
      fallbackText: "Cut",
    },
    paste: {
      iconClass: "docs-icon-editors-ia-paste",
      fallbackText: "Paste",
    },
    undo: {
      iconClass: "docs-icon-editors-ia-undo",
      fallbackText: "Undo",
    },
    redo: {
      iconClass: "docs-icon-editors-ia-redo",
      fallbackText: "Redo",
    },
    copy: {
      iconClass: "docs-icon-editors-ia-copy",
      fallbackText: "Copy",
    },
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
    delete: 46,
    f: 70,
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
      metaKey: mods.meta || false,
    });
    try {
      Object.defineProperties(event, {
        keyCode: { value: keyCode },
        which: { value: keyCode },
      });
    } catch (e) {}
    return event;
  }

  function findEditorElement() {
    const editorIframe = document.querySelector(".docs-texteventtarget-iframe");
    if (editorIframe && editorIframe.contentDocument) {
      return (
        editorIframe.contentDocument.activeElement ||
        editorIframe.contentDocument.body
      );
    }
    return null;
  }

  function sendKeyEvent(
    key,
    mods = { shift: false, control: false, alt: false, meta: false },
  ) {
    const isMac = /Mac|iPod|iPhone|iPad/.test(navigator.platform);
    let keyCode = KEY_CODES[key];
    if (keyCode === undefined && typeof key === "string" && key.length === 1) {
      keyCode = key.toUpperCase().charCodeAt(0);
    }
    let finalMods = { ...mods };
    if (finalMods.alt === undefined) finalMods.alt = false;

    if (isMac) {
      if (key === "home") {
        if (finalMods.control) {
          keyCode = KEY_CODES.up;
          finalMods.meta = true;
          finalMods.control = false;
        } else {
          keyCode = KEY_CODES.left;
          finalMods.meta = true;
        }
      } else if (key === "end") {
        if (finalMods.control) {
          keyCode = KEY_CODES.down;
          finalMods.meta = true;
          finalMods.control = false;
        } else {
          keyCode = KEY_CODES.right;
          finalMods.meta = true;
        }
      }
    }

    // macOS specific: swap Control and Alt as per legacy behavior
    if (isMac) {
      const tempControl = finalMods.control;
      finalMods.control = finalMods.alt;
      finalMods.alt = tempControl;
    }

    try {
      const editorEl = findEditorElement();
      if (!editorEl) throw new Error('Docs editor unavailable; key dispatch cancelled');
      // Dispatch real modifier keydowns so Docs honors combos like Shift+Arrow
      const modKeys = [];
      if (finalMods.control) modKeys.push("Control");
      if (finalMods.alt) modKeys.push("Alt");
      if (finalMods.meta) modKeys.push("Meta");
      if (finalMods.shift) modKeys.push("Shift");
      modKeys.forEach((m) =>
        editorEl.dispatchEvent(
          new KeyboardEvent("keydown", { key: m, code: m, bubbles: true }),
        ),
      );

      const keyDownEvent = createKeyboardEvent("keydown", keyCode, finalMods);
      const keyUpEvent = createKeyboardEvent("keyup", keyCode, finalMods);
      editorEl.dispatchEvent(keyDownEvent);
      editorEl.dispatchEvent(keyUpEvent);

      // Release modifiers
      modKeys
        .slice()
        .reverse()
        .forEach((m) =>
          editorEl.dispatchEvent(
            new KeyboardEvent("keyup", { key: m, code: m, bubbles: true }),
          ),
        );
    } catch (e) {
      throw new Error('Docs key dispatch failed', { cause: e });
    }
  }

  function focusEditor() {
    const editorIframe = document.querySelector(".docs-texteventtarget-iframe");
    const editorWindow = editorIframe?.contentWindow;
    const editorDocument = editorWindow?.document;
    if (editorWindow && editorDocument) {
      if (typeof editorWindow.focus === "function") editorWindow.focus();
      const editorRoot =
        editorDocument.querySelector('[contenteditable="true"]') ||
        editorDocument.body;
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
        eventName,
        true,
        true,
        window,
        1,
        x,
        y,
        x,
        y,
        false,
        false,
        false,
        false,
        0,
        null,
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
    let menuItems = document.querySelectorAll(".goog-menuitem");
    for (const menuItem of menuItems) {
      const labelEl = menuItem.querySelector(".goog-menuitem-label");
      if (labelEl && labelEl.textContent.includes(item.fallbackText)) {
        return menuItem;
      }
    }

    // Second fallback: Try to find by aria-label
    for (const menuItem of menuItems) {
      if (
        menuItem.getAttribute("aria-label") &&
        menuItem.getAttribute("aria-label").includes(item.fallbackText)
      ) {
        return menuItem;
      }
    }

    // If all fails, try opening the Edit menu and searching again
    const editMenus = Array.from(
      document.querySelectorAll(".menu-button"),
    ).filter((button) => button.textContent.trim() === "Edit");

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
        document.execCommand("cut");
      } else if (item === MENU_ITEMS.copy) {
        document.execCommand("copy");
      } else if (item === MENU_ITEMS.paste) {
        document.execCommand("paste");
      }
    }
  }

  function getIframeSelection() {
    const iframe = document.querySelector(".docs-texteventtarget-iframe");
    if (!iframe) return null;
    try {
      const iframeWindow = iframe.contentWindow;
      const selection = iframeWindow.getSelection();
      if (!selection || selection.rangeCount === 0) return null;
      const range = selection.getRangeAt(0);
      let text = selection.toString();
      // Browsers can omit literal trailing newlines from rendered selection
      // text. Preserve them when the DOM range differs only by that suffix;
      // keep rendered separators for selections spanning formatted blocks.
      const literal = range.toString();
      if (literal.startsWith(text) && /^\n+$/.test(literal.slice(text.length))) text = literal;
      return {
        text,
        length: text.length,
        startOffset: range.startOffset,
        endOffset: range.endOffset,
        collapsed: selection.isCollapsed,
        rangeCount: selection.rangeCount,
        selection,
        range,
      };
    } catch (e) {
      console.warn("[VimExecutor] selection access error", e);
      return null;
    }
  }

  function getSelectedText() {
    const s = getIframeSelection();
    return s?.text || "";
  }

  function scrollSelectionIntoView(position /* 'top' | 'center' | 'bottom' */) {
    try {
      const desiredOffset = (rect, viewportH) => {
        return position === "top"
          ? 20
          : position === "bottom"
            ? Math.max(viewportH - rect.height - 20, 0)
            : Math.max((viewportH - rect.height) / 2, 0);
      };

      const getScrollParent = (el) => {
        let node = el;
        while (node && node !== document.body) {
          const cs = window.getComputedStyle(node);
          const oy = cs && cs.overflowY;
          const isScrollable =
            oy === "auto" || oy === "scroll" || oy === "overlay";
          if (isScrollable && node.scrollHeight > node.clientHeight)
            return node;
          node = node.parentElement;
        }
        return null;
      };

      const scrollWithin = (container, targetRect) => {
        const cRect = container.getBoundingClientRect();
        const viewH = container.clientHeight || window.innerHeight || 0;
        const desiredTop = desiredOffset(targetRect, viewH);
        const visibleTop = targetRect.top - cRect.top;
        const delta = visibleTop - desiredTop;
        container.scrollTo({
          top: container.scrollTop + delta,
          behavior: "auto",
        });
      };

      // 1) Prefer top-level caret overlay and scroll its nearest scrollable ancestor
      const caret = document.querySelector(
        ".kix-cursor-caret, .kix-cursor, .kix-selection-overlay",
      );
      if (caret && typeof caret.getBoundingClientRect === "function") {
        const rect = caret.getBoundingClientRect();
        if (rect && Number.isFinite(rect.top)) {
          const sp = getScrollParent(caret.parentElement || caret);
          if (sp) {
            scrollWithin(sp, rect);
            return;
          }
          // Try known Docs containers as fallback
          const candidates = document.querySelectorAll(
            ".kix-appview-editor, .kix-appview, .kix-zoomdocumentplugin-outer",
          );
          for (const c of candidates) {
            if (c && c.scrollHeight > c.clientHeight) {
              scrollWithin(c, rect);
              return;
            }
          }
          // Last resort: window scroll
          const viewH =
            window.innerHeight || document.documentElement.clientHeight || 0;
          const desiredTop = desiredOffset(rect, viewH);
          const delta = rect.top - desiredTop;
          window.scrollTo({
            top:
              (window.scrollY || document.documentElement.scrollTop || 0) +
              delta,
            behavior: "auto",
          });
          return;
        }
      }

      // 2) Fallback to selection inside the event-target iframe
      const iframe = document.querySelector(".docs-texteventtarget-iframe");
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
        height: rect.height,
      };
      const scrollContainer = document.querySelector(
        ".kix-appview-editor, .kix-appview, .kix-zoomdocumentplugin-outer",
      );
      if (scrollContainer) {
        const cRect = scrollContainer.getBoundingClientRect();
        const viewH = scrollContainer.clientHeight || window.innerHeight || 0;
        const desiredTop = desiredOffset(topRect, viewH);
        const visibleTop = topRect.top - cRect.top;
        const delta = visibleTop - desiredTop;
        scrollContainer.scrollTo({
          top: scrollContainer.scrollTop + delta,
          behavior: "auto",
        });
        return;
      }
      // Fallback to window scroll
      const viewH =
        window.innerHeight || document.documentElement.clientHeight || 0;
      const desiredTop = desiredOffset(topRect, viewH);
      const delta = topRect.top - desiredTop;
      window.scrollTo({
        top:
          (window.scrollY || document.documentElement.scrollTop || 0) + delta,
        behavior: "auto",
      });
    } catch (_) {}
  }

  const Adapter = {
    left: (opts = {}) => sendKeyEvent("left", opts),
    right: (opts = {}) => sendKeyEvent("right", opts),
    up: (opts = {}) => sendKeyEvent("up", opts),
    down: (opts = {}) => sendKeyEvent("down", opts),
    home: (opts = {}) => sendKeyEvent("home", opts),
    end: (opts = {}) => sendKeyEvent("end", opts),
    pageUp: (opts = {}) => sendKeyEvent("pageUp", opts),
    pageDown: (opts = {}) => sendKeyEvent("pageDown", opts),
    delete: (opts = {}) => sendKeyEvent("delete", opts),
    backspace: (opts = {}) => {
      const editorEl = findEditorElement();
      if (!editorEl) throw new Error('Docs editor unavailable; backspace cancelled');
      for (const type of ['keydown', 'keyup']) {
        editorEl.dispatchEvent(new KeyboardEvent(type, {
          key: "Backspace",
          code: "Backspace",
          keyCode: KEY_CODES.backspace,
          which: KEY_CODES.backspace,
          bubbles: true,
          cancelable: true,
          shiftKey: !!opts.shift,
          ctrlKey: !!opts.control,
          altKey: !!opts.alt,
          metaKey: !!opts.meta,
        }));
      }
    },
    ctrlLeft: (opts = {}) => sendKeyEvent("left", { ...opts, control: true }),
    ctrlRight: (opts = {}) => sendKeyEvent("right", { ...opts, control: true }),
    ctrlUp: (opts = {}) => sendKeyEvent("up", { ...opts, control: true }),
    ctrlDown: (opts = {}) => sendKeyEvent("down", { ...opts, control: true }),
    ctrlHome: (opts = {}) => sendKeyEvent("home", { ...opts, control: true }),
    ctrlEnd: (opts = {}) => sendKeyEvent("end", { ...opts, control: true }),
  };

  // Precise scanner over Docs selection using safe peeks
  class GDocsNavigator {
    constructor() {
      this.MAX_SCAN = 2048;
    }
    getSelAndRange() {
      const iframe = document.querySelector(".docs-texteventtarget-iframe");
      if (!iframe) return { sel: null, range: null };
      try {
        const sel = iframe.contentWindow.getSelection();
        if (!sel || sel.rangeCount === 0) return { sel: null, range: null };
        const range = sel.getRangeAt(0).cloneRange();
        return { sel, range };
      } catch (e) {
        return { sel: null, range: null };
      }
    }
    isWhitespace(ch) {
      return !ch || /\s/.test(ch);
    }
    isNewline(ch) {
      return ch === "\n";
    }
    isWordChar(ch) {
      return /^[\p{L}\p{N}\p{M}_]+$/u.test(ch || "");
    }

    characterSegments(text) {
      this._segmenter ||= new Intl.Segmenter(undefined, { granularity: 'grapheme' });
      return this._segmenter.segment(text);
    }

    countCharacters(text) {
      let count = 0;
      for (const segment of this.characterSegments(text)) count++;
      return count;
    }

    fallbackCharacterWindow(direction) {
      const caret = this.caretIndex();
      const raw = this.extractDocumentText();
      if (!Number.isInteger(caret?.index) || caret.index < 0 || caret.index > raw.length) return null;
      const segments = this.characterSegments(raw), text = [];
      let offset = caret.index;
      for (let n = 0; n < this.MAX_SCAN + 2; n++) {
        const part = segments.containing(direction > 0 ? offset : offset - 1);
        if (!part) break;
        if ((direction > 0 ? part.index : part.index + part.segment.length) !== offset) return null;
        text.push(part.segment);
        offset = direction > 0 ? part.index + part.segment.length : part.index;
      }
      return direction > 0 ? { text, index: 0 } : { text: text.reverse(), index: text.length };
    }

    classify(ch, kind /* 'word' | 'WORD' */) {
      if (this.isWhitespace(ch)) return "ws";
      if (kind === "WORD") return "nonws";
      return this.isWordChar(ch) ? "word" : "punct";
    }

    // Peek from the focus, preserving both endpoints and selection direction.
    // Browser character movement also keeps grapheme clusters intact.
    peekRightCharN(n) {
      return this.peekCharN(n, 'forward');
    }

    peekLeftCharN(n) {
      return this.peekCharN(n, 'backward');
    }

    peekCharN(n, direction) {
      const { sel } = this.getSelAndRange();
      if (!sel || !sel.focusNode || typeof sel.modify !== 'function' ||
          !Number.isInteger(n) || n < 1 || n > this.MAX_SCAN) return null;
      const anchor = sel.anchorNode, anchorOffset = sel.anchorOffset;
      const focus = sel.focusNode, focusOffset = sel.focusOffset;
      try {
        sel.collapse(focus, focusOffset);
        for (let i = 1; i <= n; i++) {
          const node = sel.focusNode, offset = sel.focusOffset;
          sel.modify(i === n ? 'extend' : 'move', direction, 'character');
          if (sel.focusNode === node && sel.focusOffset === offset) return null;
        }
        return sel.toString() || null;
      } finally {
        sel.collapse(anchor, anchorOffset);
        sel.extend(focus, focusOffset);
      }
    }

    moveRightBy(n, withShift) {
      if (n <= 0) return;
      const { sel } = this.getSelAndRange();
      if (!sel) return;
      const action = withShift ? "extend" : "move";
      for (let i = 0; i < n; i++) {
        sel.modify(action, "forward", "character");
      }
    }
    moveLeftBy(n, withShift) {
      if (n <= 0) return;
      const { sel } = this.getSelAndRange();
      if (!sel) return;
      const action = withShift ? "extend" : "move";
      for (let i = 0; i < n; i++) {
        sel.modify(action, "backward", "character");
      }
    }

    // Distance scans inspect the focus, not the ordered Range endpoints.
    // Keep the original anchor/direction even when scanning throws or fails.
    scanFromFocus(scan) {
      const { sel } = this.getSelAndRange();
      if (!sel || !sel.focusNode || typeof sel.extend !== 'function') return 0;
      const anchor = sel.anchorNode, anchorOffset = sel.anchorOffset;
      const focus = sel.focusNode, focusOffset = sel.focusOffset;
      try {
        sel.collapse(focus, focusOffset);
        return scan();
      } finally {
        sel.collapse(anchor, anchorOffset);
        sel.extend(focus, focusOffset);
      }
    }

    // ---- word/WORD ----
    nextStartDelta(kind) {
      return this.scanFromFocus(() => {
        const { sel, range } = this.getSelAndRange();
        if (!sel || !range) return 0;
        sel.removeAllRanges();
        sel.addRange(range);
        let n = 0;
        let prevLen = sel.toString().length || 0;
        // step into first char
        if (typeof sel.modify === "function") {
          sel.modify("extend", "forward", "character");
          let s = sel.toString();
          let curLen = s.length || 0;
          if (window.__VIM_DEBUG__)
            console.log(
              "[VimDebug] nextStartDelta first step: prevLen=",
              prevLen,
              "curLen=",
              curLen,
              "char=",
              s.slice(prevLen) || "<empty string>",
            );
          if (curLen > prevLen) {
            let ch = s.slice(prevLen);
            const firstT = this.classify(ch, kind);
            // consume non-ws cluster if first is non-ws
            if (firstT !== "ws") {
              while (this.classify(ch, kind) === firstT) {
                n++;
                prevLen = curLen;
                sel.modify("extend", "forward", "character");
                s = sel.toString();
                curLen = s.length || 0;
                if (curLen <= prevLen) break;
                ch = s.slice(prevLen);
                if (n > this.MAX_SCAN) break;
              }
            }
            // then consume following whitespace
            let seenNL = false;
            while (this.classify(ch, kind) === "ws") {
              if (seenNL && this.isNewline(ch)) break;
              seenNL = this.isNewline(ch);
              n++;
              prevLen = curLen;
              sel.modify("extend", "forward", "character");
              s = sel.toString();
              curLen = s.length || 0;
              if (curLen <= prevLen) break;
              ch = s.slice(prevLen);
              if (n > this.MAX_SCAN) break;
            }
            sel.removeAllRanges();
            sel.addRange(range);
            return n;
          }
          // didn't advance; restore and fall back
          sel.removeAllRanges();
          sel.addRange(range);
        }
        // Fallback: compute from linearized text (Firefox/Docs quirk)
        try {
          const ci = this.fallbackCharacterWindow(1);
          const text = ci?.text;
          if (!ci || typeof ci.index !== "number" || ci.index < 0 || !text)
            return 0;
          let i = ci.index;
          if (i >= text.length) return 0;
          let local = 0;
          let ch = text[i];
          const firstT = this.classify(ch, kind);
          if (firstT !== "ws") {
            while (i < text.length && this.classify(text[i], kind) === firstT) {
              local++;
              i++;
              if (local > this.MAX_SCAN) break;
            }
          }
          let seenNL = false;
          while (i < text.length && this.classify(text[i], kind) === "ws") {
            const c = text[i];
            if (seenNL && this.isNewline(c)) break;
            seenNL = this.isNewline(c);
            local++;
            i++;
            if (local > this.MAX_SCAN) break;
          }
          return local;
        } catch (_) {
          return 0;
        }
      });
    }

    nextEndDelta(kind) {
      return this.scanFromFocus(() => {
        const { sel, range } = this.getSelAndRange();
        if (!sel || !range) return 0;
        sel.removeAllRanges();
        sel.addRange(range);
        let n = 0;
        let prevLen = sel.toString().length || 0;
        // skip leading whitespace
        if (typeof sel.modify === "function") {
          sel.modify("extend", "forward", "character");
          let s = sel.toString();
          let curLen = s.length || 0;
          if (curLen <= prevLen) {
            sel.removeAllRanges();
            sel.addRange(range);
            return 0;
          }
          let ch = s.slice(prevLen);
          while (this.classify(ch, kind) === "ws") {
            n++;
            prevLen = curLen;
            sel.modify("extend", "forward", "character");
            s = sel.toString();
            curLen = s.length || 0;
            if (curLen <= prevLen) {
              sel.removeAllRanges();
              sel.addRange(range);
              return Math.max(n - 1, 0);
            }
            ch = s.slice(prevLen);
            if (n > this.MAX_SCAN) {
              sel.removeAllRanges();
              sel.addRange(range);
              return Math.max(n - 1, 0);
            }
          }
          // consume run of same class, landing on last char
          const t = this.classify(ch, kind);
          while (this.classify(ch, kind) === t) {
            n++;
            prevLen = curLen;
            sel.modify("extend", "forward", "character");
            s = sel.toString();
            curLen = s.length || 0;
            if (curLen <= prevLen) break;
            ch = s.slice(prevLen);
            if (n > this.MAX_SCAN) break;
          }
          sel.removeAllRanges();
          sel.addRange(range);
          return n;
        }
        // Fallback string-based computation
        try {
          const ci = this.fallbackCharacterWindow(1);
          const text = ci?.text;
          if (!ci || typeof ci.index !== "number" || ci.index < 0 || !text)
            return 0;
          let i = ci.index;
          let local = 0;
          const len = text.length;
          if (i >= len) return 0;
          while (i < len && this.classify(text[i], kind) === "ws") {
            local++;
            i++;
            if (i >= len) return Math.max(local - 1, 0);
            if (local > this.MAX_SCAN) return Math.max(local - 1, 0);
          }
          if (i >= len) return Math.max(local - 1, 0);
          const t = this.classify(text[i], kind);
          while (i < len && this.classify(text[i], kind) === t) {
            local++;
            i++;
            if (local > this.MAX_SCAN) break;
          }
          return local;
        } catch (_) {
          return 0;
        }
      });
    }

    // Distance to previous line boundary (newline) without crossing it
    prevLineBoundaryDelta() {
      return this.scanFromFocus(() => {
        const { sel, range } = this.getSelAndRange();
        if (!sel || !range) return 0;
        sel.removeAllRanges();
        sel.addRange(range);
        let n = 0;
        let prevLen = sel.toString().length || 0;
        let guard = 0;
        while (true) {
          sel.modify("extend", "backward", "character");
          const s = sel.toString();
          const curLen = s.length || 0;
          if (curLen <= prevLen) break;
          const ch = s.slice(0, curLen - prevLen);
          if (this.isNewline(ch)) break;
          n++;
          prevLen = curLen;
          if (++guard > this.MAX_SCAN) break;
        }
        sel.removeAllRanges();
        sel.addRange(range);
        return n;
      });
    }

    // ---- whitespace scan across line boundary (for J) ----
    whitespaceForwardDelta() {
      return this.scanFromFocus(() => {
        const { sel, range } = this.getSelAndRange();
        if (!sel || !range) return 0;
        sel.removeAllRanges();
        sel.addRange(range);
        let n = 0;
        let prevLen = sel.toString().length || 0;
        let guard = 0;
        while (true) {
          sel.modify("extend", "forward", "character");
          const s = sel.toString();
          const curLen = s.length || 0;
          if (curLen <= prevLen) break;
          const ch = s.slice(prevLen);
          if (this.classify(ch, "word") !== "ws") break;
          prevLen = curLen;
          n++;
          if (++guard > this.MAX_SCAN) break;
        }
        sel.removeAllRanges();
        sel.addRange(range);
        return n;
      });
    }

    // Delta to first non-blank character to the right (stops at newline)
    firstNonBlankForwardDelta() {
      return this.scanFromFocus(() => {
        const { sel, range } = this.getSelAndRange();
        if (!sel || !range) return 0;
        sel.removeAllRanges();
        sel.addRange(range);
        let n = 0;
        let prevLen = sel.toString().length || 0;
        let guard = 0;
        while (true) {
          sel.modify("extend", "forward", "character");
          const s = sel.toString();
          const curLen = s.length || 0;
          if (curLen <= prevLen) break;
          const ch = s.slice(prevLen);
          if (!this.isWhitespace(ch)) break;
          if (this.isNewline(ch)) {
            n = 0;
            break;
          }
          n++;
          prevLen = curLen;
          if (++guard > this.MAX_SCAN) break;
        }
        sel.removeAllRanges();
        sel.addRange(range);
        return n;
      });
    }

    prevStartDelta(kind) {
      return this.scanFromFocus(() => {
        const { sel, range } = this.getSelAndRange();
        if (!sel || !range) return 0;
        sel.removeAllRanges();
        sel.addRange(range);
        let n = 0;
        let prevLen = sel.toString().length || 0;
        // step into first char to the left
        if (typeof sel.modify === "function") {
          sel.modify("extend", "backward", "character");
          let s = sel.toString();
          let curLen = s.length || 0;
          if (curLen > prevLen) {
            let ch = s.slice(0, curLen - prevLen);
            // skip whitespace on the left
            let seenNL = false;
            while (this.classify(ch, kind) === "ws") {
              if (seenNL && this.isNewline(ch)) {
                sel.removeAllRanges();
                sel.addRange(range);
                return n;
              }
              seenNL = this.isNewline(ch);
              n++;
              prevLen = curLen;
              sel.modify("extend", "backward", "character");
              s = sel.toString();
              curLen = s.length || 0;
              if (curLen <= prevLen) {
                sel.removeAllRanges();
                sel.addRange(range);
                return n;
              }
              ch = s.slice(0, curLen - prevLen);
              if (n > this.MAX_SCAN) {
                sel.removeAllRanges();
                sel.addRange(range);
                return n;
              }
            }
            // consume run of same class
            const t = this.classify(ch, kind);
            while (this.classify(ch, kind) === t) {
              n++;
              prevLen = curLen;
              sel.modify("extend", "backward", "character");
              s = sel.toString();
              curLen = s.length || 0;
              if (curLen <= prevLen) break;
              ch = s.slice(0, curLen - prevLen);
              if (n > this.MAX_SCAN) break;
            }
            sel.removeAllRanges();
            sel.addRange(range);
            return n;
          }
          // didn't advance; restore and fall back
          sel.removeAllRanges();
          sel.addRange(range);
        }
        // Fallback: string-based scanning to the left
        try {
          const ci = this.fallbackCharacterWindow(-1);
          const text = ci?.text;
          if (!ci || typeof ci.index !== "number" || ci.index <= 0 || !text)
            return 0;
          let i = ci.index - 1;
          let local = 0;
          if (i < 0) return 0;
          let seenNL = false;
          while (i >= 0 && this.classify(text[i], kind) === "ws") {
            if (seenNL && this.isNewline(text[i])) return local;
            seenNL = this.isNewline(text[i]);
            local++;
            i--;
            if (local > this.MAX_SCAN) return local;
            if (i < 0) return local;
          }
          if (i < 0) return local;
          const t = this.classify(text[i], kind);
          while (i >= 0 && this.classify(text[i], kind) === t) {
            local++;
            i--;
            if (local > this.MAX_SCAN) break;
          }
          return local;
        } catch (_) {
          return 0;
        }
      });
    }

    prevEndDelta(kind) {
      return this.scanFromFocus(() => {
        const { sel } = this.getSelAndRange();
        if (!sel) return 0;
        let under = this.peekRightCharN(1);
        let length = 0;
        let read = typeof sel.modify === 'function' ? () => {
          sel.modify('extend', 'backward', 'character');
          const text = sel.toString();
          const added = text.length - length;
          length = text.length;
          return added > 0 ? text.slice(0, added) : null;
        } : () => null;
        let ch = read();
        if (ch == null) {
          const left = this.fallbackCharacterWindow(-1);
          if (!left) return 0;
          under = this.fallbackCharacterWindow(1)?.text[0];
          let index = left.index;
          read = () => index > 0 ? left.text[--index] : null;
          ch = read();
        }
        let rightType = this.classify(under, kind);
        let previous = null;
        for (let distance = 1; distance <= this.MAX_SCAN; distance++) {
          if (ch == null) return distance - 1;
          // An empty line is a word; its newline is the right-hand one
          // of two consecutive separators encountered while scanning left.
          if (previous === '\n' && ch === '\n') return distance - 1;
          const type = this.classify(ch, kind);
          if (type !== 'ws' && type !== rightType) return distance;
          rightType = type;
          previous = ch;
          ch = read();
        }
        throw new Error('Backward word motion exceeds the selection scan limit');
      });
    }


    // ---- pairs ----
    matchPairMove(withShift) {
      const { sel } = this.getSelAndRange();
      if (!sel?.focusNode) return false;
      const model = this.documentModel();
      const index = model.offset(sel.focusNode, sel.focusOffset);
      if (index < 0) return false;
      const pairs = { '(': ')', '[': ']', '{': '}', '<': '>' };
      const reverse = { ')': '(', ']': '[', '}': '{', '>': '<' };
      const text = model.text;
      let bracket = index;
      // Like Vim, use the first bracket at or after the cursor on this line.
      while (bracket < text.length && text[bracket] !== '\n' &&
             !pairs[text[bracket]] && !reverse[text[bracket]]) {
        if (bracket - index >= this.MAX_SCAN) return false;
        bracket++;
      }
      const ch = text[bracket];
      const direction = pairs[ch] ? 1 : -1;
      const match = pairs[ch] || reverse[ch];
      if (!match) return false;
      let depth = 1;
      for (let target = bracket + direction, scanned = 0;
           target >= 0 && target < text.length && scanned < this.MAX_SCAN;
           target += direction, scanned++) {
        if (text[target] === ch) depth++;
        else if (text[target] === match && --depth === 0) {
          if (!withShift) return this.setCaretIndex(target, false);
          // Operators include both the origin and matching bracket.
          const anchor = sel.anchorNode, anchorOffset = sel.anchorOffset;
          const focus = sel.focusNode, focusOffset = sel.focusOffset;
          const width = this.characterSegments(text.slice(index)).containing(0)?.segment.length || 0;
          if (this.setCaretIndex(target < index ? index + width : index, false) &&
              this.setCaretIndex(target < index ? target : target + 1, true)) return true;
          sel.collapse(anchor, anchorOffset);
          sel.extend(focus, focusOffset);
          return false;
        }
      }
      return false;
    }

    // Compute absolute caret index from document start using DOM traversal.
    // Based on Google Docs extractor approach - builds offset map and computes position.
    caretIndex() {
      const { sel, range } = this.getSelAndRange();
      if (!sel || !range) return { index: -1, min: 0, max: 0 };
      const { text, offset } = this.documentModel();
      const caretOffset = offset(sel.focusNode, sel.focusOffset);

      return {
        index: caretOffset,
        min: 0,
        max: Math.max(0, text.length - 1),
      };
    }

    // Return editor root inside the event-target iframe
    getEditorRoot() {
      const iframe = document.querySelector(".docs-texteventtarget-iframe");
      if (!iframe) return { root: null, doc: null, win: null };
      const editorDoc = iframe.contentDocument;
      if (!editorDoc) return { root: null, doc: null, win: null };
      const editorSelectors = [
        ".kix-page-paginated",
        ".kix-paginateddocumentplugin",
        ".kix-page",
        "[contenteditable='true']",
      ];
      let editorRoot = null;
      for (const selector of editorSelectors) {
        editorRoot = editorDoc.querySelector(selector);
        if (editorRoot) break;
      }
      if (!editorRoot) editorRoot = editorDoc.body;
      return { root: editorRoot, doc: editorDoc, win: iframe.contentWindow };
    }

    documentModel(includeOffsets = true) {
      const { root, doc } = this.getEditorRoot();
      const nodeStartOffsets = new Map(), nodeEndOffsets = new Map();
      const blockTags = new Set(['P', 'DIV', 'LI', 'TABLE', 'THEAD', 'TBODY', 'TFOOT',
        'TR', 'TD', 'TH', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6']);
      let text = '';
      const visit = node => {
        if (includeOffsets) nodeStartOffsets.set(node, text.length);
        if (node.nodeType === Node.TEXT_NODE) text += node.nodeValue || '';
        else if (node.nodeType === Node.ELEMENT_NODE) {
          // Docs' accessibility surface inserts presentation-only BRs at
          // visual wraps. Intentional Shift+Enter breaks have no such role.
          if (node.tagName === 'BR') {
            if (node.getAttribute('role') !== 'presentation') text += '\n';
          }
          else {
            for (let child = node.firstChild; child; child = child.nextSibling) visit(child);
            if (blockTags.has(node.tagName) || node === root) {
              let last = node.lastChild;
              while (last && last.nodeType === Node.COMMENT_NODE) last = last.previousSibling;
              const childEndsBlock = last && (last.nodeName === 'BR' || blockTags.has(last.nodeName));
              // Inline content needs its own paragraph terminator, even after
              // literal newlines. Nested blocks/BR already supply theirs.
              if (!childEndsBlock || !text.endsWith('\n')) text += '\n';
            }
          }
        }
        if (includeOffsets) nodeEndOffsets.set(node, text.length);
      };
      if (root) visit(root);
      const offset = (container, index) => {
        const base = nodeStartOffsets.get(container);
        if (base == null) return -1;
        if (container.nodeType === Node.TEXT_NODE) {
          return base + Math.max(0, Math.min(index, (container.nodeValue || '').length));
        }
        let position = base;
        for (let i = 0; i < Math.min(index, container.childNodes.length); i++) {
          position = nodeEndOffsets.get(container.childNodes[i]) ?? position;
        }
        return position;
      };
      return { root, doc, text, nodeStartOffsets, nodeEndOffsets, offset };
    }

    extractDocumentText() {
      return this.documentModel(false).text;
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
          const idx = Array.prototype.indexOf.call(
            parent.childNodes || [],
            node,
          );
          path.push(idx < 0 ? 0 : idx);
          node = parent;
        }
        if (node !== root) return null; // not under recognized root
        path.reverse();
        return { path, offset: sel.focusOffset };
      } catch (_) {
        return null;
      }
    }

    // Resolve a node by path from editor root; returns Node or null
    resolvePath(path) {
      const { root } = this.getEditorRoot();
      if (!root || !Array.isArray(path)) return null;
      let node = root;
      for (const idx of path) {
        const children = node.childNodes || [];
        if (!Number.isSafeInteger(idx) || idx < 0 || idx >= children.length) return null;
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
      const length = node.nodeType === Node.TEXT_NODE ? (node.nodeValue || '').length : node.childNodes.length;
      if (!Number.isSafeInteger(offset) || offset < 0 || offset > length) return false;
      try {
        const r = doc.createRange();
        r.setStart(node, offset);
        r.collapse(true);
        sel.removeAllRanges();
        sel.addRange(r);
        return true;
      } catch (_) {
        return false;
      }
    }

    // Set caret (or extend selection if withShift) to absolute index using the same DOM traversal mapping.
    // Falls back to no-op if mapping cannot be built.
    setCaretIndex(absIndex, withShift = false) {
      if (!Number.isSafeInteger(absIndex)) return false;
      const { sel } = this.getSelAndRange();
      if (!sel) return false;
      const anchor = sel.anchorNode, anchorOffset = sel.anchorOffset;
      const focus = sel.focusNode, focusOffset = sel.focusOffset;
      const { root: editorRoot, doc: editorDoc, text, nodeStartOffsets, nodeEndOffsets } = this.documentModel();
      if (!editorRoot || !editorDoc) return false;

      const clamp = (n, lo, hi) => Math.max(lo, Math.min(n, hi));
      const target = clamp(absIndex, 0, Math.max(0, text.length));

      // Locate the deepest node and offset corresponding to target
      const locate = (node, targetAbs) => {
        const start = nodeStartOffsets.get(node) || 0;
        if (node.nodeType === Node.TEXT_NODE) {
          const len = (node.nodeValue || "").length;
          const off = clamp(targetAbs - start, 0, len);
          return { container: node, offset: off };
        }
        const children = node.childNodes || [];
        // If no children, place by child index on element
        if (!children.length) {
          const off = 0;
          return { container: node, offset: off };
        }
        // Find child whose range contains targetAbs; otherwise place after last child
        for (let i = 0; i < children.length; i++) {
          const c = children[i];
          const cs = nodeStartOffsets.get(c);
          const ce = nodeEndOffsets.get(c);
          if (cs == null || ce == null) continue;
          if (targetAbs < ce) {
            return locate(c, targetAbs);
          }
        }
        // Docs treats a paragraph-element endpoint as after its separator.
        // Prefer the equivalent text endpoint when targeting its text end.
        let tail = node.lastChild;
        while (tail?.lastChild) tail = tail.lastChild;
        if (tail?.nodeType === Node.TEXT_NODE && nodeEndOffsets.get(tail) === targetAbs) {
          return { container: tail, offset: tail.length };
        }
        // Place at end of this element if beyond last child mapping
        return { container: node, offset: children.length };
      };

      try {
        const spot = locate(editorRoot, target);
        const newRange = editorDoc.createRange();
        if (withShift) {
          // Extend current selection's anchor to new focus
          sel.extend(spot.container, spot.offset);
        } else {
          newRange.setStart(spot.container, spot.offset);
          newRange.collapse(true);
          sel.removeAllRanges();
          sel.addRange(newRange);
        }
        return true;
      } catch (_) {
        try {
          if (anchor && focus) {
            sel.collapse(anchor, anchorOffset);
            sel.extend(focus, focusOffset);
          }
        } catch (_) {}
        return false;
      }
    }
  }

  function repeat(n, fn) {
    for (let i = 0; i < (n ?? 1); i++) fn(i);
  }

  // ---------- Async primitives for awaiting Google Docs reactions ----------
  // sleep(ms): fallback delay used only where we genuinely cannot observe an event.
  function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

  // Wait for a quiet interval, not merely the first notification. An optional
  // action runs AFTER observers attach so synchronous responses are not lost.
  // ponytail: DOM quiet is a heuristic, not an acknowledgement from Docs.
  function waitForDocsResponse(opts = {}) {
    return new Promise((resolve, reject) => {
      let quietTimer;
      let deadline;
      let observed = false;
      let done = false;
      const observers = [];
      const iframe = document.querySelector('.docs-texteventtarget-iframe');
      const doc = iframe?.contentDocument;
      const finish = (error) => {
        if (done) return;
        done = true;
        clearTimeout(quietTimer);
        clearTimeout(deadline);
        try { doc?.removeEventListener('selectionchange', changed); } catch (_) {}
        observers.forEach(observer => { try { observer.disconnect(); } catch (_) {} });
        if (!error && doc && document.querySelector('.docs-texteventtarget-iframe')?.contentDocument !== doc) {
          error = new Error('Docs editor changed during operation; queued commands stopped');
        }
        if (error) reject(error); else resolve(observed);
      };
      const changed = () => {
        if (done) return;
        observed = true;
        clearTimeout(quietTimer);
        quietTimer = setTimeout(() => finish(), opts.quietMs ?? 40);
      };
      try {
        if (opts.observeSelection !== false) doc?.addEventListener('selectionchange', changed);
        if (opts.observeMutations !== false) {
          const targets = [doc?.querySelector('[contenteditable="true"]') || doc?.body,
            document.querySelector('.kix-appview-editor-container') ||
            document.querySelector('.kix-appview-editor')];
          for (const target of targets.filter(Boolean)) {
            const observer = new MutationObserver(changed);
            observers.push(observer);
            observer.observe(target, { childList: true, subtree: true, characterData: true });
          }
        }
        deadline = setTimeout(() => {
          if (opts.requireResponse && !observed) {
            finish(new Error('Docs edit could not be confirmed; queued commands stopped'));
          } else {
            finish();
          }
        }, opts.timeoutMs ?? 250);
        if (!opts.requireResponse) quietTimer = setTimeout(() => finish(), opts.quietMs ?? 60);
        opts.action?.();
      } catch (error) { finish(error); }
    });
  }

  // Convenience: longer wait for menu-driven actions (undo/redo via menu click).
  function waitForDocsResponseLong() { return waitForDocsResponse({ timeoutMs: 200 }); }

  class MotionExecutor {
    constructor(modeAPI, settingsAPI) {
      this.modeAPI = modeAPI;
      this.settingsAPI = settingsAPI || { getUseDisplayLines: () => false };
      this.nav = new GDocsNavigator();
      this.lastFind = null; // { dir: 'right'|'left', target: 'x', till: boolean }
      this.vlDisp = null; // visual-line displacement counter
      this.registers = { '"': { text: "", type: "char" } }; // in-memory registers with type
      this._lastSelType = "char";
      this._lastChange = null; // for '.' repeat
      this._pendingInsertCmd = null; // tracks entry command for insert repeat
      this.resetReplaceHistory();
      this.marks = {}; // map from char to bounded text anchor
      this._prevPos = null; // previous jump position for ``
      this._jumpList = [];
      this._jumpIdx = -1;
      this._jumpReturnPos = null;
      this._jumpMax = 100;
      this._changeList = [];
      this._changeIdx = -1;
      this._lastExitPos = null; // in-memory anchor or persisted fingerprint
      this._lastSearch = null; // { pattern, direction, wholeWord }
      this._lastVisual = null;
      this._macros = {};
      this._macroRecording = null;
      this._macroSize = 0;
      this._lastMacro = null;
      this._macroDepth = 0;
      this._macroExecs = 0;
      this._editorDoc = null;
      this._cancelled = false;
    }

    editorDoc() {
      return document.querySelector('.docs-texteventtarget-iframe')?.contentDocument || null;
    }

    async exec(result, expectedDoc) {
      this.assertActive();
      if (result.kind !== 'motion') this._logicalColumn = null;
      const doc = this.editorDoc();
      if (expectedDoc && doc !== expectedDoc) throw new Error('Editor changed before command execution');
      if (!doc || !this.editorIsWritable()) {
        throw new Error('Docs editor unavailable or not writable; command cancelled');
      }
      if (this._editorDoc && this._editorDoc !== doc) {
        throw new Error('Docs editor changed during operation; queued commands stopped');
      }
      this._editorDoc = doc;
      if (this.dialogIsBlocking()) {
        throw new Error('A dialog is open; Vim command cancelled');
      }
      await this.dispatch(result);
      this.assertActive();
      // Keep the input queue locked until the final edit/caret update settles.
      await waitForDocsResponse();
      this.assertActive();
      if (this.modeAPI.getReplaceMode?.() &&
          ['insert_replace_char', 'insert_delete_char_back'].includes(result.command?.id)) this.rememberReplaceCaret();
    }

    requestCancel() { this._cancelled = true; }

    assertActive() {
      if (this._cancelled) throw new Error('Operation cancelled');
      if (this._editorDoc && this.editorDoc() !== this._editorDoc) {
        throw new Error('Docs editor changed; operation cancelled');
      }
    }

    editorIsWritable() {
      const iframe = document.querySelector('.docs-texteventtarget-iframe');
      const doc = iframe?.contentDocument;
      if (!doc) return false;
      const editable = doc.querySelector('[contenteditable="true"]') ||
        (doc.body && doc.body.getAttribute('contenteditable') === 'true' ? doc.body : null);
      if (!editable) return false;
      if (editable.getAttribute('aria-readonly') === 'true') return false;
      if (document.body?.classList?.contains('docs-view-mode')) return false;
      if (document.querySelector('#docs-toolbar-mode-switcher.view-mode, .docs-titlebar-buttons-view-mode')) return false;
      return true;
    }

    dialogIsBlocking() {
      const dialogs = new Set(document.querySelectorAll('[role="dialog"][aria-modal="true"], [role="alertdialog"][aria-modal="true"]'));
      // Some Docs dialogs (including Find and replace) omit aria-modal.
      // A focused dialog still owns input; do not steal it for queued edits.
      const focusedDialog = document.activeElement?.closest?.('[role="dialog"], [role="alertdialog"]');
      if (focusedDialog) dialogs.add(focusedDialog);
      for (const el of dialogs) {
        if (!el || !el.getClientRects().length) continue;
        const style = window.getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden') continue;
        if (el.getAttribute('aria-hidden') === 'true') continue;
        return true;
      }
      return false;
    }

    cancelPendingChange() {
      this._pendingInsertCmd = null;
      this.resetReplaceHistory();
    }

    resetReplaceHistory() {
      this._replaceHistory = [];
      this._replaceHistorySize = 0;
      this._replaceCaret = null;
    }

    rememberReplaceCaret() {
      const sel = this.nav.getSelAndRange().sel;
      this._replaceCaret = sel?.isCollapsed ? { node: sel.focusNode, offset: sel.focusOffset } : null;
    }

    async replaceBackspace() {
      const entry = this._replaceHistory.at(-1);
      if (!entry) { Adapter.left({}); return; }
      const sel = this.nav.getSelAndRange().sel;
      const saved = this._replaceCaret;
      if (!sel?.isCollapsed || sel.focusNode !== saved?.node || sel.focusOffset !== saved?.offset) {
        this.resetReplaceHistory();
        throw new Error('Replace caret changed; restoration cancelled');
      }
      const model = this.nav.documentModel();
      const end = model.offset(sel.focusNode, sel.focusOffset);
      const start = end - entry.inserted.length;
      if (start < 0 || model.text.slice(start, end).replace(/\u00a0/g, ' ') !== entry.inserted.replace(/\u00a0/g, ' ')) {
        this.resetReplaceHistory();
        throw new Error('Replaced text changed; restoration cancelled');
      }
      if (!this.nav.setCaretIndex(start, false) || !this.nav.setCaretIndex(end, true)) {
        throw new Error('Replace restoration selection unavailable');
      }
      await this.insertReplacementText(entry.original);
      const current = this.nav.getSelAndRange().sel;
      current?.collapseToEnd();
      if (entry.original) this.nav.moveLeftBy(1, false);
      this._replaceHistory.pop();
      this._replaceHistorySize -= entry.original.length + entry.inserted.length;
      this.rememberReplaceCaret();
    }

    releaseEditor() {
      this._editorDoc = null;
      this._cancelled = false;
    }

    writeRegister(name, text, type, kind, numberedDelete = false) {
      const obj = { text: text || '', type: type || 'char' };
      const raw = name && typeof name === 'string' ? name : '"';
      if (raw === '_') return { obj, dest: '_', raw, skipped: true };
      if (!/^[a-zA-Z0-9"+*\-]$/.test(raw)) throw new Error('Unsupported register');
      const deleted = { ...obj };
      let dest = name === '"' ? '0' : raw;
      if (/^[A-Z]$/.test(raw)) {
        dest = raw.toLowerCase();
        const prev = this.registers[dest];
        const prevText = !prev ? '' : (typeof prev === 'string' ? prev : prev.text || '');
        if (prevText.length + obj.text.length > 1000000) throw new Error('Register exceeds safety limit');
        const prevLine = prev && prev.type === 'line';
        // A linewise half makes the appended register linewise. Characterwise
        // halves need their own terminator, including literal trailing blanks.
        if (prevLine || obj.type === 'line') {
          obj.text = prevText + (prev != null && !prevLine ? '\n' : '') +
            obj.text + (obj.type === 'line' ? '' : '\n');
          obj.type = 'line';
        } else obj.text = prevText + obj.text;
      }
      if (obj.text.length > 1000000) throw new Error('Register exceeds safety limit');
      this.registers[dest] = obj;
      this.registers['"'] = obj;
      if (kind === 'delete' && deleted.text) {
        const small = deleted.type === 'char' && !deleted.text.includes('\n');
        if (small && !name) this.registers['-'] = deleted;
        if (!small || numberedDelete) {
          for (let i = 9; i >= 2; i--) this.registers[String(i)] = this.registers[String(i - 1)];
          this.registers['1'] = deleted;
        }
      } else if (kind === 'yank' && !name) {
        this.registers['0'] = obj;
      }
      return { obj, dest, raw, skipped: false };
    }

    clipboardName(name) {
      const raw = name && typeof name === 'string' ? name : '';
      return raw === '+' || raw === '*';
    }

    async syncClipboard(text) {
      try {
        if (!text) return;
        if (!navigator.clipboard?.writeText) throw new Error('unavailable');
        let timer;
        try {
          await Promise.race([
            navigator.clipboard.writeText(text),
            new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Clipboard timed out')), 1500); }),
          ]);
        } finally { clearTimeout(timer); }
      } catch (_) {
        this.modeAPI.reportWarning?.('System clipboard unavailable; text remains in the Vim register.');
      }
    }

    async dispatch(result) {
      focusEditor();
      if (!result || !result.kind) return;
      switch (result.kind) {
        case "key": {
          const e = result.event;
          if (Array.from(e.key || '').length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
            await this.insertReplacementText(e.key);
          } else {
            const target = findEditorElement();
            if (!target) throw new Error('Docs editor unavailable; key replay cancelled');
            await waitForDocsResponse({ action: () => {
              for (const type of ['keydown', 'keyup']) {
                target.dispatchEvent(new KeyboardEvent(type, { ...e, which: e.keyCode, bubbles: true, cancelable: true }));
              }
            } });
          }
          return;
        }
        case "motion":
          if (this.modeAPI.getMode() === 'visual') return this.execVisualMotion(result);
          return this.execMotion(
            result.motion.id,
            result.count || 1,
            this.modeAPI.isVisual(),
            result.motion.args || {},
            result,
          );
        case "operator_motion":
          return this.execOperatorMotion(result);
        case "operator_self":
          return this.execOperatorSelf(result);
        case "operator_textobj":
          return this.execOperatorTextObj(result);
        case "visual_textobj":
          // Expand selection to the requested text object while in visual modes
          if (!this.selectTextObject(result.textobj, result.count || 1)) throw new Error('Text object not found');
          return;
        case "command":
          // Mode gating based on config-provided modes
          const curMode = this.modeAPI.getMode();
          const modes = result.command && result.command.modes;
          if (modes && !modes.includes(curMode)) return; // ignore if explicitly gated
          return this.execCommand(result.command.id, result);
        default:
          return;
      }
    }

    setLastChange(change) {
      // Copying text must not replace the edit that '.' repeats.
      if (change.operator === 'yank' || change.id === 'yank_to_eol' || change.id === 'visual_yank') return;
      this._lastChange = change;
    }
    // startInsert records what triggered insert-mode entry so '.' can replay it.
    //   opts: {
    //     id: 'insert_before' | 'append_after' | ... | 'substitute_char' | 'change_operator_motion' | ...
    //     count: entry count (e.g., 5 for "5i")
    //     kind: 'insert' (default) | 'replace' | 'change'
    //     // For 'change' kind, any of:
    //     operator, motion, textobj, register
    //   }
    // Backwards-compatible: if first arg is a string, treat as legacy (id, count) signature.
    startInsert(optsOrId, legacyCount) {
      this.resetReplaceHistory();
      let opts;
      if (typeof optsOrId === 'string') {
        opts = { id: optsOrId, count: legacyCount || 1, kind: 'insert' };
      } else {
        opts = Object.assign({ kind: 'insert', count: 1 }, optsOrId || {});
      }
      this._pendingInsertCmd = opts;
    }

    captureInsertStart(afterNavigation = false) {
      const entry = this._pendingInsertCmd;
      if (!entry || entry.kind === 'replace' || entry.snapshot) return;
      try {
        const { sel } = this.nav.getSelAndRange();
        if (!sel?.isCollapsed) return;
        const model = this.nav.documentModel();
        const index = model.offset(sel.focusNode, sel.focusOffset);
        if (index >= 0 && model.text.length <= 1000000) {
          entry.snapshot = { text: model.text, index: afterNavigation ? null : index, root: model.root,
            macro: this._macroRecording,
            macroIndex: this._macroRecording ? this._macros[this._macroRecording].length + (afterNavigation ? 1 : 0) : undefined };
        }
      } catch (_) {}
    }

    reconcileInsertText(entry, ops) {
      const before = entry.snapshot;
      if (!before || !ops.every(op => op.type === 'text')) return ops;
      const model = this.nav.documentModel();
      if (model.root !== before.root || model.text.length > 1000000) return ops;
      const added = model.text.length - before.text.length;
      const { sel } = this.nav.getSelAndRange();
      if (!sel?.isCollapsed) return ops;
      const caret = model.offset(sel.focusNode, sel.focusOffset);
      // Native navigation has not executed when its keydown is observed.
      // Derive its destination from the final caret, then verify both sides
      // against the pre-navigation text before accepting the insertion.
      const index = before.index === null ? caret - added : before.index;
      if (added < 0 || index < 0 || index > before.text.length || caret !== index + added ||
          !model.text.startsWith(before.text.slice(0, index)) ||
          model.text.slice(index + added) !== before.text.slice(index)) return ops;
      // Docs can consume IME events before extension listeners see them.
      // Reconcile only a single insertion at the captured caret, with all
      // surrounding text unchanged. Other edit shapes retain their key log.
      const text = model.text.slice(index, index + added);
      const logged = ops.map(op => op.value).join('');
      if (logged.replace(/\u00a0/g, ' ') === text.replace(/\u00a0/g, ' ')) return ops;
      return text ? [{ type: 'text', value: text }] : [];
    }

    reconcileMacroInsert(entry, ops) {
      const { macro, macroIndex } = entry.snapshot || {};
      if (!macro || macro !== this._macroRecording || !Number.isInteger(macroIndex)) return;
      const list = this._macros[macro];
      const tail = list.slice(macroIndex);
      const exit = tail.at(-1);
      if (exit?.kind !== 'command' || !exit.command.id.startsWith('exit_') ||
          !tail.slice(0, -1).every(rec => rec.kind === 'key' &&
            Array.from(rec.event.key || '').length === 1 &&
            !rec.event.ctrlKey && !rec.event.altKey && !rec.event.metaKey)) {
        this.abortMacro('Macro cancelled: native mixed edits cannot be replayed safely.');
        return;
      }
      const text = ops.map(op => op.value).join('');
      const replacement = text ? [{ kind: 'command', command: {
        id: 'insert_text', args: { text }, modes: ['insert'] }, count: 1 }] : [];
      replacement.push({ ...exit, command: { ...exit.command,
        args: { ...exit.command.args, insertOps: ops.map(op => ({ ...op })) } } });
      const updated = [...list.slice(0, macroIndex), ...replacement];
      const size = updated.reduce((total, rec) => total + JSON.stringify(rec).length, 0);
      if (updated.length > 256 || size > 1000000) {
        this.abortMacro('Macro cancelled: native insertion exceeds the recording limit.');
        throw new Error('Native insertion exceeds the macro recording limit');
      }
      this._macros[macro] = updated;
      this._macroSize = size;
    }

    // finishInsert: called on ESC. ops is an array of {type:'text',value} or {type:'bs',count}.
    // For backwards compat, accepts a plain string and converts to a single text op.
    async finishInsert(ops, expandCount = false) {
      if (!this._pendingInsertCmd) return;
      const entry = this._pendingInsertCmd;
      this._pendingInsertCmd = null;
      let opsArr;
      if (Array.isArray(ops)) opsArr = ops;
      else if (typeof ops === 'string' && ops.length > 0) opsArr = [{ type: 'text', value: ops }];
      else opsArr = [];
      if (entry.snapshot) {
        await waitForDocsResponse();
        this.assertActive();
        const reconciled = this.reconcileInsertText(entry, opsArr);
        if (reconciled !== opsArr) this.reconcileMacroInsert(entry, reconciled);
        opsArr = reconciled;
      }
      this._lastChange = {
        type: entry.kind || 'insert',
        entryId: entry.id,
        entryCount: entry.count || 1,
        ops: opsArr,
        operator: entry.operator,
        motion: entry.motion,
        textobj: entry.textobj,
        register: entry.register,
        countProvided: entry.countProvided,
        visualMode: entry.visualMode,
        charCount: entry.charCount,
        lineCount: entry.lineCount,
      };
      if (expandCount && ['insert', 'replace'].includes(entry.kind || 'insert')) {
        this.assertInsertReplayBudget(opsArr, entry.count || 1,
          entry.id === 'open_below' || entry.id === 'open_above', entry.kind === 'replace');
        for (let i = 1; i < (entry.count || 1); i++) {
          this.assertActive();
          if (entry.id === 'open_below' || entry.id === 'open_above') {
            await this._replayInsertEntry(entry.id, 1);
          }
          if (entry.kind === 'replace') await this._applyReplaceOps(opsArr);
          else await this._applyInsertOps(opsArr);
        }
      }
      if (entry.kind === 'replace') this.resetReplaceHistory();
    }
    async replayLastChange(overrideCount) {
      const c = this._lastChange;
      if (!c) return false;
      const useCount =
        overrideCount && overrideCount > 0 ? overrideCount : c.count || 1;
      switch (c.type) {
        case 'operator_motion':
          return this.execOperatorMotion({ operator: c.operator, motion: c.motion, count: useCount, countProvided: c.countProvided, register: c.register });
        case 'operator_self':
          return this.execOperatorSelf({ operator: c.operator, count: useCount, register: c.register });
        case 'operator_textobj':
          return this.execOperatorTextObj({ operator: c.operator, textobj: c.textobj, count: useCount, register: c.register });
        case 'visual_op': {
          if (c.visualMode === 'visualLine') this.selectWholeLines(Math.max(1, c.lineCount || 1));
          else repeat(Math.max(1, c.charCount || 1), () => Adapter.right({ shift: true }));
          await waitForDocsResponse();
          this._lastSelType = c.visualMode === 'visualLine' ? 'line' : 'char';
          if (c.operator === 'change') {
            this.startInsert({ id: 'change_operator_motion', count: 1, kind: 'change', operator: 'change', register: c.register });
          }
          await this.applyOperator(c.operator, c.register);
          if (c.operator !== 'change') this.modeAPI.setMode('normal');
          return true;
        }
        case 'command':
          return this.execCommand(c.id, { count: useCount, register: c.register, command: { id: c.id, args: c.args || {}, modes: ['normal'] } });
        case 'insert': {
          // A dot count replaces the original insert count. Position once for
          // i/I/a/A; only o/O open a new paragraph for every copy.
          const savedChange = this._lastChange;
          const savedPending = this._pendingInsertCmd;
          const insertCount = overrideCount > 0 ? overrideCount : c.entryCount || 1;
          this.assertInsertReplayBudget(c.ops || [], insertCount,
            c.entryId === 'open_below' || c.entryId === 'open_above');
          for (let r = 0; r < insertCount; r++) {
            this.assertActive();
            if (r === 0 || c.entryId === 'open_below' || c.entryId === 'open_above') {
              await this._replayInsertEntry(c.entryId, 1);
            }
            await this._applyInsertOps(c.ops || []);
          }
          this._lastChange = { ...savedChange, entryCount: insertCount };
          this._pendingInsertCmd = savedPending;
          this.collapseInsertCursor();
          this.modeAPI.setMode('normal');
          return true;
        }
        case 'replace': {
          // R uses the same count replacement rules as counted Insert.
          const savedChange = this._lastChange;
          const savedPending = this._pendingInsertCmd;
          const replaceCount = overrideCount > 0 ? overrideCount : c.entryCount || 1;
          this.assertInsertReplayBudget(c.ops || [], replaceCount, false, true);
          for (let r = 0; r < replaceCount; r++) {
            this.assertActive();
            await this._applyReplaceOps(c.ops || []);
          }
          this._lastChange = { ...savedChange, entryCount: replaceCount };
          this._pendingInsertCmd = savedPending;
          this.collapseInsertCursor();
          this.modeAPI.setMode('normal');
          return true;
        }
        case 'change': {
          // Counts extend the changed region; they must not repeat a
          // destructive change at the moving insertion endpoint.
          const savedChange = this._lastChange;
          const savedPending = this._pendingInsertCmd;
          const visual = c.entryId === 'change_visual';
          const change = !visual && overrideCount > 0
            ? { ...c, entryCount: overrideCount, countProvided: true } : c;
          // Vim retains the original Visual region and ignores a dot count.
          this.assertInsertReplayBudget(c.ops || [], 1);
          this.assertActive();
          await this._replayChangeDeletion(change);
          await this._applyInsertOps(c.ops || []);
          this._lastChange = visual ? savedChange : change;
          this._pendingInsertCmd = savedPending;
          this.collapseInsertCursor();
          this.modeAPI.setMode('normal');
          return true;
        }
        default:
          return false;
      }
    }

    assertInsertReplayBudget(ops, count, opensLine = false, replace = false) {
      if (!Number.isSafeInteger(count) || count < 1 || count > 10000 ||
          !Array.isArray(ops) || ops.length > 10000) throw new Error('Invalid insert repeat size');
      let size = opensLine ? 1 : 0;
      let operations = opensLine ? 1 : 0;
      for (const op of ops) {
        if (op?.type === 'text' && typeof op.value === 'string') size += op.value.length;
        else if (op?.type === 'bs' && Number.isSafeInteger(op.count) && op.count >= 0) size += op.count;
        else throw new Error('Invalid recorded insert operation');
        operations += op.type === 'bs' ? Math.max(1, op.count) :
          replace ? Math.max(1, this.nav.countCharacters(op.value)) : 1;
        if (size * count > 1000000) throw new Error('Insert repeat exceeds the 1,000,000-character safety limit');
        if (operations * count > 10000) throw new Error('Insert repeat exceeds the 10,000-operation safety limit');
      }
    }

    // Re-execute the cursor positioning that the original insert-entry command performed,
    // without touching _lastChange / _pendingInsertCmd state.
    async _replayInsertEntry(entryId, entryCount) {
      const needsWait = (entryId === 'open_below' || entryId === 'open_above');
      switch (entryId) {
        case 'insert_before': break;
        case 'insert_start_line':
          if (!this.moveLogicalLineBoundary('first_non_blank', 1, false, true)) throw new Error('Line boundary unavailable');
          break;
        case 'append_after': {
          const next = this.nav.peekRightCharN(1);
          if (next != null && !this.nav.isNewline(next)) this.nav.moveRightBy(1, false);
          break;
        }
        case 'append_end_line':
          if (!this.moveLogicalLineBoundary('line_end', 1, false, true)) throw new Error('Line boundary unavailable');
          break;
        case 'open_below':
          if (!this.moveLogicalLineBoundary('line_end', 1, false, true)) throw new Error('Line boundary unavailable');
          await waitForDocsResponse();
          this.assertActive();
          repeat(entryCount || 1, () => sendKeyEvent('enter', {}));
          break;
        case 'open_above': {
          const t = entryCount || 1;
          for (let i = 0; i < t; i++) {
            if (!this.moveLogicalLineBoundary('line_start', 1, false, true)) throw new Error('Line boundary unavailable');
            await waitForDocsResponse();
            this.assertActive();
            sendKeyEvent('enter', {});
            await waitForDocsResponse();
            this.assertActive();
            Adapter.up({});
            await waitForDocsResponse();
          }
          break;
        }
        case 'append_end_word': {
          const under = this.nav.peekRightCharN(1);
          if (under && this.nav.classify(under, 'word') !== 'ws') {
            const type = this.nav.classify(under, 'word');
            let distance = 0;
            while (this.nav.classify(this.nav.peekRightCharN(distance + 1), 'word') === type) {
              if (++distance > this.nav.MAX_SCAN) throw new Error('Word exceeds the selection scan limit');
            }
            this.nav.moveRightBy(distance, false);
          } else if (await this.execMotion('word_end_fwd', 1, false)) {
            this.nav.moveRightBy(1, false);
          }
          break;
        }
        default: break;
      }
      if (needsWait) await waitForDocsResponse();
      this.assertActive();
    }

    // Apply ops in sequence: text inserts via insertReplacementText, bs sends backspace keystrokes.
    async _applyInsertOps(ops) {
      if (!Array.isArray(ops)) return;
      for (const op of ops) {
        this.assertActive();
        if (op.type === 'text' && op.value) {
          await this.insertReplacementText(op.value);
        } else if (op.type === 'bs' && op.count > 0) {
          for (let i = 0; i < op.count; i++) {
            if (i && i % 16 === 0) await sleep(0);
            this.assertActive();
            Adapter.backspace({});
          }
          await waitForDocsResponse();
        }
      }
      this.assertActive();
    }

    // Recorded Backspaces already cancel typed replacements in insertOps.
    // Remaining bs operations move left before the recorded replacement segment.
    async _applyReplaceOps(ops) {
      if (!Array.isArray(ops)) return;
      for (const op of ops) {
        if (op.type === 'text' && op.value) {
          for (const { segment: ch } of this.nav.characterSegments(op.value)) {
            this.assertActive();
            await this.execCommand('insert_replace_char', { command: { args: { char: ch } } });
          }
        } else if (op.type === 'bs' && op.count > 0) {
          for (let i = 0; i < op.count; i++) {
            this.assertActive();
            Adapter.left({});
            await waitForDocsResponse();
          }
        }
      }
      this.assertActive();
    }

    // Re-execute the deletion phase of a change-family command (c/s/S/C and operator change).
    async _replayChangeDeletion(c) {
      const reg = c.register;
      switch (c.entryId) {
        case 'change_visual': {
          if (c.visualMode === 'visualLine') this.selectWholeLines(c.lineCount || 1);
          else repeat(c.charCount || 1, () => Adapter.right({ shift: true }));
          this._lastSelType = c.visualMode === 'visualLine' ? 'line' : 'char';
          await this.applyOperator('change', reg);
          return;
        }
        case 'substitute_char': {
          await this.substituteChars(c.entryCount || 1, reg);
          return;
        }
        case 'substitute_line': {
          this.selectWholeLines(c.entryCount || 1);
          await waitForDocsResponse();
          await this.applyOperator('change', reg);
          return;
        }
        case 'change_to_eol': {
          const n = c.entryCount || 1;
          if (!this.moveLogicalLineBoundary('line_end', n, true)) throw new Error('Line boundary unavailable');
          this._lastSelType = 'char';
          await waitForDocsResponse();
          await this.applyOperator('change', reg);
          await waitForDocsResponse();
          return;
        }
        case 'change_operator_motion': {
          this._lastSelType = 'char';
          if (!c.motion || !await this.selectByMotion(c.motion, c.entryCount || 1, { countProvided: c.countProvided })) {
            throw new Error('Repeat motion failed; edit cancelled');
          }
          await waitForDocsResponse();
          await this.applyOperator('change', reg);
          await waitForDocsResponse();
          return;
        }
        case 'change_operator_self': {
          this.selectWholeLines(c.entryCount || 1);
          this._lastSelType = 'line';
          await waitForDocsResponse();
          await this.applyOperator('change', reg);
          await waitForDocsResponse();
          return;
        }
        case 'change_operator_textobj': {
          if (!c.textobj) throw new Error('Repeat text object missing; edit cancelled');
          const ok = this.selectTextObject(c.textobj, c.entryCount || 1, true);
          if (!ok) throw new Error('Repeat text object not found; edit cancelled');
          this._lastSelType = (c.textobj.type === 'paragraph_inner' || c.textobj.type === 'paragraph_around') ? 'line' : 'char';
          if (this.nav.getSelAndRange().sel?.isCollapsed) {
            this.modeAPI.setMode('insert');
            return;
          }
          await waitForDocsResponse();
          await this.applyOperator('change', reg);
          await waitForDocsResponse();
          return;
        }
        default: throw new Error('Unsupported change replay; edit cancelled');
      }
    }

    capturePosition() {
      const model = this.nav.documentModel();
      const sel = this.nav.getSelAndRange().sel;
      if (!sel?.focusNode) return null;
      const index = model.offset(sel.focusNode, sel.focusOffset);
      if (index < 0) return null;
      const start = Math.max(0, index - 96);
      return { index, context: model.text.slice(start, index + 96), contextOffset: index - start };
    }

    _recordJumpBeforeMove() {
      const pos = this.capturePosition();
      if (!pos) return;
      this._prevPos = pos;
      const last = this._jumpList[this._jumpList.length - 1];
      if (!last || last.context !== pos.context || last.contextOffset !== pos.contextOffset) this._jumpList.push(pos);
      while (this._jumpList.length > this._jumpMax) {
        this._jumpList.shift();
      }
      // The current destination sits just beyond the recorded jump origins.
      this._jumpIdx = this._jumpList.length;
      this._jumpReturnPos = null;
    }

    async jumpHistory(direction) {
      const target = this._jumpIdx + direction;
      if (!this._jumpList.length || target < 0 || target > this._jumpList.length) return false;
      const returnPos = this._jumpIdx === this._jumpList.length
        ? this.capturePosition() : this._jumpReturnPos;
      const dest = target === this._jumpList.length ? returnPos : this._jumpList[target];
      if (!await this.jumpToPosition(dest)) return false;
      this._jumpReturnPos = returnPos;
      this._jumpIdx = target;
      return true;
    }

    async jumpToPosition(pos) {
      const persisted = pos?.version === 1 && typeof pos.digest === 'string' && /^[a-f0-9]{64}$/.test(pos.digest) &&
        Number.isSafeInteger(pos.length) && pos.length >= 0 && pos.length <= 1000000 &&
        Number.isSafeInteger(pos.column) && pos.column >= 0 && pos.column <= pos.length;
      if (!persisted && (!pos || typeof pos.context !== 'string' || !pos.context.length || pos.context.length > 192 ||
          !Number.isSafeInteger(pos.contextOffset) || pos.contextOffset < 0 || pos.contextOffset > pos.context.length)) {
        this.modeAPI.reportWarning?.('Mark is invalid');
        return false;
      }
      const { text, index, release } = await this.readSearchDocument();
      let target = index;
      try {
        const found = persisted ? await this.resolveExitPosition(text, pos) : text.indexOf(pos.context);
        if (found < 0 || (!persisted && text.indexOf(pos.context, found + 1) >= 0)) {
          this.modeAPI.reportWarning?.('Mark text changed or is ambiguous');
          return false;
        }
        target = found + (persisted ? pos.column : pos.contextOffset);
        return true;
      } finally {
        try {
          if (persisted && this.nav.documentModel().text !== text) {
            this.nav.getSelAndRange().sel?.collapseToStart();
            throw new Error('Document changed while resolving mark');
          }
          if (!this.nav.setCaretIndex(target, false)) {
            this.nav.getSelAndRange().sel?.collapseToStart();
            throw new Error('Mark caret could not be restored');
          }
        } finally { release?.(); }
      }
    }

    pushChangePosition() {
      const pos = this.capturePosition();
      if (!pos) return;
      const last = this._changeList[this._changeList.length - 1];
      if (!last || last.context !== pos.context || last.contextOffset !== pos.contextOffset) {
        this._changeList.push(pos);
        if (this._changeList.length > 100) this._changeList.shift();
      }
      this._changeIdx = this._changeList.length;
    }

    // (helpers are provided by this.nav)

    moveLogicalLines(delta, withShift) {
      const { sel } = this.nav.getSelAndRange();
      if (!sel?.focusNode) return false;
      const model = this.nav.documentModel();
      const index = model.offset(sel.focusNode, sel.focusOffset);
      if (index < 0) return false;
      // The model ends with an implicit paragraph terminator, not another line.
      const lines = model.text.replace(/\n$/, '').split('\n');
      let line = 0, start = 0;
      while (line < lines.length - 1 && index > start + lines[line].length) {
        start += lines[line++].length + 1;
      }
      const previous = this._logicalColumn;
      const column = previous?.index === index && previous.root === model.root
        ? previous.column : this.nav.countCharacters(lines[line].slice(0, index - start));
      const targetLine = Math.max(0, Math.min(lines.length - 1, line + delta));
      let target = 0;
      for (let i = 0; i < targetLine; i++) target += lines[i].length + 1;
      const targetText = lines[targetLine];
      const characters = this.nav.characterSegments(targetText);
      let offset = 0;
      if (column === Infinity && targetText.length) {
        offset = characters.containing(targetText.length - 1).index;
      } else {
        let n = 0;
        for (const character of characters) {
          offset = character.index;
          if (n++ >= column) break;
        }
      }
      target += offset;
      if (!this.nav.setCaretIndex(target, withShift)) return false;
      this._logicalColumn = { index: target, column, root: model.root };
      return true;
    }

    async moveLogicalLinesAcrossWindow(delta, withShift) {
      let remaining = Math.abs(delta);
      let crossedWindow = false;
      const direction = Math.sign(delta);
      const options = withShift ? { shift: true } : {};
      while (remaining > 0) {
        this.assertActive();
        const { sel } = this.nav.getSelAndRange();
        const model = this.nav.documentModel();
        const index = model.offset(sel?.focusNode, sel?.focusOffset);
        if (index < 0) return false;
        const text = model.text.replace(/\n$/, '');
        const start = index === 0 ? 0 : text.lastIndexOf('\n', index - 1) + 1;
        const available = direction < 0
          ? text.slice(0, start).split('\n').length - 1
          : text.slice(index).split('\n').length - 1;
        const step = Math.min(remaining, available);
        if (step > 0) {
          if (!this.moveLogicalLines(direction * step, withShift)) return false;
          remaining -= step;
        } else {
          const previous = this._logicalColumn;
          const column = previous?.index === index && previous.root === model.root
            ? previous.column : this.nav.countCharacters(text.slice(start, index));
          if (!this.moveLogicalLineBoundary(direction < 0 ? 'line_start' : 'line_end', 1, withShift, true)) return false;
          await waitForDocsResponse();
          this.assertActive();
          if (direction < 0) Adapter.ctrlUp(options);
          else Adapter.ctrlDown(options);
          await waitForDocsResponse();
          this.assertActive();
          if (direction > 0 && this.nav.isNewline(this.nav.peekRightCharN(1))) {
            Adapter.right(options);
            await waitForDocsResponse();
            this.assertActive();
          }
          const next = this.nav.documentModel();
          const focus = this.nav.getSelAndRange().sel;
          const position = next.offset(focus?.focusNode, focus?.focusOffset);
          if (position < 0) return false;
          this._logicalColumn = { index: position, column, root: next.root };
          if (!this.moveLogicalLines(0, withShift)) return false;
          remaining--;
        }
        if (remaining === 0) {
          if (crossedWindow) await waitForDocsResponse({ quietMs: 150, timeoutMs: 1000 });
          this.assertActive();
          return true;
        }
        crossedWindow = true;
        // Window expansion can outlive an ordinary caret notification.
        // Let Docs settle before using a new window's offsets or native keys.
        await waitForDocsResponse({ quietMs: 150, timeoutMs: 1000 });
        this.assertActive();
        const next = this.nav.documentModel();
        const focus = this.nav.getSelAndRange().sel;
        if (next.text === model.text && next.offset(focus?.focusNode, focus?.focusOffset) === index) break;
      }
      return true;
    }

    moveLogicalLineBoundary(id, count, withShift, insertion = false) {
      const { sel } = this.nav.getSelAndRange();
      if (!sel?.focusNode) return false;
      const model = this.nav.documentModel();
      const index = model.offset(sel.focusNode, sel.focusOffset);
      if (index < 0) return false;
      const text = model.text.replace(/\n$/, '');
      let start = index === 0 ? 0 : text.lastIndexOf('\n', index - 1) + 1;
      let end = text.indexOf('\n', start);
      if (end < 0) end = text.length;
      for (let i = 1; i < count && end < text.length; i++) {
        start = end + 1;
        end = text.indexOf('\n', start);
        if (end < 0) end = text.length;
      }
      let target = start;
      if (id === 'line_end' || id === 'last_non_blank') {
        if (id === 'last_non_blank') {
          while (end > start && /[\t \u00a0]/.test(text[end - 1])) end--;
        }
        target = withShift || insertion ? end : start;
        if (!withShift && !insertion && end > start) {
          target += this.nav.characterSegments(text.slice(start, end)).containing(end - start - 1).index;
        }
      } else if (id !== 'line_start') {
        while (target < end && /[\t \u00a0]/.test(text[target])) target++;
        if (!insertion && target === end && end > start) target--;
      }
      if (!this.nav.setCaretIndex(target, withShift)) return false;
      // Vim remembers $ as the end column when subsequently moving j/k.
      if (id === 'line_end' && !withShift && !insertion) {
        this._logicalColumn = { index: target, column: Infinity, root: model.root };
      }
      return true;
    }

    visibleLineCount() {
      try {
        const caret = document.querySelector(".kix-cursor-caret, .kix-cursor");
        const height = caret?.getBoundingClientRect?.().height;
        const viewport = window.innerHeight || 0;
        if (height > 0 && viewport > 0) return Math.max(1, Math.floor(viewport / height));
      } catch (_) {}
      return 20;
    }

    moveByVisibleLines(lines, opts = {}) {
      const amount = Math.abs(lines || 0);
      const adapter = lines >= 0 ? Adapter.down : Adapter.up;
      repeat(amount, () => adapter(opts));
    }

    visibleLineTops() {
      const tops = [];
      const seen = new Set();
      try {
        const selectors = [
          ".kix-lineview-content",
          ".kix-lineview",
          ".kix-paragraphrenderer",
        ];
        for (const selector of selectors) {
          document.querySelectorAll(selector).forEach((element) => {
            const rect = element.getBoundingClientRect();
            if (!rect || rect.height === 0) return;
            const top = Math.round(rect.top);
            if (top < 0 || top > (window.innerHeight || 0)) return;
            if (!seen.has(top)) {
              seen.add(top);
              tops.push(top);
            }
          });
        }
      } catch (_) {}
      return tops.sort((a, b) => a - b);
    }

    moveToScreenLine(position, count, withShift) {
      const tops = this.visibleLineTops();
      if (!tops.length) {
        scrollSelectionIntoView(position === "top" ? "top" : position === "bottom" ? "bottom" : "center");
        return;
      }
      const caret = document.querySelector(".kix-cursor-caret, .kix-cursor");
      const caretTop = caret?.getBoundingClientRect?.().top ?? tops[0];
      let current = 0;
      let best = Infinity;
      tops.forEach((top, index) => {
        const distance = Math.abs(top - caretTop);
        if (distance < best) {
          best = distance;
          current = index;
        }
      });
      const requested = Math.max(1, count || 1) - 1;
      const target = position === "top"
        ? Math.min(requested, tops.length - 1)
        : position === "bottom"
          ? Math.max(tops.length - 1 - requested, 0)
          : Math.floor((tops.length - 1) / 2);
      const delta = target - current;
      const opts = withShift ? { shift: true } : {};
      this.moveByVisibleLines(delta, opts);
    }

    scrollEditorByLines(direction, count) {
      try {
        const caret = document.querySelector(".kix-cursor-caret, .kix-cursor");
        const lineHeight = caret?.getBoundingClientRect?.().height || 20;
        const containers = document.querySelectorAll(
          ".kix-appview-editor, .kix-appview, .kix-zoomdocumentplugin-outer, .docs-scrollable",
        );
        const container = Array.from(containers).find(
          (element) => element.scrollHeight > element.clientHeight,
        );
        if (container) {
          container.scrollBy({ top: direction * lineHeight * Math.max(1, count || 1), behavior: "auto" });
        }
      } catch (_) {}
    }

    async moveDocumentLine(id, count, withShift, meta) {
      this._recordJumpBeforeMove();
      const options = withShift ? { shift: true } : {};
      if (id === 'last_line' && !meta.countProvided) Adapter.ctrlEnd(options);
      else {
        Adapter.ctrlHome(options);
        await waitForDocsResponse();
        this.assertActive();
        let remaining = count - 1;
        while (remaining > 0) {
          const { sel } = this.nav.getSelAndRange();
          const model = this.nav.documentModel();
          const index = model.offset(sel?.focusNode, sel?.focusOffset);
          if (index < 0) return false;
          const available = model.text.slice(index).replace(/\n$/, '').split('\n').length - 1;
          const step = Math.min(remaining, available);
          if (step > 0) {
            if (!this.moveLogicalLines(step, withShift)) return false;
            remaining -= step;
          } else {
            // The accessibility surface can be only a nearby window. Ask
            // Docs to expose the next paragraph when we reach its edge.
            Adapter.ctrlDown(options);
            await waitForDocsResponse();
            this.assertActive();
            if (this.nav.isNewline(this.nav.peekRightCharN(1))) Adapter.right(options);
            remaining--;
          }
          await waitForDocsResponse();
          this.assertActive();
          const next = this.nav.documentModel();
          const focus = this.nav.getSelAndRange().sel;
          if (next.text === model.text && next.offset(focus?.focusNode, focus?.focusOffset) === index) break;
        }
      }
      await waitForDocsResponse();
      this.assertActive();
      return (withShift && this.modeAPI.getMode() !== 'visual') ||
        this.moveLogicalLineBoundary('first_non_blank', 1, withShift);
    }

    moveFind(find, count, withShift, repeating = false) {
      if (!find.target || !Number.isSafeInteger(count) || count < 1 || count > 10000) return false;
      const nav = this.nav;
      const { sel } = nav.getSelAndRange();
      if (!sel?.focusNode) return false;
      const model = nav.documentModel();
      const index = model.offset(sel.focusNode, sel.focusOffset);
      if (index < 0) return false;
      const text = model.text;
      const forward = find.dir === 'right';
      const lineStart = index === 0 ? 0 : text.lastIndexOf('\n', index - 1) + 1;
      const newline = text.indexOf('\n', index);
      const lineEnd = newline < 0 ? text.length : newline;
      const start = Math.max(lineStart, index - nav.MAX_SCAN);
      const end = Math.min(lineEnd, index + nav.MAX_SCAN + 1);
      const windowText = text.slice(start, end);
      const characters = nav.characterSegments(windowText);
      const cursor = index - start;
      let position = forward ? cursor + (characters.containing(cursor)?.segment.length || 1) : cursor - 1;
      let target;
      for (let found = 0; found < count; found++) {
        const hit = forward ? windowText.indexOf(find.target, position) :
          position < 0 ? -1 : windowText.lastIndexOf(find.target, position);
        if (hit < 0) return false;
        const character = characters.containing(hit);
        if (!character || character.index !== hit) return false;
        target = find.till ? (forward ? characters.containing(hit - 1)?.index : hit + character.segment.length) : hit;
        position = forward ? hit + character.segment.length : hit - 1;
        // A repeated t/T must advance past an adjacent match that leaves it stationary.
        if (repeating && find.till && target === cursor && found === count - 1) count++;
      }
      if (!Number.isSafeInteger(target)) return false;
      if (withShift && forward) target += characters.containing(target)?.segment.length || 0;
      return nav.setCaretIndex(start + target, withShift);
    }

    execMotion(id, count, withShift, args = {}, meta = {}) {
      if (id !== 'up' && id !== 'down') this._logicalColumn = null;
      let motionOk = true;
      const S = withShift ? { shift: true } : {};
      const nav = this.nav;
      const curMode = this.modeAPI.getMode();
      // In visualLine, ignore motions that are horizontal or charwise-only to avoid breaking linewise selection
      if (curMode === "visualLine") {
        const disallow =
          id === "left" ||
          id === "right" ||
          id === "line_start" ||
          id === "line_end" ||
          id === "first_non_blank" ||
          id === "last_non_blank" ||
          id === "match_pair" ||
          id.startsWith("word_") ||
          id.startsWith("WORD_") ||
          id.startsWith("find_") ||
          id.startsWith("till_") ||
          id === "repeat_ft" ||
          id === "repeat_ft_back";
        if (disallow) return true;
      }
      switch (id) {
        case "left":
          if (curMode === "visualLine") {
            /* no-op in visual-line */ break;
          }
          repeat(count, () => Adapter.left(S));
          break;
        case "right":
          if (curMode === "visualLine") {
            /* no-op in visual-line */ break;
          }
          repeat(count, () => Adapter.right(S));
          break;
        case "up":
          if (curMode === "visualLine") {
            this.visualLineUp(count);
            break;
          }
          if (this.settingsAPI.getUseDisplayLines()) {
            repeat(count, () => Adapter.up(S));
          } else {
            return this.moveLogicalLinesAcrossWindow(-count, withShift);
          }
          break;
        case "down":
          if (curMode === "visualLine") {
            this.visualLineDown(count);
            break;
          }
          if (this.settingsAPI.getUseDisplayLines()) {
            repeat(count, () => Adapter.down(S));
          } else {
            return this.moveLogicalLinesAcrossWindow(count, withShift);
          }
          break;
        case "display_up":
          if (curMode === "visualLine") {
            this.visualLineUp(count);
            break;
          }
          repeat(count, () => Adapter.up(S));
          break;
        case "display_down":
          if (curMode === "visualLine") {
            this.visualLineDown(count);
            break;
          }
          repeat(count, () => Adapter.down(S));
          break;
        case "line_start":
        case "first_non_blank":
        case "first_non_blank_down":
        case "line_end":
        case "last_non_blank":
          motionOk = this.moveLogicalLineBoundary(id,
            id === 'line_start' || id === 'first_non_blank' ? 1 : count, withShift);
          break;
        // All 'word' motions use scanning; 'WORD' motions use non-whitespace scanning
        case "word_start_fwd":
          for (let i = 0; i < count; i++) {
            const d = nav.nextStartDelta("word");
            if (window.__VIM_DEBUG__)
              console.log("[VimDebug] word_start_fwd delta=", d);
            if (d > 0) nav.moveRightBy(d, withShift);
          }
          break;
        case "WORD_start_fwd":
          for (let i = 0; i < count; i++) {
            const d = nav.nextStartDelta("WORD");
            if (d > 0) nav.moveRightBy(d, withShift);
          }
          break;
        case "word_end_fwd":
        case "WORD_end_fwd": {
          const kind = id === 'word_end_fwd' ? 'word' : 'WORD';
          for (let i = 0; i < count; i++) {
            // The scanner returns the exclusive end of a word. Start beyond
            // the current character so repeated e also advances from its end.
            const next = i === 0 && args.includeCurrentWord ? null : nav.peekRightCharN(2);
            if (next != null) nav.moveRightBy(1, withShift);
            const d = nav.nextEndDelta(kind);
            if (d > 0) nav.moveRightBy(d, withShift);
            if (d > 0 || next != null) nav.moveLeftBy(1, withShift);
          }
          if (withShift) nav.moveRightBy(1, true);
          break;
        }
        case "word_start_back":
          for (let i = 0; i < count; i++) {
            const d = nav.prevStartDelta("word");
            if (d > 0) nav.moveLeftBy(d, withShift);
          }
          break;
        case "WORD_start_back":
          for (let i = 0; i < count; i++) {
            const d = nav.prevStartDelta("WORD");
            if (d > 0) nav.moveLeftBy(d, withShift);
          }
          break;
        case "word_end_back":
          for (let i = 0; i < count; i++) {
            const d = nav.prevEndDelta("word");
            if (d > 0) nav.moveLeftBy(d, withShift);
          }
          break;
        case "WORD_end_back":
          for (let i = 0; i < count; i++) {
            const d = nav.prevEndDelta("WORD");
            if (d > 0) nav.moveLeftBy(d, withShift);
          }
          break;
        case "first_line":
        case "last_line":
          return this.moveDocumentLine(id, Math.max(1, count || 1), withShift, meta);
        case "screen_top":
          this.moveToScreenLine("top", count, withShift);
          break;
        case "screen_middle":
          this.moveToScreenLine("middle", count, withShift);
          break;
        case "screen_bottom":
          this.moveToScreenLine("bottom", count, withShift);
          break;
        case "scroll_down":
          this.scrollEditorByLines(1, count);
          break;
        case "scroll_up":
          this.scrollEditorByLines(-1, count);
          break;
        case "page_up":
          repeat(count, () => Adapter.pageUp(S));
          break;
        case "page_down":
          repeat(count, () => Adapter.pageDown(S));
          break;
        case "half_page_down":
          this.moveByVisibleLines(Math.max(1, Math.floor(this.visibleLineCount() / 2)), S);
          break;
        case "half_page_up":
          this.moveByVisibleLines(-Math.max(1, Math.floor(this.visibleLineCount() / 2)), S);
          break;
        case "match_pair":
          motionOk = !!nav.matchPairMove(withShift);
          if (!motionOk) this.stub("match_pair");
          break;
        case "find_next":
        case "till_next":
        case "find_prev":
        case "till_prev": {
          const dir = id.endsWith('next') ? 'right' : 'left';
          this.lastFind = { dir, target: args.char, till: id.startsWith('till_') };
          motionOk = this.moveFind(this.lastFind, count, withShift);
          break;
        }
        case "paragraph_fwd":
          this._recordJumpBeforeMove();
          repeat(count, () => Adapter.ctrlDown(S));
          break;
        case "paragraph_back":
          this._recordJumpBeforeMove();
          repeat(count, () => Adapter.ctrlUp(S));
          break;
        case "scroll_top":
          scrollSelectionIntoView("top");
          break;
        case "scroll_center":
          scrollSelectionIntoView("center");
          break;
        case "scroll_bottom":
          scrollSelectionIntoView("bottom");
          break;
        case "repeat_ft":
        case "repeat_ft_back": {
          const find = this.lastFind;
          if (!find) { motionOk = false; break; }
          const dir = id === 'repeat_ft' ? find.dir : find.dir === 'right' ? 'left' : 'right';
          motionOk = this.moveFind({ ...find, dir }, count, withShift, true);
          break;
        }
        default:
          this.stub("motion:" + id);
          motionOk = false;
          break;
      }
      // Debug: print caret index after motion (with small delay to let Google Docs process key events)
      try {
        if (window.__VIM_DEBUG__) {
          // Fire-and-forget debug log after Docs reacts to the motion.
          waitForDocsResponse({ timeoutMs: 30 }).then(() => {
            const ci = this.nav.caretIndex();
            console.log('[VimDebug] motion', id, 'index=', ci.index, 'min=', ci.min, 'max=', ci.max);
          }).catch(() => {});
        }
      } catch (_) {}
      return motionOk;
    }

    async selectByMotion(motion, count, meta = {}) {
      const initial = this.nav.getSelAndRange().sel;
      const anchor = initial?.anchorNode, anchorOffset = initial?.anchorOffset;
      const focus = initial?.focusNode, focusOffset = initial?.focusOffset;
      if (!await this.execMotion(motion.id, count, true, motion.args || {}, meta)) return false;
      if (motion.id === 'word_end_back' || motion.id === 'WORD_end_back') {
        const { sel } = this.nav.getSelAndRange();
        if (!sel?.focusNode || (sel.focusNode === focus && sel.focusOffset === focusOffset)) return false;
        const target = sel.focusNode, offset = sel.focusOffset;
        // ge/gE are inclusive: a backward DOM range otherwise excludes
        // the character under the original cursor.
        sel.collapse(focus, focusOffset);
        this.nav.moveRightBy(1, false);
        sel.extend(target, offset);
        return true;
      }
      if (!['up', 'down', 'first_line', 'last_line', 'first_non_blank_down'].includes(motion.id)) return true;
      await waitForDocsResponse();
      this.assertActive();
      const { sel, range } = this.nav.getSelAndRange();
      if (!sel || !range) return false;
      const model = this.nav.documentModel();
      const from = model.offset(range.startContainer, range.startOffset);
      const to = model.offset(range.endContainer, range.endOffset);
      if (from < 0 || to < from) return false;
      if (from === to && (motion.id === 'up' || motion.id === 'down')) return false;
      if (meta.operator === 'yank') {
        meta.yankStart = { node: range.startContainer, offset: range.startOffset };
      }
      const start = from === 0 ? 0 : model.text.lastIndexOf('\n', from - 1) + 1;
      const newline = model.text.indexOf('\n', to);
      const end = Math.min(newline < 0 ? model.text.length - 1 : newline + 1, model.text.length - 1);
      if (!this.nav.setCaretIndex(start, false) || !this.nav.setCaretIndex(end, true)) return false;
      const selected = this.nav.getSelAndRange().range;
      const cell = node => (node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement)?.closest('td, th');
      if (!selected || cell(selected.startContainer) !== cell(selected.endContainer)) {
        if (anchor && focus) { sel.collapse(anchor, anchorOffset); sel.extend(focus, focusOffset); }
        throw new Error('Linewise motion cannot cross a table cell boundary');
      }
      this._lastSelType = 'line';
      return true;
    }

    linewiseSelectionText(selected) {
      const { range } = this.nav.getSelAndRange();
      if (!range || !selected) return selected;
      const model = this.nav.documentModel();
      const start = model.offset(range.startContainer, range.startOffset);
      let end = model.offset(range.endContainer, range.endOffset);
      if (start < 0 || end <= start) return selected.endsWith('\n') ? selected : selected + '\n';
      // The final paragraph terminator belongs in a linewise register, but
      // must never extend the physical selection used to delete/change text.
      if (end === model.text.length - 1) end++;
      const text = model.text.slice(start, end);
      return text.endsWith('\n') ? text : text + '\n';
    }

    async applyOperator(op, register, numberedDelete = false, yankStart = null) {
      if (this._editorDoc && (!this.editorIsWritable() || this.dialogIsBlocking())) throw new Error('Editor blocked; operator cancelled');
      focusEditor();
      await waitForDocsResponse({ observeMutations: false });
      this.assertActive();
      if (this._editorDoc && (!this.editorIsWritable() || this.dialogIsBlocking())) throw new Error('Editor blocked; operator cancelled');
      const selected = getSelectedText();
      if ((op === 'delete' || op === 'change') && !selected) {
        const { range } = this.nav.getSelAndRange();
        if (op === 'change' && range) {
          const model = this.nav.documentModel();
          const start = model.offset(range.startContainer, range.startOffset);
          const end = model.offset(range.endContainer, range.endOffset);
          if (start >= 0 && start === end && (model.text[start] === '\n' || start === model.text.length) &&
              this.nav.setCaretIndex(start, false)) {
            // C on an empty line has nothing to remove but still enters Insert.
            this.modeAPI.setMode('insert');
            return;
          }
        }
        throw new Error('No text selected; edit cancelled');
      }
      const registerText = this._lastSelType === 'line' && ['delete', 'yank', 'change'].includes(op)
        ? this.linewiseSelectionText(selected) : selected;
      switch (op) {
        case "delete":
          if (selected && selected.length) {
            this.writeRegister(register, registerText, this._lastSelType || "char", 'delete', numberedDelete);
            if (this._lastSelType === 'line') {
              const { sel, range } = this.nav.getSelAndRange();
              const model = this.nav.documentModel();
              const start = model.offset(range.startContainer, range.startOffset);
              const end = model.offset(range.endContainer, range.endOffset);
              if (start > 0 && end >= model.text.length - 1 && model.text[start - 1] === '\n') {
                sel.collapse(range.endContainer, range.endOffset);
                sel.extend(range.startContainer, range.startOffset);
                this.nav.moveLeftBy(1, true);
                const expanded = this.nav.getSelAndRange().range;
                const cell = node => (node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement)?.closest('td, th');
                if (!expanded) throw new Error('Final paragraph boundary unavailable; deletion cancelled');
                const crossCell = cell(expanded.startContainer) !== cell(expanded.endContainer);
                if (crossCell) {
                  sel.removeAllRanges(); sel.addRange(range);
                }
                await waitForDocsResponse();
                this.assertActive();
                if (this._editorDoc && (!this.editorIsWritable() || this.dialogIsBlocking())) {
                  throw new Error('Editor blocked; deletion cancelled');
                }
                const confirmed = this.nav.getSelAndRange().range;
                if (!confirmed || model.offset(confirmed.startContainer, confirmed.startOffset) !== start - (crossCell ? 0 : 1) ||
                    model.offset(confirmed.endContainer, confirmed.endOffset) !== end) {
                  throw new Error('Final paragraph boundary was not selected; deletion cancelled');
                }
              }
              // Native deletion handles paragraph boundaries as one edit;
              // replacement-text events can split the operation in Docs undo.
              await waitForDocsResponse({ requireResponse: true, timeoutMs: 1000,
                action: () => Adapter.backspace({}) });
              this.pushChangePosition();
            } else await this.insertReplacementText("");
            if (this.clipboardName(register)) await this.syncClipboard(registerText);
          }
          return;
        case "yank":
          if (selected && selected.length)
            this.writeRegister(register, registerText, this._lastSelType || "char", 'yank');
          if (selected && selected.length && this.clipboardName(register)) await this.syncClipboard(registerText);
          this.assertActive();
          {
            const { sel } = this.nav.getSelAndRange();
            if (yankStart?.node?.isConnected && sel) sel.collapse(yankStart.node, yankStart.offset);
            else if (sel && sel.collapseToStart) sel.collapseToStart();
          }
          return;
        case "change":
          if (selected && selected.length) {
            if (this._lastSelType === 'line') {
              const { range } = this.nav.getSelAndRange();
              const model = this.nav.documentModel();
              const start = model.offset(range.startContainer, range.startOffset);
              const end = model.offset(range.endContainer, range.endOffset);
              if (start < 0 || end < start) throw new Error('Change boundary unavailable');
              // Keep one separator for the replacement line. Deletion and
              // change have different whole-line endpoint semantics.
              const target = end > start && model.text[end - 1] === '\n' ? end - 1 : end;
              if (!this.nav.setCaretIndex(start, false) || !this.nav.setCaretIndex(target, true)) {
                throw new Error('Change boundary unavailable');
              }
              const selection = this.nav.getSelAndRange().range;
              const cell = node => (node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement)?.closest('td, th');
              if (cell(selection.startContainer) !== cell(selection.endContainer)) {
                throw new Error('Change cannot cross a table cell boundary');
              }
            }
            this.writeRegister(register, registerText, this._lastSelType || "char", 'delete', numberedDelete);
            if (!this.nav.getSelAndRange().sel?.isCollapsed) await this.insertReplacementText("");
            if (this.clipboardName(register)) await this.syncClipboard(registerText);
          }
          this.assertActive();
          this.modeAPI.setMode("insert");
          return;
        case "indent": {
          // Indent current selection (or current line) once using Tab
          if (!selected || !selected.length) {
            this.selectWholeLines(1);
          }
          sendKeyEvent("tab", {});
          return;
        }
        case "dedent": {
          // Dedent current selection (or current line) once using Shift+Tab
          if (!selected || !selected.length) {
            this.selectWholeLines(1);
          }
          sendKeyEvent("tab", { shift: true });
          return;
        }
        case "reindent": {
          // Reindent selection by replacing leading whitespace of each line with base indent of current line
          if (!selected || !selected.length) {
            this.selectWholeLines(1);
          }
          const selText = getSelectedText();
          if (!selText || !selText.length) return;
          const baseIndent = this.computeCurrentLineIndent();
          const out = this.indentBlock(selText, baseIndent || "");
          await this.insertReplacementText(out);
          return;
        }
        case "reflow": {
          if (selected && selected.length) {
            const out = this.reflowString(selected);
            await this.insertReplacementText(out);
          }
          return;
        }
        case "toggle_case": {
          if (selected && selected.length) {
            const out = Array.from(selected)
              .map((ch) => {
                const lc = ch.toLowerCase();
                const uc = ch.toUpperCase();
                if (ch === lc && ch !== uc) return uc;
                if (ch === uc && ch !== lc) return lc;
                return ch;
              })
              .join("");
            await this.insertReplacementText(out);
          }
          return;
        }
        case "lowercase": {
          if (selected && selected.length)
            await this.insertReplacementText(selected.toLowerCase());
          return;
        }
        case "uppercase": {
          if (selected && selected.length)
            await this.insertReplacementText(selected.toUpperCase());
          return;
        }
        default:
          return this.stub("operator:" + op);
      }
    }

    async execOperatorMotion(result) {
      const { operator, count = 1, opCount } = result;
      let motion = result.motion;
      const gotoLine = motion && (motion.id === "first_line" || motion.id === "last_line");
      const countProvided = !!(result.countProvided || opCount);
      // G/gg use the count as a line number; other motions multiply operator × motion counts.
      const times = gotoLine
        ? (countProvided ? (opCount || count) : 1)
        : (opCount || 1) * (count || 1);
      this._lastSelType = "char";
      // Vim quirk: 'cw' and 'cW' behave like 'ce' and 'cE' so trailing whitespace
      // is preserved (lets you change a word without losing the space after it).
      if (operator === "change" && !this.nav.isWhitespace(this.nav.peekRightCharN(1))) {
        if (motion && motion.id === "word_start_fwd") {
          motion = { id: "word_end_fwd", args: { ...motion.args, includeCurrentWord: true } };
        } else if (motion && motion.id === "WORD_start_fwd") {
          motion = { id: "WORD_end_fwd", args: { ...motion.args, includeCurrentWord: true } };
        }
      }
      const selectionMeta = { ...result, countProvided };
      if (!await this.selectByMotion(motion, times, selectionMeta)) {
        throw new Error('Motion failed; edit cancelled');
      }
      // Wait for Docs to apply the selection (selectionchange + mutation observers).
      await waitForDocsResponse();
      if (operator === "change") {
        // 'c'+motion enters insert mode; track typed text so '.' can replay the full change.
        this.startInsert({
          id: "change_operator_motion", count: times, kind: "change",
          operator: "change", motion: { id: motion.id, args: motion.args || {} },
          register: result.register, countProvided
        });
      }
      await this.applyOperator(operator, result.register,
        ['match_pair', 'paragraph_fwd', 'paragraph_back'].includes(motion.id), selectionMeta.yankStart);
      if (operator !== "change") {
        this.setLastChange({ type: "operator_motion", operator, motion: { id: motion.id, args: motion.args || {} }, count: times, countProvided, register: result.register });
      }
    }

    async execOperatorSelf(result) {
      const { operator, count = 1, opCount } = result;
      const lineCount = (opCount || 1) * (count || 1);
      const initial = operator === 'yank' ? this.nav.getSelAndRange().sel : null;
      const yankStart = initial ? { node: initial.focusNode, offset: initial.focusOffset } : null;
      if (operator === 'delete') {
        const { sel, range } = this.nav.getSelAndRange();
        const element = sel?.focusNode?.nodeType === Node.ELEMENT_NODE
          ? sel.focusNode : sel?.focusNode?.parentElement;
        const cell = element?.closest('td, th');
        const paragraph = element?.closest('p');
        if (cell) {
          const paragraphs = Array.from(cell.children);
          const index = paragraphs.indexOf(paragraph);
          if (!range || index < 0 || paragraphs.some(node => node.tagName !== 'P') ||
              index + lineCount > paragraphs.length) {
            throw new Error('Line deletion cannot cross a table cell or nested structure');
          }
          const last = paragraphs[index + lineCount - 1];
          const next = paragraphs[index + lineCount];
          const model = this.nav.documentModel();
          const text = model.text.slice(model.nodeStartOffsets.get(paragraph), model.nodeEndOffsets.get(last));
          // Borrow only a boundary inside this cell. The sole remaining
          // paragraph must stay in place because it is part of the table.
          range.setStart(paragraph, 0);
          range.setEnd(last, last.childNodes.length);
          if (next) range.setEnd(next, 0);
          else if (index > 0) {
            const previous = paragraphs[index - 1];
            const walker = previous.ownerDocument.createTreeWalker(previous, NodeFilter.SHOW_TEXT);
            let node, tail;
            while ((node = walker.nextNode())) tail = node;
            // Docs treats a P element's end as after its separator. A text
            // endpoint retains the separator that must be removed here.
            range.setStart(tail || previous, tail ? tail.length : 0);
          }
          sel.removeAllRanges();
          sel.addRange(range);
          if (!getSelectedText()) return;
          await waitForDocsResponse();
          this.assertActive();
          if (!this.editorIsWritable() || this.dialogIsBlocking()) throw new Error('Editor is not available for editing');
          const confirmed = this.nav.getSelAndRange().range;
          if (!cell.isConnected || !confirmed || !cell.contains(confirmed.startContainer) ||
              !cell.contains(confirmed.endContainer)) throw new Error('Table selection changed; deletion cancelled');
          this.writeRegister(result.register, text, 'line', 'delete');
          await waitForDocsResponse({ requireResponse: true, timeoutMs: 1000,
            action: () => Adapter.backspace({}) });
          this.pushChangePosition();
          if (this.clipboardName(result.register)) await this.syncClipboard(text);
          this._lastSelType = 'line';
          this.setLastChange({ type: 'operator_self', operator, count: lineCount, register: result.register });
          return;
        }
      }
      // Remove an existing newline, never invent a deletion in an empty document.
      if (operator === "delete") {
        const left = this.nav.peekLeftCharN(1);
        const right = this.nav.peekRightCharN(1);
        const atLineStart = left == null || this.nav.isNewline(left);
        const atLineEnd = right == null || this.nav.isNewline(right);
        if (atLineStart && atLineEnd && lineCount === 1) {
          if (left == null && right == null) return;
          this.writeRegister(result.register, "\n", "line", "delete");
          await waitForDocsResponse({ requireResponse: true, timeoutMs: 1000,
            action: () => left == null ? Adapter.delete({}) : Adapter.backspace({}) });
          this.pushChangePosition();
          if (this.clipboardName(result.register)) await this.syncClipboard('\n');
          this._lastSelType = "line";
          this.setLastChange({
            type: "operator_self",
            operator,
            count: lineCount,
            register: result.register,
          });
          return;
        }
      }
      this.selectWholeLines(lineCount);
      await waitForDocsResponse();
      this.assertActive();
      if (!this.editorIsWritable() || this.dialogIsBlocking()) throw new Error('Editor is not available for editing');
      this._lastSelType = "line";
      if (operator === "change") {
        // 'cc' enters insert mode; track typed text for '.' replay.
        this.startInsert({ id: "change_operator_self", count: lineCount, kind: "change", operator: "change", register: result.register });
        await this.applyOperator(operator, result.register);
        return;
      }
      // Paragraph selection can stop before the separator. Include that
      // boundary in the selection before issuing the single delete.
      if (operator === "delete") {
        focusEditor();
        const original = this.nav.getSelAndRange().range;
        if (!original) throw new Error('No text selected; edit cancelled');
        const model = this.nav.documentModel();
        const originalStart = model.offset(original.startContainer, original.startOffset);
        const originalEnd = model.offset(original.endContainer, original.endOffset);
        if (originalEnd > originalStart && originalEnd < model.text.length - 1 &&
            model.text[originalEnd] === '\n' && model.text[originalEnd - 1] !== '\n') {
          Adapter.right({ shift: true });
          await waitForDocsResponse();
          this.assertActive();
          if (!this.editorIsWritable() || this.dialogIsBlocking()) throw new Error('Editor is not available for editing');
          const expanded = this.nav.getSelAndRange().range;
          if (!expanded || model.offset(expanded.startContainer, expanded.startOffset) !== originalStart ||
              model.offset(expanded.endContainer, expanded.endOffset) !== originalEnd + 1) {
            throw new Error('Paragraph boundary was not selected; deletion cancelled');
          }
        }
        const selected = getSelectedText();
        if (!selected) throw new Error('No text selected; edit cancelled');
        const registerText = this.linewiseSelectionText(selected);
        if (this.nav.peekRightCharN(1) == null) {
          const { sel, range } = this.nav.getSelAndRange();
          const start = model.offset(range.startContainer, range.startOffset);
          const end = model.offset(range.endContainer, range.endOffset);
          // The last paragraph has no following separator to delete. Include
          // the preceding one physically, but keep it out of the register.
          if (start > 0 && end >= model.text.length - 1 && model.text[start - 1] === '\n') {
            sel.collapse(range.endContainer, range.endOffset);
            sel.extend(range.startContainer, range.startOffset);
            this.nav.moveLeftBy(1, true);
            await waitForDocsResponse();
            this.assertActive();
            if (!this.editorIsWritable() || this.dialogIsBlocking()) throw new Error('Editor is not available for editing');
            const expanded = this.nav.getSelAndRange().range;
            if (!expanded || model.offset(expanded.startContainer, expanded.startOffset) !== start - 1 ||
                model.offset(expanded.endContainer, expanded.endOffset) !== end) {
              throw new Error('Final paragraph boundary was not selected; deletion cancelled');
            }
          }
        }
        this.writeRegister(result.register, registerText, "line", "delete");
        await waitForDocsResponse({ requireResponse: true, timeoutMs: 1000,
          action: () => Adapter.backspace({}) });
        this.pushChangePosition();
        if (this.clipboardName(result.register)) await this.syncClipboard(registerText);
      } else {
        await this.applyOperator(operator, result.register, false, yankStart);
      }

      this.setLastChange({
        type: "operator_self",
        operator,
        count: lineCount,
        register: result.register,
      });
    }

    async execOperatorTextObj(result) {
      const { operator, textobj } = result;
      const times = (result.count || 1) * (result.opCount || 1);
      if (!textobj || !textobj.type) {
        throw new Error('Text object failed; edit cancelled');
      }
      const ok = this.selectTextObject(textobj, times, operator === 'change');
      if (!ok) {
        throw new Error('Text object not found; edit cancelled');
      }
      // Mark linewise for paragraph objects
      if (textobj.type === 'paragraph_inner' || textobj.type === 'paragraph_around') this._lastSelType = 'line'; else this._lastSelType = 'char';
      // Wait for selection extension to settle before applying.
      await waitForDocsResponse();
      this.assertActive();
      if (operator === 'change') {
        // 'ci"', 'caw', etc. enter insert mode; track typed text for '.' replay.
        this.startInsert({ id: 'change_operator_textobj', count: times, kind: 'change', operator: 'change', textobj, register: result.register });
        if (this.nav.getSelAndRange().sel?.isCollapsed) {
          this.modeAPI.setMode('insert');
          return;
        }
      }
      await this.applyOperator(operator, result.register);
      if (operator !== 'change') {
        this.setLastChange({ type: 'operator_textobj', operator, count: times, textobj, register: result.register });
      }
    }

    selectTextObject(textobj, count = 1, allowEmpty = false) {
      const t = textobj.type;
      if (!Number.isSafeInteger(count) || count < 1 || count > 10000) return false;
      const del = textobj.delims || [];
      switch (t) {
        // words
        case "word":
          return this.selectWordLike("word", false, count);
        case "word_around":
          return this.selectWordLike("word", true, count);
        case "WORD":
          return this.selectWordLike("WORD", false, count);
        case "WORD_around":
          return this.selectWordLike("WORD", true, count);
        // parentheses / braces via delims
        case "paren_inner": {
          const open = del[0] || "(";
          const close = del[1] || ")";
          return this.selectDelims(open, close, false, count, allowEmpty);
        }
        case "paren_around": {
          const open = del[0] || "(";
          const close = del[1] || ")";
          return this.selectDelims(open, close, true, count);
        }
        // quotes
        case "quote_inner":
          return del[0] ? this.selectQuote(del[0], count === 2, false, allowEmpty) : false;
        case "quote_around":
          return del[0] ? this.selectQuote(del[0], true, true) : false;
        // paragraphs / sentences
        case "paragraph_inner":
          return this.selectParagraph(false, count);
        case "paragraph_around":
          return this.selectParagraph(true, count);
        case "sentence_inner":
          return this.selectSentence(false, count);
        case "sentence_around":
          return this.selectSentence(true, count);
        // tags
        case "tag_inner":
          return this.selectTag(false, count, allowEmpty);
        case "tag_around":
          return this.selectTag(true, count);
        default:
          return false;
      }
    }

    selectWordLike(kind, around, count = 1) {
      const nav = this.nav;
      const { sel } = nav.getSelAndRange();
      if (!sel || !sel.focusNode || !Number.isSafeInteger(count) || count < 1) return false;
      const anchor = sel.anchorNode, anchorOffset = sel.anchorOffset;
      const focus = sel.focusNode, focusOffset = sel.focusOffset;
      let ok = false, scanned = 0;
      const move = direction => {
        if (++scanned > nav.MAX_SCAN) throw new Error('Text object exceeds the selection scan limit; no edit was applied');
        sel.modify('move', direction, 'character');
      };
      try {
        sel.collapse(focus, focusOffset);
        const first = nav.peekRightCharN(1);
        if (first == null) return false;
        const firstType = nav.classify(first, kind);
        let ch;
        while ((ch = nav.peekLeftCharN(1)) != null && nav.classify(ch, kind) === firstType) move('backward');
        let start = sel.focusNode, startOffset = sel.focusOffset;
        let completed = 0;
        while (completed < count) {
          ch = nav.peekRightCharN(1);
          if (ch == null) return false;
          const type = nav.classify(ch, kind);
          do {
            move('forward');
            ch = nav.peekRightCharN(1);
          } while (ch != null && nav.classify(ch, kind) === type);
          // iw counts whitespace runs; aw includes them without counting them.
          if (!around || type !== 'ws') completed++;
        }
        if (around) {
          let trailing = false;
          while ((ch = nav.peekRightCharN(1)) != null && nav.isWhitespace(ch)) {
            move('forward'); trailing = true;
          }
          if (!trailing && firstType !== 'ws') {
            const end = sel.focusNode, endOffset = sel.focusOffset;
            sel.collapse(start, startOffset);
            while ((ch = nav.peekLeftCharN(1)) != null && nav.isWhitespace(ch)) move('backward');
            start = sel.focusNode; startOffset = sel.focusOffset;
            sel.collapse(end, endOffset);
          }
        }
        const end = sel.focusNode, endOffset = sel.focusOffset;
        sel.collapse(start, startOffset);
        sel.extend(end, endOffset);
        ok = !sel.isCollapsed;
        return ok;
      } finally {
        if (!ok) { sel.collapse(anchor, anchorOffset); sel.extend(focus, focusOffset); }
      }
    }

    selectDelims(open, close, includeDelims, count = 1, allowEmpty = false) {
      const { sel } = this.nav.getSelAndRange();
      if (!sel || !sel.focusNode || !Number.isSafeInteger(count) || count < 1) return false;
      const anchor = sel.anchorNode, anchorOffset = sel.anchorOffset;
      const focus = sel.focusNode, focusOffset = sel.focusOffset;
      let ok = false;
      try {
        sel.collapse(focus, focusOffset);
        for (let level = 0; level < count; level++) {
          const leftDist = level === 0 && this.nav.peekRightCharN(1) === open
            ? 0 : this.findEnclosingOpenDelta(open, close);
          if (leftDist != null) this.nav.moveLeftBy(leftDist, false);
          else if (level === 0) {
            const fwd = this.findCharForwardDelta(open);
            if (fwd == null) return false;
            this.nav.moveRightBy(fwd, false);
          } else return false;
        }
        if (!includeDelims) this.nav.moveRightBy(1, false);
        const rightDist = this.findMatchingCloseFromHere(open, close, includeDelims);
        if (rightDist == null) return false;
        this.nav.moveRightBy(rightDist, true);
        ok = !sel.isCollapsed || (allowEmpty && rightDist === 0);
        return ok;
      } finally {
        if (!ok) { sel.collapse(anchor, anchorOffset); sel.extend(focus, focusOffset); }
      }
    }

    // Returns the number of characters between the cursor and the next
    // occurrence of `target` (so `target` is the (delta+1)-th char to the
    // right). Returns null if not found within MAX_SCAN.
    findCharForwardDelta(target) {
      const { sel, range } = this.nav.getSelAndRange();
      if (!sel || !range) return null;
      sel.removeAllRanges(); sel.addRange(range);
      let n = 0; let prevLen = 0;
      for (let guard = 0; guard < this.nav.MAX_SCAN; guard++) {
        sel.modify('extend', 'forward', 'character');
        const s = sel.toString(); const curLen = s.length || 0;
        if (curLen <= prevLen) break;
        const ch = s.slice(prevLen);
        if (ch === target) {
          sel.removeAllRanges(); sel.addRange(range);
          return n;
        }
        n++; prevLen = curLen;
      }
      sel.removeAllRanges(); sel.addRange(range);
      return null;
    }

    // Match the user-typed quote char OR its Docs-smart curly counterparts.
    // Google Docs auto-converts " -> U+201C/U+201D and ' -> U+2018/U+2019,
    // so a literal === comparison would never find a quote in real documents.
    quoteMatcher(q) {
      if (q === '"') {
        return (ch) => ch === '"' || ch === '\u201C' || ch === '\u201D' || ch === '\u201E' || ch === '\u201F';
      }
      if (q === "'") {
        return (ch) => ch === "'" || ch === '\u2018' || ch === '\u2019' || ch === '\u201A' || ch === '\u201B';
      }
      return (ch) => ch === q;
    }

    // Like findCharForwardDelta but accepts a predicate so we can match any
    // of several characters (used for smart-quote variants).
    findPredForwardDelta(pred) {
      const { sel, range } = this.nav.getSelAndRange();
      if (!sel || !range) return null;
      sel.removeAllRanges(); sel.addRange(range);
      let n = 0; let prevLen = 0;
      for (let guard = 0; guard < this.nav.MAX_SCAN; guard++) {
        sel.modify('extend', 'forward', 'character');
        const s = sel.toString(); const curLen = s.length || 0;
        if (curLen <= prevLen) break;
        const ch = s.slice(prevLen);
        if (pred(ch)) {
          sel.removeAllRanges(); sel.addRange(range);
          return n;
        }
        n++; prevLen = curLen;
      }
      sel.removeAllRanges(); sel.addRange(range);
      return null;
    }

    selectQuote(q, includeDelim, includeWhitespace = false, allowEmpty = false) {
      const text = this.nav.extractDocumentText();
      const ci = this.nav.caretIndex();
      const { sel } = this.nav.getSelAndRange();
      if (!text || text.length > 1000000 || !ci || ci.index < 0 || !sel?.focusNode) return false;
      const isQ = this.quoteMatcher(q);
      const lineStart = text.lastIndexOf('\n', ci.index - 1) + 1;
      const newline = text.indexOf('\n', ci.index);
      const lineEnd = newline < 0 ? text.length : newline;
      let opening = null, pair = null, escaped = false;
      // Pair from the beginning of the line, so a caret on an opening quote
      // cannot accidentally select the gap after the previous quoted string.
      for (let i = lineStart; i < lineEnd;) {
        const ch = String.fromCodePoint(text.codePointAt(i));
        if (!escaped && isQ(ch)) {
          if (opening === null) opening = { index: i, width: ch.length };
          else {
            if (ci.index <= i) { pair = { opening, close: i, end: i + ch.length }; break; }
            opening = null;
          }
        }
        escaped = ch === '\\' && !escaped;
        i += ch.length;
      }
      if (!pair) return false;
      let start = includeDelim ? pair.opening.index : pair.opening.index + pair.opening.width;
      let end = includeDelim ? pair.end : pair.close;
      if (includeWhitespace) {
        const originalEnd = end;
        while (end < lineEnd && /[ \t]/.test(text[end])) end++;
        if (end === originalEnd) while (start > lineStart && /[ \t]/.test(text[start - 1])) start--;
      }
      if (start > end || (start === end && !allowEmpty)) return false;
      const anchor = sel.anchorNode, anchorOffset = sel.anchorOffset;
      const focus = sel.focusNode, focusOffset = sel.focusOffset;
      let ok = false;
      try {
        ok = this.nav.setCaretIndex(start, false) && this.nav.setCaretIndex(end, true);
        return ok;
      } finally {
        if (!ok) { sel.collapse(anchor, anchorOffset); sel.extend(focus, focusOffset); }
      }
    }

    selectTextSpans(spans, index, around, count, allowPartial = false, sourceText = null) {
      if (!Number.isSafeInteger(count) || count < 1) return false;
      const first = spans.findIndex(span => span.start <= index && index < span.end);
      if (first < 0) return false;
      let last = first, completed = 0;
      for (; last < spans.length; last++) {
        if (!around || !spans[last].blank) completed++;
        if (completed === count) break;
      }
      if (last === spans.length) {
        if (!allowPartial || !completed) return false;
        last = spans.length - 1;
        if (!around && spans[last].blank && (count - completed) % 2 === 1) last--;
        if (last < first) return false;
      }
      let start = spans[first].emptyLine ? spans[first].end - 1 : spans[first].start;
      let end = spans[last].end;
      if (sourceText && spans[first].blank) start = Math.max(start, sourceText.lastIndexOf('\n', index - 1) + 1);
      if (around && !spans[first].blank) {
        if (spans[last + 1]?.blank && (!sourceText || /[ \t]/.test(sourceText.slice(spans[last + 1].start, spans[last + 1].end)))) end = spans[last + 1].end;
        else if (spans[first - 1]?.blank && !spans[first].emptyLine) {
          start = spans[first - 1].start;
          if (sourceText) {
            const newline = sourceText.indexOf('\n', start);
            if (newline >= start && newline < spans[first - 1].end) start = newline + 1;
          }
        }
      }
      const emptyLineEnd = spans[last].emptyLine || (spans[last].start === spans[last].end && spans[last - 1]?.emptyLine);
      if (sourceText && !emptyLineEnd) while (end > start && sourceText[end - 1] === '\n') end--;
      const { sel } = this.nav.getSelAndRange();
      if (!sel?.focusNode || start >= end) return false;
      const anchor = sel.anchorNode, anchorOffset = sel.anchorOffset;
      const focus = sel.focusNode, focusOffset = sel.focusOffset;
      let ok = false;
      try {
        ok = this.nav.setCaretIndex(start, false) && this.nav.setCaretIndex(end, true) && !sel.isCollapsed;
        return ok;
      } finally {
        if (!ok) { sel.collapse(anchor, anchorOffset); sel.extend(focus, focusOffset); }
      }
    }

    selectParagraph(around, count = 1) {
      const text = this.nav.extractDocumentText();
      const ci = this.nav.caretIndex();
      if (!text || text.length > 1000000 || !ci || ci.index < 0) return false;
      const spans = [];
      for (const match of text.matchAll(/[^\n]*\n|[^\n]+$/g)) {
        const blank = /^[ \t\r]*\n?$/.test(match[0]);
        const end = match.index + match[0].length;
        if (spans.length && spans.at(-1).blank === blank) spans.at(-1).end = end;
        else spans.push({ start: match.index, end, blank });
      }
      return this.selectTextSpans(spans, ci.index, around, count);
    }

    selectSentence(around, count = 1) {
      // The navigator adds a terminal block newline; it is not sentence text.
      const text = this.nav.extractDocumentText().replace(/\n$/, '');
      const ci = this.nav.caretIndex();
      if (!text || text.length > 1000000 || !ci || ci.index < 0) return false;
      const spans = [];
      const whitespace = /\s+/y;
      const boundary = /[.!?][)\]'"\u201d\u2019]*(?=\s|$)|\n[ \t]*\n/g;
      let cursor = 0;
      while (cursor < text.length) {
        whitespace.lastIndex = cursor;
        const gap = whitespace.exec(text);
        if (gap) {
          let start = cursor;
          for (let i = cursor; i < whitespace.lastIndex; i++) {
            if (text[i] !== '\n' || (i > 0 && text[i - 1] !== '\n')) continue;
            if (start < i) spans.push({ start, end: i, blank: true });
            // An empty line is itself a sentence. Its separator has zero
            // width, but still counts for an inner-sentence motion in Vim.
            if (spans.at(-2)?.emptyLine && spans.at(-1)?.end === i) {
              spans.at(-2).end = i + 1;
              spans.at(-1).start = i + 1;
              spans.at(-1).end = i + 1;
            } else {
              spans.push({ start: i, end: i + 1, blank: false, emptyLine: true });
              spans.push({ start: i + 1, end: i + 1, blank: true });
            }
            start = i + 1;
          }
          if (start < whitespace.lastIndex) {
            if (spans.at(-1)?.blank && spans.at(-1).end === start) spans.at(-1).end = whitespace.lastIndex;
            else spans.push({ start, end: whitespace.lastIndex, blank: true });
          }
          cursor = whitespace.lastIndex;
          continue;
        }
        boundary.lastIndex = cursor;
        const match = boundary.exec(text);
        const end = match ? (match[0][0] === '\n' ? match.index : boundary.lastIndex) : text.length;
        spans.push({ start: cursor, end, blank: false });
        cursor = end;
      }
      // Initial indentation belongs to the first sentence, not to a
      // preceding inter-sentence whitespace object.
      if (spans[0]?.blank && spans[1] && !text.slice(0, spans[0].end).includes('\n')) {
        spans[1].start = 0;
        spans.shift();
      }
      return this.selectTextSpans(spans, ci.index, around, count, true, text);
    }

    selectTag(around, count = 1, allowEmpty = false) {
      const text = this.nav.extractDocumentText();
      const ci = this.nav.caretIndex();
      if (!text || text.length > 1000000 || !ci || ci.index < 0 ||
          !Number.isSafeInteger(count) || count < 1) return false;
      // Match literal XML/HTML-like tags in document text, not editor DOM tags.
      // Quoted attribute values may contain >. Reject mismatched nesting.
      const tokens = /<(\/?)([A-Za-z][\w:-]*)(?=[\s/>])/g;
      const stack = [];
      let best = null;
      let enclosing = 0;
      let match;
      while ((match = tokens.exec(text))) {
        const closing = !!match[1], name = match[2];
        let cursor = tokens.lastIndex, quote = null;
        for (; cursor < text.length; cursor++) {
          const ch = text[cursor];
          if (quote) { if (ch === quote) quote = null; }
          else if (ch === '"' || ch === "'") quote = ch;
          else if (ch === '>' || ch === '<') break;
        }
        // Always advance past scanned text; malformed attributes cannot cause
        // repeated scans of the same suffix on large documents.
        tokens.lastIndex = cursor;
        if (cursor === text.length) break;
        if (text[cursor] !== '>') { stack.length = 0; continue; }
        const end = cursor + 1;
        tokens.lastIndex = end;
        const selfClosing = /\/\s*$/.test(text.slice(match.index, cursor));
        if (!closing && !selfClosing) stack.push({ name, start: match.index, inner: end });
        else if (closing) {
          const open = stack.pop();
          if (!open || open.name !== name) { stack.length = 0; continue; }
          // Nested pairs close inside-out, so the count chooses an ancestor.
          if (open.start <= ci.index && ci.index < end && ++enclosing === count) {
            best = { start: open.start, inner: open.inner, close: match.index, end };
            break;
          }
        }
      }
      if (!best) return false;
      const start = around ? best.start : best.inner;
      const end = around ? best.end : best.close;
      if (start > end || (start === end && !allowEmpty)) return false;
      const { sel } = this.nav.getSelAndRange();
      if (!sel?.focusNode) return false;
      const anchor = sel.anchorNode, anchorOffset = sel.anchorOffset;
      const focus = sel.focusNode, focusOffset = sel.focusOffset;
      let ok = false;
      try {
        ok = this.nav.setCaretIndex(start, false) && this.nav.setCaretIndex(end, true);
        return ok;
      } finally {
        if (!ok) { sel.collapse(anchor, anchorOffset); sel.extend(focus, focusOffset); }
      }
    }

    findEnclosingOpenDelta(open, close) {
      const { sel, range } = this.nav.getSelAndRange();
      if (!sel || !range) return null;
      sel.removeAllRanges();
      sel.addRange(range);
      let depth = 0;
      let i = 0;
      let prevLen = 0;
      for (let guard = 0; guard < this.nav.MAX_SCAN; guard++) {
        sel.modify("extend", "backward", "character");
        const s = sel.toString();
        const curLen = s.length || 0;
        if (curLen <= prevLen) break;
        const ch = s.slice(0, curLen - prevLen);
        i++;
        if (ch === close) depth++;
        else if (ch === open) {
          if (depth === 0) {
            sel.removeAllRanges();
            sel.addRange(range);
            return i;
          }
          depth--;
        }
        prevLen = curLen;
      }
      sel.removeAllRanges();
      sel.addRange(range);
      return null;
    }

    findMatchingCloseFromHere(open, close, includeDelims, startsAtOpen = includeDelims) {
      const { sel, range } = this.nav.getSelAndRange();
      if (!sel || !range) return null;
      sel.removeAllRanges();
      sel.addRange(range);
      let depth = 0;
      let i = 0;
      let prevLen = 0;
      for (let guard = 0; guard < this.nav.MAX_SCAN; guard++) {
        sel.modify("extend", "forward", "character");
        const s = sel.toString();
        const curLen = s.length || 0;
        if (curLen <= prevLen) break;
        const ch = s.slice(prevLen);
        i++;
        if (ch === open) depth++;
        else if (ch === close) {
          if (depth === 0 || (startsAtOpen && depth === 1)) {
            sel.removeAllRanges();
            sel.addRange(range);
            return includeDelims ? i : i - 1;
          }
          depth--;
        }
        prevLen = curLen;
      }
      sel.removeAllRanges();
      sel.addRange(range);
      return null;
    }

    selectWholeLines(count) {
      const toStart = this.nav.prevLineBoundaryDelta();
      if (toStart > 0) {
        Adapter.ctrlUp({});
      }
      Adapter.ctrlDown({ shift: true });
      if (count > 1) {
        repeat(count - 1, () => {
          Adapter.ctrlDown({ shift: true });
        });
      }
      this._lastSelType = "line";
    }

    exitStorageKey() {
      return 'vim_last_exit:' + location.pathname + ':' +
        (new URLSearchParams(location.search).get('tab') || '');
    }

    async hashText(text) {
      const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
      return Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('');
    }

    async resolveExitPosition(text, pos) {
      let match = -1;
      let candidates = 0;
      for (let start = 0; start < text.length;) {
        const newline = text.indexOf('\n', start);
        const end = newline < 0 ? text.length : newline;
        if (end - start === pos.length) {
          if (++candidates > 10000) throw new Error('Last-exit lookup exceeds the paragraph limit');
          const digest = await this.hashText(text.slice(start, end));
          this.assertActive();
          if (digest === pos.digest) {
            if (match >= 0) return -1;
            match = start;
          }
        }
        start = end + 1;
      }
      return match;
    }

    async _persistLastExit(pos) {
      const revision = this._exitSaveRevision = (this._exitSaveRevision || 0) + 1;
      try {
        const key = this.exitStorageKey();
        const text = this.nav.documentModel().text;
        const start = pos.index === 0 ? 0 : text.lastIndexOf('\n', pos.index - 1) + 1;
        const newline = text.indexOf('\n', pos.index);
        const end = newline < 0 ? text.length : newline;
        if (end - start > 1000000) return;
        const paragraph = text.slice(start, end);
        // A previously fingerprinted paragraph can be saved synchronously on
        // beforeunload; browsers need not finish new asynchronous work there.
        const digest = this._exitFingerprint?.text === paragraph
          ? this._exitFingerprint.digest : await this.hashText(paragraph);
        if (revision !== this._exitSaveRevision) return;
        this._exitFingerprint = { text: paragraph, digest };
        // Persist only a paragraph fingerprint and column, never document text.
        window.localStorage?.setItem(key, JSON.stringify({ version: 1, digest, length: end - start, column: pos.index - start }));
      } catch (_) {}
    }

    recordLastExit() { this._recordLastExit(); }

    _recordLastExit() {
      try {
        const pos = this.capturePosition();
        if (!pos) return;
        this._lastExitPos = pos;
        this._persistLastExit(pos);
      } catch (_) {}
    }

    async execCommand(id, result) {
      const count = result.count || 1;
      switch (id) {
        // Insert family
        case 'insert_text': {
          if (result.command && result.command.args && result.command.args.text) {
            await this.insertReplacementText(result.command.args.text);
          }
          return;
        }
        case 'insert_before': this.startInsert('insert_before', count); this.modeAPI.setMode('insert'); return;
        case 'insert_start_line':
        case 'append_end_line':
        case 'open_below':
        case 'open_above':
          this.startInsert(id, count);
          await this._replayInsertEntry(id, 1);
          this.modeAPI.setMode('insert');
          return;
        case 'append_after':
          this.startInsert('append_after', count);
          await this._replayInsertEntry('append_after', 1);
          this.modeAPI.setMode('insert');
          return;
        case "append_end_word": {
          this.startInsert("append_end_word", count);
          await this._replayInsertEntry('append_end_word', 1);
          this.modeAPI.setMode("insert");
          return;
        }
        case "insert_register": {
          const name =
            (result.command &&
              result.command.args &&
              result.command.args.char) ||
            '"';
          const textVal = this.getRegisterText(name);
          if (!textVal) return;
          await this.insertReplacementText(textVal);
          return;
        }

        case "insert_delete_char_back":
          if (this.modeAPI.getReplaceMode?.()) return this.replaceBackspace();
          Adapter.backspace({});
          return;
        case "insert_delete_word":
          await this.deletePreviousWord();
          return;
        case "insert_line_break":
          sendKeyEvent("enter", {});
          return;
        case "insert_indent":
          sendKeyEvent("tab", {});
          return;
        case "insert_dedent":
          sendKeyEvent("tab", { shift: true });
          return;
        case "insert_autocomplete_next":
        case "insert_autocomplete_prev":
          this.modeAPI.reportWarning?.('Unsupported: Google Docs has no Vim keyword completion');
          return;
        case "insert_temp_normal":
          return;

        // Replace / join / substitute / to EOL
        case "replace_char": {
          const ch =
            result.command && result.command.args && result.command.args.char;
          if (!ch) return;
          const times = Math.max(1, result.count || 1);
          if (!this.selectChars(times, 1, true)) {
            throw new Error('Not enough characters on this line to replace');
          }
          await this.insertReplacementText(ch.repeat(times));
          await sleep(20);
          this.assertActive();
          Adapter.left({});
          this.setLastChange({
            type: "command",
            id: "replace_char",
            count: times,
            args: { char: ch },
          });
          return;
        }
        case 'replace_mode': {
          if (this.modeAPI && typeof this.modeAPI.setReplaceMode === 'function') this.modeAPI.setReplaceMode(true);
          // Track the whole R session for '.' repeat; finishInsert on ESC will record ops.
          this.startInsert({ id: 'replace_mode', count, kind: 'replace' });
          this.modeAPI.setMode('insert');
          return;
        }
        case "join_lines":
        case "join_lines_no_space": {
          const times = Math.max(1, count - 1);
          let joined = false;
          for (let i = 0; i < times; i++) {
            if (!await this.joinOnce(id === 'join_lines')) break;
            joined = true;
          }
          // Store the requested line count, not the number of separators.
          if (joined) this.setLastChange({ type: 'command', id, count });
          return;
        }
        case 'substitute_char': {
          this.startInsert({ id: 'substitute_char', count, kind: 'change', register: result.register });
          await this.substituteChars(count, result.register);
          return;
        }
        case "insert_replace_char": {
          // Overwrite next character with provided char; if no char to the right or newline, insert instead.
          // Does NOT set _lastChange here; the entire R session is recorded at ESC via finishInsert.
          const ch = result.command && result.command.args && result.command.args.char;
          if (!ch || typeof ch !== 'string') return;
          const next = this.nav.peekRightCharN(1);
          const original = next != null && !this.nav.isNewline(next) ? next : '';
          const record = this.modeAPI.getReplaceMode?.();
          if (record && (this._replaceHistory.length >= 10000 ||
              this._replaceHistorySize + original.length + ch.length > 1000000)) {
            throw new Error('Replace restoration history exceeds safety limit');
          }
          if (next != null && !this.nav.isNewline(next)) {
            // Replace a selection in one edit. A separate Delete can race
            // the insertion and gives replay different newline semantics.
            if (!this.selectChars(1, 1, true)) {
              throw new Error('Replace selection unavailable; edit cancelled');
            }
          }
          await this.insertReplacementText(ch);
          // Docs may select the replacement text. R must advance past it,
          // otherwise the next character replaces the growing selection.
          this.nav.getSelAndRange().sel?.collapseToEnd();
          if (record) {
            this._replaceHistory.push({ original, inserted: ch });
            this._replaceHistorySize += original.length + ch.length;
            this.rememberReplaceCaret();
          }
          // remain in insert mode; replaceMode stays true until ESC handled by content script
          return;
        }
        case 'substitute_line': {
          this.startInsert({ id: 'substitute_line', count, kind: 'change', register: result.register });
          this.selectWholeLines(count);
          await this.applyOperator('change', result.register);
          return;
        }
        case 'change_to_eol': {
          this.startInsert({ id: 'change_to_eol', count, kind: 'change', register: result.register });
          if (!this.moveLogicalLineBoundary('line_end', count, true)) throw new Error('Line boundary unavailable');
          this._lastSelType = 'char';
          await this.applyOperator('change', result.register);
          return;
        }
        case "delete_to_eol": {
          if (!this.moveLogicalLineBoundary('line_end', count, true)) throw new Error('Line boundary unavailable');
          this._lastSelType = "char";
          await this.applyOperator("delete", result.register);
          this.setLastChange({ type: "command", id: "delete_to_eol", count, register: result.register });
          return;
        }
        case "yank_to_eol": {
          return this.execOperatorSelf({ operator: 'yank', count, register: result.register });
        }
        case "delete_char": {
          this._lastSelType = "char";
          if (!this.selectChars(count, 1)) return;
          await waitForDocsResponse();
          await this.applyOperator("delete", result.register);
          this.setLastChange({ type: "command", id: "delete_char", count, register: result.register });
          return;
        }
        case "delete_char_back": {
          this._lastSelType = "char";
          if (!this.selectChars(count, -1)) return;
          await waitForDocsResponse();
          await this.applyOperator("delete", result.register);
          this.setLastChange({
            type: "command",
            id: "delete_char_back",
            count,
            register: result.register,
          });
          return;
        }
        case "toggle_case_char": {
          this._lastSelType = "char";
          if (!this.selectChars(count, 1)) return;
          // Wait for selection extension to settle before toggling case.
          await waitForDocsResponse();
          if (!getSelectedText()) return;
          await this.applyOperator("toggle_case", result.register);
          // Advance after changed text, but keep the Normal cursor on a
          // character when the selection reached the end of its paragraph.
          await waitForDocsResponse();
          this.assertActive();
          const { sel } = this.nav.getSelAndRange();
          const model = this.nav.documentModel();
          const index = model.offset(sel?.focusNode, sel?.focusOffset);
          let target = index;
          if (index > 0 && (index === model.text.length || model.text[index] === '\n')) {
            const previous = this.nav.characterSegments(model.text).containing(index - 1);
            if (previous) target = previous.index;
          }
          if (target >= 0) this.nav.setCaretIndex(target, false);
          this.setLastChange({
            type: "command",
            id: "toggle_case_char",
            count,
          });
          return;
        }

        // Paste (uses internal registers; Docs-friendly insertion)
        case 'paste_after': { if (await this.pasteFromRegister(result.register, { before: false, times: count })) this.setLastChange({ type: 'command', id: 'paste_after', count, register: result.register }); return; }
        case 'paste_before': { if (await this.pasteFromRegister(result.register, { before: true, times: count })) this.setLastChange({ type: 'command', id: 'paste_before', count, register: result.register }); return; }
        case 'paste_after_cursor_stay': { if (await this.pasteFromRegister(result.register, { before: false, cursorStay: true, times: count })) this.setLastChange({ type: 'command', id: 'paste_after_cursor_stay', count, register: result.register }); return; }
        case 'paste_before_cursor_stay': { if (await this.pasteFromRegister(result.register, { before: true, cursorStay: true, times: count })) this.setLastChange({ type: 'command', id: 'paste_before_cursor_stay', count, register: result.register }); return; }
        case 'paste_adjust_indent': { if (await this.pasteFromRegister(result.register, { before: false, adjustIndent: true, times: count })) this.setLastChange({ type: 'command', id: 'paste_adjust_indent', count, register: result.register }); return; }

        // Number increment/decrement
        case "increment": {
          if (await this.incDecNumber(count)) this.setLastChange({ type: "command", id: "increment", count });
          return;
        }
        case "decrement": {
          if (await this.incDecNumber(-count)) this.setLastChange({ type: "command", id: "decrement", count });
          return;
        }

        // Undo/redo/repeat
        case "undo": {
          for (let i = 0; i < count; i++) {
            this.assertActive();
            await waitForDocsResponse({ action: () => clickMenu(MENU_ITEMS.undo), timeoutMs: 1000, requireResponse: true });
          }
          // Wait for the Docs undo to apply, then deselect any restored selection.
          await waitForDocsResponseLong();
          this.assertActive();
          Adapter.left({});
          await waitForDocsResponse();
          this.assertActive();
          Adapter.right({});
          return;
        }
        case "undo_line": {
          clickMenu(MENU_ITEMS.undo);
          await waitForDocsResponseLong();
          this.assertActive();
          Adapter.left({});
          await waitForDocsResponse();
          this.assertActive();
          Adapter.right({});
          return;
        }
        case "redo": {
          for (let i = 0; i < count; i++) {
            this.assertActive();
            await waitForDocsResponse({ action: () => clickMenu(MENU_ITEMS.redo), timeoutMs: 1000, requireResponse: true });
          }
          await waitForDocsResponseLong();
          this.assertActive();
          Adapter.left({});
          await waitForDocsResponse();
          this.assertActive();
          Adapter.right({});
          return;
        }
        case "repeat": {
          const override = result.countProvided ? count : undefined;
          await this.replayLastChange(override);
          return;
        }

        // Marks and jumps
        case "set_mark": {
          const ch =
            result.command && result.command.args && result.command.args.char;
          const pos = this.capturePosition();
          if (!ch || !pos) return;
          this.marks[ch] = pos;
          return;
        }
        case "jump_mark": {
          const ch =
            result.command && result.command.args && result.command.args.char;
          const m = ch && this.marks[ch];
          if (!m) return;
          this._recordJumpBeforeMove();
          return this.jumpToPosition(m);
        }
        case "jump_prev_pos": {
          if (!this._prevPos || this._prevPos.index == null) return;
          const dest = this._prevPos;
          this._recordJumpBeforeMove(); // update prev to current before move
          return this.jumpToPosition(dest);
        }
        case "jump_older": {
          return this.jumpHistory(-1);
        }
        case "jump_newer": {
          return this.jumpHistory(1);
        }
        case "change_prev":
        case "change_next": {
          const target = this._changeIdx + (id === 'change_prev' ? -1 : 1);
          if (target < 0 || target >= this._changeList.length) return false;
          this._recordJumpBeforeMove();
          if (!await this.jumpToPosition(this._changeList[target])) return false;
          this._changeIdx = target;
          return true;
        }
        case "jump_last_change": {
          if (!this._changeList || this._changeList.length === 0) return;
          this._recordJumpBeforeMove();
          const dest = this._changeList[this._changeList.length - 1];
          return this.jumpToPosition(dest);
        }
        case "jump_last_edit_pos": {
          if (!this._changeList || this._changeList.length === 0) return;
          this._recordJumpBeforeMove();
          const dest = this._changeList[this._changeList.length - 1];
          return this.jumpToPosition(dest);
        }
        case "jump_last_exit": {
          // Try in-memory mark first, then restore from storage
          if (!this._lastExitPos) {
            try {
              const key = this.exitStorageKey();
              const raw = window.localStorage
                ? window.localStorage.getItem(key)
                : null;
              if (raw) this._lastExitPos = JSON.parse(raw);
            } catch (_) {}
          }
          if (!this._lastExitPos) return;
          this._recordJumpBeforeMove();
          return this.jumpToPosition(this._lastExitPos);
        }

        case "record_last_exit": {
          this._recordLastExit();
          return;
        }

        case "search_forward":
        case "search_backward": {
          if (result.command?.args?.pattern != null) {
            return this.searchExec(result.command.args.pattern, id === 'search_backward' ? 'backward' : 'forward', { count });
          }
          const isMac = /Mac|iPod|iPhone|iPad/.test(navigator.platform);
          sendKeyEvent("f", isMac ? { meta: true } : { control: true });
          return;
        }

        case "search_next":
          return this.searchRepeat(count, this._lastSearch?.direction || 'forward');
        case "search_prev":
          return this.searchRepeat(count, this._lastSearch?.direction === 'backward' ? 'forward' : 'backward');
        case "search_word_forward":
          return this.searchWord('forward', count);
        case "search_word_backward":
          return this.searchWord('backward', count);

        // Visual modes and actions
        case "visual_mode": {
          const cm = this.modeAPI.getMode();
          if (cm === "visual") {
            this.snapshotVisual();
            this.collapseVisualCursor();
            this.modeAPI.setMode("normal");
          } else {
            this.modeAPI.setMode("visual");
            const { sel } = this.nav.getSelAndRange();
            if (sel?.isCollapsed) this.nav.moveRightBy(1, true);
          }
          return;
        }
        case "visual_line_mode": {
          const cm = this.modeAPI.getMode();
          if (cm === "visualLine") {
            this.snapshotVisual();
            const { sel } = this.nav.getSelAndRange();
            if (sel && sel.collapseToEnd) sel.collapseToEnd();
            this.modeAPI.setMode("normal");
            this.vlDisp = null;
          } else {
            this.modeAPI.setMode("visualLine");
            // Select current line
            Adapter.home({});
            Adapter.end({ shift: true });
            this.vlDisp = 0;
          }
          return;
        }
        case "visual_other_end": {
          const { sel } = this.nav.getSelAndRange();
          if (sel && sel.rangeCount) {
            try {
              const aN = sel.anchorNode,
                aO = sel.anchorOffset,
                fN = sel.focusNode,
                fO = sel.focusOffset;
              if (aN && fN && typeof sel.setBaseAndExtent === "function")
                sel.setBaseAndExtent(fN, fO, aN, aO);
            } catch (_) {}
          }
          return;
        }
        case "visual_yank": {
          this.snapshotVisual();
          this._lastSelType =
            this.modeAPI.getMode() === "visualLine" ? "line" : "char";
          await this.applyOperator("yank", result.register);
          this.modeAPI.setMode("normal");
          return;
        }
        case "visual_delete": {
          const snap = this.snapshotVisual();
          if (!snap) throw new Error('No visual selection; edit cancelled');
          this._lastSelType =
            this.modeAPI.getMode() === "visualLine" ? "line" : "char";
          await this.applyOperator("delete", result.register);
          this.recordVisualOp('delete', result.register, snap);
          this.modeAPI.setMode("normal");
          return;
        }
        case "visual_change": {
          const snap = this.snapshotVisual();
          if (!snap) throw new Error('No visual selection; edit cancelled');
          this.startInsert({ id: 'change_visual', kind: 'change', count: 1,
            register: result.register, visualMode: snap.mode, charCount: snap.charCount, lineCount: snap.lineCount });
          this._lastSelType =
            this.modeAPI.getMode() === "visualLine" ? "line" : "char";
          await this.applyOperator("change", result.register);
          /* applyOperator sets insert */ return;
        }
        case "visual_indent":
        case "visual_dedent":
        case "visual_toggle_case":
        case "visual_lowercase":
        case "visual_uppercase": {
          const snap = this.snapshotVisual();
          if (!snap) throw new Error('No visual selection; edit cancelled');
          const operator = id.slice('visual_'.length);
          const currentMode = this.modeAPI.getMode();
          this._lastSelType = currentMode === "visualLine" ? "line" : "char";
          await this.applyOperator(operator, result.register);
          this.recordVisualOp(operator, result.register, snap);
          this.modeAPI.setMode(operator === 'toggle_case' ? currentMode : 'normal');
          return;
        }

        // Exit modes
        case "exit_mode":
        case "exit_visual":
        case "exit_visual_ctrl_c":
        case "exit_insert":
        case "exit_insert_ctrl_c": {
          if (result.command?.args?.insertOps) await this.finishInsert(result.command.args.insertOps, id !== 'exit_insert_ctrl_c');
          if (this.modeAPI.isVisual()) {
            this.snapshotVisual();
            this.collapseVisualCursor();
          } else if (this.modeAPI.getMode() === 'insert') {
            this.collapseInsertCursor();
          } else {
            const { sel } = this.nav.getSelAndRange();
            if (sel && sel.collapseToEnd) sel.collapseToEnd();
          }
          this.modeAPI.setMode("normal");
          this.vlDisp = null;
          this._recordLastExit();
          return;
        }
        case "visual_reselect":
          this.restoreVisual();
          return;
        case "macro_record": {
          const ch = result.command?.args?.char;
          if (this._macroRecording) {
            this.stopMacro();
            return;
          }
          this.startMacro(ch);
          return;
        }
        case "macro_play": {
          const ch = result.command?.args?.char;
          await this.playMacro(ch, count);
          return;
        }
        case "macro_repeat":
          await this.playMacro(this._lastMacro, count);
          return;
        case "surround_delete":
          await this.surroundDelete(result.command?.args?.char);
          return;
        case "surround_change":
          await this.surroundChange(result.command?.args?.char, result.command?.args?.to);
          return;
        case "surround_word":
          await this.surroundWord(result.command?.args?.char, "word");
          return;
        case "surround_WORD":
          await this.surroundWord(result.command?.args?.char, "WORD");
          return;
        case "visual_surround":
          await this.surroundSelection(result.command?.args?.char);
          return;
        case "ex_command":
          this.execEx(result.command?.args?.line || "");
          return;

        // Searches / marks / jumps / inc-dec (stubs)
        default:
          if (id.startsWith("insert_")) return;
          if (id.startsWith("search_")) return this.stub("search");
          if (
            id.startsWith("set_mark") ||
            id.startsWith("jump_") ||
            id === "change_next" ||
            id === "change_prev"
          )
            return this.stub("marks_jumps");
          if (id === "increment" || id === "decrement")
            return this.stub("inc_dec");
          // Fallback: treat any 'exit_*' as exit mode
          if (id && id.startsWith && id.startsWith("exit_")) {
            const { sel } = this.nav.getSelAndRange();
            if (sel && sel.collapseToEnd) sel.collapseToEnd();
            this.modeAPI.setMode("normal");
            this.vlDisp = null;
            return;
          }
          return this.stub("command:" + id);
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

    shortcut(mods, keyCode, times = 1) {
      const doc = document;
      const editorIframe = document.querySelector(
        ".docs-texteventtarget-iframe",
      );
      const targetDoc = editorIframe?.contentDocument || document;
      repeat(times, () => {
        mods.forEach((m) =>
          targetDoc.dispatchEvent(
            new KeyboardEvent("keydown", { key: m, code: m, bubbles: true }),
          ),
        );
        targetDoc.dispatchEvent(
          new KeyboardEvent("keydown", {
            key: keyCode,
            code: keyCode,
            bubbles: true,
          }),
        );
        targetDoc.dispatchEvent(
          new KeyboardEvent("keyup", {
            key: keyCode,
            code: keyCode,
            bubbles: true,
          }),
        );
        mods
          .slice()
          .reverse()
          .forEach((m) =>
            targetDoc.dispatchEvent(
              new KeyboardEvent("keyup", { key: m, code: m, bubbles: true }),
            ),
          );
      });
    }

    async substituteChars(count, register) {
      this._lastSelType = 'char';
      if (this.selectChars(count, 1)) {
        await waitForDocsResponse();
        await this.applyOperator('change', register);
      } else {
        // On an empty line s enters Insert without deleting its separator.
        this.modeAPI.setMode('insert');
      }
    }

    selectChars(count, dir, requireFullCount = false) {
      const { sel } = this.nav.getSelAndRange();
      if (!sel?.isCollapsed || !sel.focusNode) return false;
      const model = this.nav.documentModel();
      const index = model.offset(sel.focusNode, sel.focusOffset);
      if (index < 0) return false;
      let target = index;
      let selectedCount = 0;
      if (dir > 0) {
        const newline = model.text.indexOf('\n', index);
        const end = newline < 0 ? model.text.length : newline;
        for (const { segment } of this.nav.characterSegments(model.text.slice(index, end))) {
          target += segment.length;
          if (++selectedCount >= count) break;
        }
      } else {
        const start = index === 0 ? 0 : model.text.lastIndexOf('\n', index - 1) + 1;
        const segments = this.nav.characterSegments(model.text.slice(start, index));
        for (let n = 0; n < count && target > start; n++) {
          target = start + segments.containing(target - start - 1).index;
          selectedCount++;
        }
      }
      // One bounded selection avoids racing asynchronous Docs arrow events.
      if (requireFullCount && selectedCount < count) return false;
      return target !== index && this.nav.setCaretIndex(target, true);
    }

    collapseInsertCursor() {
      const { sel } = this.nav.getSelAndRange();
      if (!sel?.rangeCount) return;
      sel.collapseToEnd();
      const previous = this.nav.peekLeftCharN(1);
      if (previous != null && !this.nav.isNewline(previous)) this.nav.moveLeftBy(1, false);
    }

    collapseVisualCursor() {
      const { sel, range } = this.nav.getSelAndRange();
      if (!sel?.focusNode || !range) return;
      const forward = !sel.isCollapsed && !(sel.focusNode === range.startContainer &&
        sel.focusOffset === range.startOffset);
      sel.collapse(sel.focusNode, sel.focusOffset);
      if (forward && this.modeAPI.getMode() === 'visual') this.nav.moveLeftBy(1, false);
    }

    async execVisualMotion(result) {
      const jumpId = result.motion && result.motion.id;
      const preserveAnchor = ['up', 'down', 'display_up', 'display_down',
        'first_line', 'last_line', 'paragraph_fwd', 'paragraph_back'].includes(jumpId);
      const { sel, range } = this.nav.getSelAndRange();
      if (!sel || !range) return false;
      const a = sel.anchorNode, ao = sel.anchorOffset;
      const f = sel.focusNode, fo = sel.focusOffset;
      const model = this.nav.documentModel();
      const start = model.offset(range.startContainer, range.startOffset);
      const end = model.offset(range.endContainer, range.endOffset);
      if (start < 0 || end < start) return false;
      const backward = !sel.isCollapsed && f === range.startContainer && fo === range.startOffset;
      let completed = false;
      try {
        // DOM ranges exclude the right endpoint; Vim visual cursors include it.
        if (!this.nav.setCaretIndex(end, false)) return false;
        if (end > start) this.nav.moveLeftBy(1, false);
        const last = this.nav.caretIndex().index;
        let anchor = backward ? last : start;
        if (preserveAnchor && !this.nav.setCaretIndex(anchor, false)) return false;
        if (!this.nav.setCaretIndex(backward ? start : last, preserveAnchor)) return false;
        await waitForDocsResponse();
        this.assertActive();
        if (!await this.execMotion(result.motion.id, result.count || 1, preserveAnchor,
            result.motion.args || {}, result)) return false;
        await waitForDocsResponse();
        this.assertActive();
        const current = this.nav.documentModel();
        if (!preserveAnchor && (current.root !== model.root || current.text !== model.text)) {
          // Never rebuild a destructive selection with offsets from a different window.
          // Motions without a retained native anchor cannot reuse old offsets.
          this.nav.getSelAndRange().sel?.collapseToEnd();
          this.modeAPI.setMode('normal');
          completed = true; // Do not restore endpoints from the stale window.
          throw new Error('Document text window changed; visual selection cancelled');
        }
        const currentSelection = this.nav.getSelAndRange().sel;
        const focus = current.offset(currentSelection?.focusNode, currentSelection?.focusOffset);
        if (preserveAnchor) anchor = current.offset(currentSelection?.anchorNode, currentSelection?.anchorOffset);
        if (focus < 0 || anchor < 0) return false;
        const lastIndex = Math.max(anchor, focus);
        const nextCharacter = this.nav.characterSegments(current.text.slice(lastIndex)).containing(0);
        const exclusiveEnd = lastIndex + (nextCharacter?.segment.length || 0);
        completed = this.nav.setCaretIndex(focus < anchor ? exclusiveEnd : anchor, false) &&
          this.nav.setCaretIndex(focus < anchor ? focus : exclusiveEnd, true);
        return completed;
      } finally {
        if (!completed && preserveAnchor) {
          this.nav.getSelAndRange().sel?.collapseToEnd();
          this.modeAPI.setMode('normal');
        } else if (!completed && a?.isConnected && f?.isConnected) { sel.collapse(a, ao); sel.extend(f, fo); }
      }
    }

    snapshotVisual() {
      const { sel, range } = this.nav.getSelAndRange();
      if (!sel || !range || sel.isCollapsed) return null;
      const saved = range.cloneRange();
      const text = sel.toString() || '';
      const mode = this.modeAPI.getMode();
      const anchor = sel.anchorNode, anchorOffset = sel.anchorOffset;
      const focus = sel.focusNode, focusOffset = sel.focusOffset;
      try {
        const charCount = this.nav.countCharacters(text);
        const backward = focus === range.startContainer && focusOffset === range.startOffset;
        range.collapse(true);
        sel.removeAllRanges();
        sel.addRange(range);
        const start = this.nav.caretIndex();
        const endRange = saved.cloneRange();
        endRange.collapse(false);
        sel.removeAllRanges();
        sel.addRange(endRange);
        const end = this.nav.caretIndex();
        sel.collapse(anchor, anchorOffset);
        sel.extend(focus, focusOffset);
        const doc = this.nav.extractDocumentText() || '';
        this._lastVisual = {
          startIndex: start && start.index >= 0 ? start.index : null,
          endIndex: end && end.index >= 0 ? end.index : null,
          backward,
          mode: mode === 'visualLine' ? 'visualLine' : 'visual',
          docLen: doc.length,
          docText: doc,
          charCount,
          lineCount: Math.max(1, text.replace(/\n$/, '').split(/\n/).length),
        };
        return this._lastVisual;
      } catch (_) {
        try { sel.collapse(anchor, anchorOffset); sel.extend(focus, focusOffset); } catch (_) {}
        return null;
      }
    }

    recordVisualOp(operator, register, snap) {
      this.setLastChange({
        type: 'visual_op',
        operator,
        register,
        visualMode: snap?.mode || this.modeAPI.getMode(),
        charCount: snap?.charCount || 1,
        lineCount: snap?.lineCount || 1,
      });
    }

    restoreVisual() {
      const v = this._lastVisual;
      if (!v || v.startIndex == null || v.endIndex == null) {
        this.modeAPI.reportWarning?.('No previous visual selection');
        return;
      }
      const doc = this.nav.extractDocumentText() || '';
      if (v.docText !== doc || v.startIndex > doc.length || v.endIndex > doc.length) {
        this.modeAPI.reportWarning?.('Previous selection is no longer valid');
        return;
      }
      const { sel } = this.nav.getSelAndRange();
      if (!sel?.focusNode) { this.modeAPI.reportWarning?.('Editor selection unavailable'); return; }
      const anchor = sel.anchorNode, anchorOffset = sel.anchorOffset;
      const focus = sel.focusNode, focusOffset = sel.focusOffset;
      if (!this.nav.setCaretIndex(v.backward ? v.endIndex : v.startIndex, false) ||
          !this.nav.setCaretIndex(v.backward ? v.startIndex : v.endIndex, true)) {
        sel.collapse(anchor, anchorOffset); sel.extend(focus, focusOffset);
        this.modeAPI.reportWarning?.('Previous selection could not be restored');
        return;
      }
      this.modeAPI.setMode(v.mode === 'visualLine' ? 'visualLine' : 'visual');
    }

    wordUnderCursor() {
      const { sel, range } = this.nav.getSelAndRange();
      if (!sel || !range) return '';
      const saved = range.cloneRange();
      const ok = this.selectWordLike('word', false);
      const text = ok ? (getSelectedText() || '') : '';
      try { sel.removeAllRanges(); sel.addRange(saved); } catch (_) {}
      return text;
    }

    searchExec(pattern, direction, opts = {}) {
      if (!pattern && this._lastSearch?.pattern) {
        pattern = this._lastSearch.pattern;
        opts = { ...opts, wholeWord: this._lastSearch.wholeWord };
      }
      if (!pattern) {
        this.modeAPI.reportWarning?.('No search pattern');
        return false;
      }
      this._lastSearch = { pattern, direction: direction === 'backward' ? 'backward' : 'forward', wholeWord: !!opts.wholeWord };
      return this.searchRepeat(opts.count || 1, this._lastSearch.direction);
    }

    searchWord(direction, count = 1) {
      const word = this.wordUnderCursor();
      if (!word) {
        this.modeAPI.reportWarning?.('No word under cursor');
        return false;
      }
      return this.searchExec(word, direction, { wholeWord: true, count });
    }

    async readSearchDocument() {
      this.assertActive();
      const initial = this.nav.getSelAndRange().sel;
      if (!initial?.focusNode) throw new Error('Search caret unavailable');
      const targets = [window, this.editorDoc()?.defaultView].filter(Boolean);
      const events = ['keydown', 'keypress', 'beforeinput', 'paste', 'cut', 'copy',
        'drop', 'pointerdown', 'mousedown', 'click', 'dblclick'];
      const guard = event => {
        if (!event.isTrusted) return;
        // Ordinary Vim keys still enter the existing command queue. Native
        // edits/shortcuts must never act on the temporary document selection.
        if (event.type === 'keydown' && !event.ctrlKey && !event.metaKey &&
            !event.altKey && !event.isComposing && event.key !== 'Dead' &&
            event.key !== 'Process' && this.modeAPI.isEnabled?.() !== false) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        this.requestCancel();
      };
      const release = () => {
        for (const target of targets) for (const event of events) target.removeEventListener?.(event, guard, true);
      };
      let index = null;
      let selectingAll = false;
      let complete = false;
      try {
        for (const target of targets) for (const event of events) target.addEventListener?.(event, guard, true);
        initial.collapse(initial.focusNode, initial.focusOffset);
        // Native document selections make Docs materialize the selected text,
        // including paragraphs outside its usual accessibility window.
        Adapter.ctrlHome({ shift: true });
        await waitForDocsResponse({ quietMs: 100, timeoutMs: 1000 });
        let sel = this.nav.getSelAndRange().sel;
        let model = this.nav.documentModel();
        if (!sel || model.offset(sel.focusNode, sel.focusOffset) !== 0) {
          throw new Error('Document start unavailable; search cancelled');
        }
        index = model.offset(sel.anchorNode, sel.anchorOffset);
        if (index < 0) throw new Error('Search position unavailable');
        this.assertActive();
        if (this.dialogIsBlocking()) throw new Error('A dialog interrupted search');
        sel.collapse(sel.focusNode, sel.focusOffset);
        await waitForDocsResponse();
        this.assertActive();
        if (this.dialogIsBlocking()) throw new Error('A dialog interrupted search');
        selectingAll = true;
        Adapter.ctrlEnd({ shift: true });
        await waitForDocsResponse({ quietMs: 100, timeoutMs: 1000 });
        model = this.nav.documentModel();
        this.assertActive();
        sel = this.nav.getSelAndRange().sel;
        if (!sel || model.offset(sel.anchorNode, sel.anchorOffset) !== 0 ||
            model.offset(sel.focusNode, sel.focusOffset) < model.text.length - 1) {
          throw new Error('Full document selection unavailable; search cancelled');
        }
        if (index > model.text.length || model.text.length > 1000000) {
          throw new Error('Document exceeds the search snapshot limit');
        }
        complete = true;
        return { text: model.text, index, release };
      } finally {
        // No query, failed query, and cancellation must not leave Select All
        // active where a subsequent native keystroke could replace the doc.
        if (!complete) {
          try {
            const model = this.nav.documentModel();
            const restored = index !== null && index >= 0 && index <= model.text.length &&
              this.nav.setCaretIndex(index, false);
            if (!restored) {
              const sel = this.nav.getSelAndRange().sel;
              if (selectingAll) sel?.collapseToStart();
              else sel?.collapseToEnd();
            }
          } finally { release(); }
        }
      }
    }

    async searchRepeat(count, direction) {
      const last = this._lastSearch;
      if (!last || !last.pattern) {
        this.modeAPI.reportWarning?.('No search pattern');
        return false;
      }
      const dir = direction || last.direction || 'forward';
      const { text, index, release } = await this.readSearchDocument();
      let target = index;
      try {
        if (typeof text !== 'string') throw new Error('Document text unavailable; search cancelled');
        const pat = last.pattern;
        const isWord = last.wholeWord;
        const isBoundary = (s, i, n) => {
          if (!isWord) return true;
          const before = i <= 0 ? '' : (Array.from(s.slice(Math.max(0, i - 2), i)).pop() || '');
          const after = Array.from(s.slice(i + n, i + n + 2))[0] || '';
          const wordy = ch => ch && this.nav.isWordChar(ch);
          return !wordy(before) && !wordy(after);
        };
        const matches = [];
        for (let at = text.indexOf(pat); at >= 0; at = text.indexOf(pat, at + 1)) {
          if (isBoundary(text, at, pat.length)) matches.push(at);
        }
        if (!matches.length) {
          this.modeAPI.reportWarning?.('Pattern not found');
          return false;
        }
        const steps = Math.max(1, count || 1) - 1;
        let ordinal;
        if (dir === 'forward') {
          ordinal = matches.findIndex(at => at > index);
          if (ordinal < 0) ordinal = 0;
          ordinal = (ordinal + steps) % matches.length;
        } else {
          ordinal = matches.findLastIndex(at => at < index);
          if (ordinal < 0) ordinal = matches.length - 1;
          ordinal = ((ordinal - steps) % matches.length + matches.length) % matches.length;
        }
        if (!this.nav.setCaretIndex(index, false)) throw new Error('Search position unavailable');
        this._recordJumpBeforeMove();
        target = matches[ordinal];
        return true;
      } finally {
        try {
          if (!this.nav.setCaretIndex(target, false)) {
            this.nav.getSelAndRange().sel?.collapseToStart();
            throw new Error('Search caret could not be restored');
          }
        } finally { release?.(); }
      }
    }

    surroundPair(ch) {
      if (!ch || Array.from(ch).length !== 1) return null;
      const map = {
        '(': { open: '(', close: ')' }, ')': { open: '(', close: ')' }, b: { open: '(', close: ')' },
        '[': { open: '[', close: ']' }, ']': { open: '[', close: ']' },
        '{': { open: '{', close: '}' }, '}': { open: '{', close: '}' }, B: { open: '{', close: '}' },
        '<': { open: '<', close: '>' }, '>': { open: '<', close: '>' },
        '"': { open: '"', close: '"', quote: true },
        "'": { open: "'", close: "'", quote: true },
        '`': { open: '`', close: '`', quote: true },
      };
      return map[ch] || { open: ch, close: ch, quote: true };
    }

    async surroundDelete(ch) {
      const pair = this.surroundPair(ch);
      if (!pair) {
        this.modeAPI.reportWarning?.('Unknown surround character');
        return;
      }
      const ok = pair.quote ? this.selectQuote(pair.open, true) : this.selectDelims(pair.open, pair.close, true);
      if (!ok) throw new Error('Surrounding pair not found');
      await this.replaceSurroundPair(pair, { open: '', close: '' });
      this.setLastChange({ type: 'command', id: 'surround_delete', args: { char: ch }, count: 1 });
    }

    async surroundChange(from, to) {
      if (!to) {
        this.modeAPI.reportWarning?.('Change-surround needs a replacement character');
        return;
      }
      const fp = this.surroundPair(from);
      const tp = this.surroundPair(to);
      if (!fp || !tp) {
        this.modeAPI.reportWarning?.('Unknown surround character');
        return;
      }
      const ok = fp.quote ? this.selectQuote(fp.open, true) : this.selectDelims(fp.open, fp.close, true);
      if (!ok) throw new Error('Surrounding pair not found');
      await this.replaceSurroundPair(fp, tp);
      this.setLastChange({ type: 'command', id: 'surround_change', args: { char: from, to }, count: 1 });
    }

    async replaceSurroundPair(from, to) {
      const { sel, range } = this.nav.getSelAndRange();
      if (!sel || !range || sel.isCollapsed) throw new Error('Surrounding pair not found');
      const model = this.nav.documentModel();
      const start = model.offset(range.startContainer, range.startOffset);
      const end = model.offset(range.endContainer, range.endOffset);
      const close = end - from.close.length;
      if (start < 0 || close < start + from.open.length ||
          !this.nav.setCaretIndex(close, false) || !this.nav.setCaretIndex(end, true)) {
        throw new Error('Surrounding pair unavailable');
      }
      await this.insertReplacementText(to.close);
      if (!this.nav.extractDocumentText().startsWith(model.text.slice(0, close)) ||
          !this.nav.setCaretIndex(start, false) ||
          !this.nav.setCaretIndex(start + from.open.length, true)) {
        throw new Error('Document changed during surround');
      }
      await this.insertReplacementText(to.open);
    }

    async surroundWord(ch, kind) {
      const pair = this.surroundPair(ch);
      if (!pair) {
        this.modeAPI.reportWarning?.('Unknown surround character');
        return;
      }
      if (!this.selectWordLike(kind, false)) throw new Error('No word under cursor');
      await this.insertSurroundPair(pair);
      this.setLastChange({ type: 'command', id: kind === 'WORD' ? 'surround_WORD' : 'surround_word', args: { char: ch }, count: 1 });
    }

    async surroundSelection(ch) {
      const pair = this.surroundPair(ch);
      if (!pair) {
        this.modeAPI.reportWarning?.('Unknown surround character');
        return;
      }
      const { sel } = this.nav.getSelAndRange();
      if (!sel || sel.isCollapsed) throw new Error('No text selected; edit cancelled');
      this.snapshotVisual();
      await this.insertSurroundPair(pair);
      this.modeAPI.setMode('normal');
      this.setLastChange({ type: 'command', id: 'visual_surround', args: { char: ch }, count: 1 });
    }

    async insertSurroundPair(pair) {
      const { sel, range } = this.nav.getSelAndRange();
      if (!sel || !range || sel.isCollapsed) throw new Error('No text selected; edit cancelled');
      const model = this.nav.documentModel();
      const start = model.offset(range.startContainer, range.startOffset);
      const end = model.offset(range.endContainer, range.endOffset);
      if (start < 0 || end <= start) throw new Error('Selection unavailable; edit cancelled');
      // Insert from right to left so the original start offset stays valid.
      // Do not reselect the word after inserting punctuation: Docs can leave
      // the caret before that punctuation, which would select the delimiter.
      sel.collapseToEnd();
      await this.insertReplacementText(pair.close);
      if (!this.nav.extractDocumentText().startsWith(model.text.slice(0, end)) ||
          !this.nav.setCaretIndex(start, false)) throw new Error('Document changed during surround');
      await this.insertReplacementText(pair.open);
    }

    startMacro(ch) {
      if (typeof ch !== 'string' || !/^[a-zA-Z0-9]$/.test(ch)) {
        this.modeAPI.reportWarning?.('Invalid macro register');
        return;
      }
      const name = ch.toLowerCase();
      this._macroBackup = this._macros[name]?.slice();
      this._macroRecording = name;
      if (ch === name || !this._macros[name]) this._macros[name] = [];
      this._macroSize = this._macros[name].reduce((size, command) => size + JSON.stringify(command).length, 0);
      this.modeAPI.reportWarning?.('recording @' + name);
    }

    stopMacro() {
      if (!this._macroRecording) return;
      this._lastMacro = this._macroRecording;
      this._macroRecording = null;
      this._macroBackup = undefined;
      this.modeAPI.reportWarning?.('macro recorded');
    }

    abortMacro(message) {
      const name = this._macroRecording;
      if (!name) return;
      if (this._macroBackup) this._macros[name] = this._macroBackup;
      else delete this._macros[name];
      this._macroRecording = null;
      this._macroBackup = undefined;
      this._macroSize = 0;
      this.modeAPI.reportWarning?.(message);
    }

    isRecordingMacro() { return !!this._macroRecording; }
    isPlayingMacro() { return this._macroDepth > 0; }

    recordMacro(result) {
      if (!this._macroRecording || !result || !result.kind) return;
      if (result.kind === 'prefix' || result.kind === 'await_char' || result.kind === 'invalid') return;
      const id = result.command && result.command.id;
      if (id === 'macro_record') return;
      const list = this._macros[this._macroRecording];
      if (!list) return;
      if (list.length >= 256) {
        this.abortMacro('Macro cancelled: exceeded 256 commands. Incomplete recording discarded.');
        throw new Error('Macro exceeded 256 commands; recording stopped');
      }
      const serialized = JSON.stringify(result);
      if (this._macroSize + serialized.length > 1000000) {
        this.abortMacro('Macro cancelled: exceeded the text limit. Incomplete recording discarded.');
        throw new Error('Macro exceeded the 1,000,000-character recording limit');
      }
      list.push(JSON.parse(serialized));
      this._macroSize += serialized.length;
    }

    async playMacro(ch, count = 1) {
      const name = !ch || ch === '@' ? this._lastMacro : String(ch).toLowerCase();
      const list = name && this._macros[name];
      if (!list || !list.length) {
        this.modeAPI.reportWarning?.('Macro register empty');
        return;
      }
      this._lastMacro = name;
      this._macroDepth += 1;
      if (this._macroDepth > 8) {
        this._macroDepth -= 1;
        throw new Error('Macro recursion limit exceeded');
      }
      try {
        for (let t = 0; t < Math.max(1, count || 1); t++) {
          for (const rec of list) {
            this.assertActive();
            this._macroExecs += 1;
            if (this._macroExecs > 1000) throw new Error('Macro exceeded 1000 executions');
            // Ctrl+O is handled by the input parser while recording. Preserve
            // its one-command mode transition when replaying parsed commands.
            if (rec.temporaryNormal) this.modeAPI.setMode('normal');
            await this.exec(rec);
            if (rec.temporaryNormal) this.modeAPI.setMode('insert');
          }
        }
      } finally {
        this._macroDepth -= 1;
        if (this._macroDepth === 0) this._macroExecs = 0;
      }
    }

    execEx(line) {
      const s = String(line || '').trim();
      if (!s) return;
      if (/^s(?:ubstitute)?(?:[\/#]|$)/i.test(s)) {
        this.modeAPI.reportWarning?.(':s is blocked: substitution would destroy Docs formatting');
        return;
      }
      if (s.length >= 3 && 'nohlsearch'.startsWith(s)) {
        // Search currently moves the caret without persistent highlighting.
        // Like Vim, :noh must retain the pattern and direction used by n/N.
        this.modeAPI.reportWarning?.('Search highlighting cleared');
        return;
      }
      if (/^reg/i.test(s)) {
        const names = Object.keys(this.registers).filter(k => {
          const r = this.registers[k];
          const text = !r ? '' : (typeof r === 'string' ? r : r.text || '');
          return !!text;
        });
        this.modeAPI.reportWarning?.('registers: ' + (names.join(' ') || '(empty)'));
        return;
      }
      if (/^marks?$/i.test(s)) {
        this.modeAPI.reportWarning?.('marks: ' + (Object.keys(this.marks).join(' ') || '(none)'));
        return;
      }
      this.modeAPI.reportWarning?.('Ex command not supported');
    }

    getRegisterText(name) {
      if (!name) return "";
      const dest = /^[A-Z]$/.test(name) ? name.toLowerCase() : name;
      const reg = this.registers[dest];
      if (reg == null) return "";
      return typeof reg === "string" ? reg : reg.text || "";
    }

    async pasteFromRegister(register, opts={}) {
      const name = (register && typeof register === 'string') ? register : '"';
      const lookup = /^[A-Z]$/.test(name) ? name.toLowerCase() : name;
      const reg = this.registers[lookup];
      const textVal = this.getRegisterText(name);
      if ((lookup === '+' || lookup === '*') && !textVal) {
        this.modeAPI.reportWarning?.('Clipboard read is not enabled; + and * are write-only');
        return false;
      }
      const kind =
        reg && typeof reg === "object" && reg.type ? reg.type : "char";
      if (!textVal) {
        this.modeAPI.reportWarning?.('Register empty');
        return false;
      }

      const nav = this.nav;
      const before = !!opts.before;
      const cursorStay = !!opts.cursorStay;
      const adjustIndent = !!opts.adjustIndent;
      const times = Math.max(1, opts.times || 1);
      // Check before String.repeat allocates memory or any caret movement occurs.
      if (!Number.isSafeInteger(times) || (textVal.length + (kind === 'line' ? 1 : 0)) * times > 1000000) {
        throw new Error('Paste exceeds the 1,000,000-character safety limit');
      }

      if (kind === "char") {
        // collapse non-collapsed selection at start/end
        const { sel, range } = nav.getSelAndRange();
        if (sel && range && !sel.isCollapsed) {
          range.collapse(before /* collapse at start for P, end for p */);
          sel.removeAllRanges();
          sel.addRange(range);
        }
        if (!before) {
          // Empty lines have no character to advance past.
          await this._replayInsertEntry('append_after', 1);
        }
        const payload = times > 1 ? textVal.repeat(times) : textVal;
        await this.insertReplacementText(payload);
        await sleep(20);
        this.assertActive();
        // gp/gP leave the cursor after the inserted text; p/P select its
        // final character. Never walk backwards by a UTF-16 string length.
        if (!cursorStay) nav.moveLeftBy(1, false);
        return true;
      }

      // linewise
      let unit = textVal;
      // normalize to end with a newline
      if (!unit.endsWith("\n")) unit = unit + "\n";
      if (adjustIndent) {
        const baseIndent = this.computeCurrentLineIndent();
        unit = this.indentBlock(unit, baseIndent);
      }
      if (unit.length * times + 1 > 1000000) {
        throw new Error('Adjusted paste exceeds the 1,000,000-character safety limit');
      }
      const repeated = times > 1 ? unit.repeat(times) : unit;
      const { sel: pasteSelection, range: pasteRange } = nav.getSelAndRange();
      const pasteElement = pasteSelection?.focusNode?.nodeType === Node.ELEMENT_NODE
        ? pasteSelection.focusNode : pasteSelection?.focusNode?.parentElement;
      const emptyCell = pasteElement?.closest('td, th');
      if (pasteRange && emptyCell && !emptyCell.textContent &&
          emptyCell.contains(pasteRange.startContainer) && emptyCell.contains(pasteRange.endContainer) &&
          emptyCell.querySelectorAll('p').length === 1 && !emptyCell.querySelector('table')) {
        // A table cell must retain a paragraph after dd. Reuse that placeholder
        // instead of inserting another empty paragraph above the pasted line.
        await this.insertReplacementText(repeated.slice(0, -1));
        await this.positionAfterLinePaste(repeated.split('\n').length - 1, false, cursorStay);
        return true;
      }
      // Screen-line Home/End split wrapped paragraphs. Resolve both put
      // directions against the same logical text used by j/k.
      const model = nav.documentModel();
      const index = model.offset(pasteSelection?.focusNode, pasteSelection?.focusOffset);
      if (index < 0) throw new Error('Paste position unavailable; paste cancelled');
      const nextBreak = model.text.indexOf('\n', index);
      const boundary = before ? (index === 0 ? 0 : model.text.lastIndexOf('\n', index - 1) + 1)
        : nextBreak < 0 ? model.text.length : nextBreak;
      if (!nav.setCaretIndex(boundary, false)) throw new Error('Paste boundary unavailable; paste cancelled');
      if (before) {
        await this.insertReplacementText(repeated);
      } else {
        // Move the register's final terminator to the front. Keeping it at
        // both ends creates an extra blank paragraph; blank registers still
        // need a leading boundary for each pasted line.
        const payload = "\n" + repeated.slice(0, -1);
        await this.insertReplacementText(payload);
      }
      await this.positionAfterLinePaste(repeated.split('\n').length - 1, before, cursorStay);
      return true;
    }

    async positionAfterLinePaste(lines, before, afterText) {
      if (afterText) {
        // P already ends at the following original paragraph. For p, cross
        // its final separator, or use the last pasted line's start at EOF.
        if (!before) {
          if (this.nav.peekRightCharN(1) != null) Adapter.right({});
          else Adapter.ctrlUp({});
        }
        return;
      }
      // Ctrl+Up follows paragraphs rather than wrapped screen lines.
      repeat(lines, () => Adapter.ctrlUp({}));
      await waitForDocsResponse();
      this.assertActive();
      const indent = this.nav.firstNonBlankForwardDelta();
      if (indent > 0) this.nav.moveRightBy(indent, false);
    }

    async deletePreviousWord() {
      const nav = this.nav;
      const distance = nav.prevStartDelta("word");
      if (distance <= 0) return;
      nav.moveLeftBy(distance, true);
      if (!getSelectedText()) return;
      await this.insertReplacementText("");
    }

    async incDecNumber(delta) {
      if (!Number.isSafeInteger(delta)) return false;
      const nav = this.nav;
      const { sel } = nav.getSelAndRange();
      if (!sel?.focusNode) return false;
      const model = nav.documentModel();
      const index = model.offset(sel.focusNode, sel.focusOffset);
      if (index < 0) return false;
      const text = model.text;
      let start = index;
      // Find a decimal number under the cursor or later on this line.
      while (start < text.length && text[start] !== '\n' && !/[0-9]/.test(text[start])) start++;
      if (start >= text.length || text[start] === '\n') return false;
      let end = start + 1;
      while (start > 0 && /[0-9]/.test(text[start - 1])) start--;
      while (end < text.length && /[0-9]/.test(text[end])) end++;
      const digits = text.slice(start, end);
      if (digits.length > nav.MAX_SCAN) throw new Error('Number exceeds the digit safety limit');
      if (start > 0 && text[start - 1] === '-') start--;
      const original = text.slice(start, end);
      const value = BigInt(original) + BigInt(delta);
      const magnitude = (value < 0n ? -value : value).toString();
      const out = (value < 0n ? '-' : '') +
        (digits.startsWith('0') ? magnitude.padStart(digits.length, '0') : magnitude);
      const anchor = sel.anchorNode, anchorOffset = sel.anchorOffset;
      const focus = sel.focusNode, focusOffset = sel.focusOffset;
      if (!nav.setCaretIndex(start, false) || !nav.setCaretIndex(end, true) ||
          this.getSelectedText() !== original) {
        sel.collapse(anchor, anchorOffset); sel.extend(focus, focusOffset);
        throw new Error('Number selection unavailable; edit cancelled');
      }
      await this.insertReplacementText(out);
      // Docs can place the post-replacement caret differently for signed text.
      // Reuse offsets only if the refreshed window matches the expected edit.
      const updated = nav.documentModel();
      if (updated.text !== text.slice(0, start) + out + text.slice(end) ||
          !nav.setCaretIndex(start + out.length - 1, false)) {
        this.modeAPI.reportWarning?.('Number changed; cursor position could not be restored.');
      }
      return true;
    }

    async insertReplacementText(replacement) {
      this.assertActive();
      if (this._editorDoc && (!this.editorIsWritable() || this.dialogIsBlocking())) {
        throw new Error('Editor is no longer writable or a dialog is open');
      }
      if (typeof replacement !== 'string' || replacement.length > 1000000) {
        throw new Error('Insertion exceeds the 1,000,000-character safety limit');
      }
      focusEditor();
      const iframe = document.querySelector(".docs-texteventtarget-iframe");
      const doc = iframe?.contentDocument;
      const target =
        doc && (doc.querySelector('[contenteditable="true"]') || doc.body);
      if (!target || !doc) {
        throw new Error('Docs editor unavailable; insertion cancelled');
      }
      if (this._editorDoc && doc !== this._editorDoc) {
        throw new Error('Docs editor changed during operation; queued commands stopped');
      }
      target.focus();
      // Docs applies accessibility selections asynchronously. Inserting in
      // the same turn can otherwise use the previous cursor/selection.
      await waitForDocsResponse({ observeMutations: false });
      this.assertActive();
      if (this._editorDoc && (!this.editorIsWritable() || this.dialogIsBlocking())) {
        throw new Error('Editor became unavailable before insertion');
      }
      let ev;
      try {
        const dt = new DataTransfer();
        dt.setData("text/plain", replacement);
        ev = new InputEvent("beforeinput", {
          inputType: "insertReplacementText",
          data: replacement,
          dataTransfer: dt,
          bubbles: true,
          cancelable: true,
        });
      } catch (_) {
        // Only fall back when event construction failed, never after an edit
        // might already have been applied (which could duplicate inserted text).
      }
      await waitForDocsResponse({
        timeoutMs: 1000,
        requireResponse: true,
        observeSelection: false,
        action: () => {
          if (ev) target.dispatchEvent(ev);
          else if (!doc.execCommand('insertText', false, replacement)) {
            throw new Error('Docs rejected text insertion');
          }
        },
      });
      this.pushChangePosition();
      this.assertActive();
    }

    stub(name) {
      try {
        if (window.__VIM_DEBUG__) console.warn("[VimExecutor] stub", name);
      } catch (_) {}
    }

    // Expose utilities
    getSelectionInfo() {
      return getIframeSelection();
    }
    getSelectedText() {
      return getSelectedText();
    }

    async joinOnce(withSpace) {
      this.assertActive();
      const { sel } = this.nav.getSelAndRange();
      if (!sel?.focusNode) return false;
      const anchor = sel.anchorNode, anchorOffset = sel.anchorOffset;
      const focus = sel.focusNode, focusOffset = sel.focusOffset;
      const model = this.nav.documentModel();
      const index = model.offset(sel.focusNode, sel.focusOffset);
      if (index < 0) return false;
      const start = model.text.indexOf('\n', index);
      if (start < 0 || start >= model.text.length - 1) return false;
      let end = start + 1;
      if (withSpace) while (/[\t \u00a0]/.test(model.text[end] || '') && end < model.text.length) end++;
      const left = model.text[start - 1], right = model.text[end];
      const space = withSpace && left && !this.nav.isWhitespace(left) &&
        right && !this.nav.isWhitespace(right) && right !== ')'
        ? (/[.!?]/.test(left) ? '  ' : ' ') : '';
      if (!this.nav.setCaretIndex(start, false) || !this.nav.setCaretIndex(end, true)) {
        sel.collapse(anchor, anchorOffset); sel.extend(focus, focusOffset);
        throw new Error('Join boundary unavailable');
      }
      const range = this.nav.getSelAndRange().range;
      const cell = node => (node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement)?.closest('td, th');
      if (!range || cell(range.startContainer) !== cell(range.endContainer)) {
        sel.collapse(anchor, anchorOffset); sel.extend(focus, focusOffset);
        throw new Error('Join cannot cross a table cell boundary');
      }
      await this.insertReplacementText(space);
      // J leaves the cursor at the original join, not at the next line end.
      this.nav.setCaretIndex(start, false);
      await waitForDocsResponse();
      this.assertActive();
      return true;
    }

    computeCurrentLineIndent() {
      const { sel } = this.nav.getSelAndRange();
      if (!sel?.focusNode) return '';
      const model = this.nav.documentModel();
      const index = model.offset(sel.focusNode, sel.focusOffset);
      if (index < 0) return '';
      const start = index === 0 ? 0 : model.text.lastIndexOf('\n', index - 1) + 1;
      let end = start;
      while (end < model.text.length && /[ \t\u00a0]/.test(model.text[end])) end++;
      return model.text.slice(start, end).replace(/\u00a0/g, ' ');
    }

    reflowString(text) {
      if (!text) return "";
      // Preserve paragraph breaks (>=2 newlines) and collapse intra-paragraph whitespace to single spaces
      const paras = text.split(/\n{2,}/);
      const out = paras
        .map((p) => p.replace(/[\t \r\n]+/g, " ").trim())
        .join("\n\n");
      return out;
    }

    indentBlock(text, indent) {
      const lines = text.split(/\r?\n/);
      for (let i = 0; i < lines.length; i++) {
        if (!lines[i]) continue;
        const trimmed = lines[i].replace(/^[\t ]+/, "");
        lines[i] = indent + trimmed;
      }
      return lines.join("\n");
    }
  }

  function createExecutor(modeAPI, settingsAPI) {
    return new MotionExecutor(modeAPI, settingsAPI);
  }

  window.createVimExecutor = createExecutor;
})();
