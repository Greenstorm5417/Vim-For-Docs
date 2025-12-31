(() => {
  const IS_BROWSER = typeof browser !== 'undefined';
  const API = IS_BROWSER ? browser : chrome;

  const PLACEHOLDER_CHAR = '*CHAR*';

  class TrieNode {
    constructor() { this.children = new Map(); this.meta = null; }
  }

  function keysToTokens(keys) {
    return keys.map(k => (k === '<char>' ? PLACEHOLDER_CHAR : k));
  }

  function insertTrie(root, keys, meta) {
    let node = root;
    for (const k of keysToTokens(keys)) {
      if (!node.children.has(k)) node.children.set(k, new TrieNode());
      node = node.children.get(k);
    }
    node.meta = meta;
  }

  function isDigitToken(t) { return t.length === 1 && /[0-9]/.test(t); }
  function isSingleCharToken(t) { return t.length === 1; }

  class VimMotionParser {
    constructor(config) {
      this.setConfig(config);
      this.reset();
      this.runtimeMode = 'normal';
    }

    setConfig(config) {
      this.config = config || {};
      this.settings = this.config.settings || {};
      this.motionsRoot = new TrieNode();
      this.operatorsRoot = new TrieNode();
      this.textObjectsRoot = new TrieNode();
      this.operatorSelfRoot = new TrieNode();
      // Separate command tries for each mode to avoid key collisions
      this.commandsRootByMode = {
        normal: new TrieNode(),
        visual: new TrieNode(),
        visualLine: new TrieNode(),
        insert: new TrieNode()
      };

      (this.config.motions || []).forEach(m => {
        insertTrie(this.motionsRoot, m.keys, { type: 'motion', id: m.id, acceptsCount: !!m.acceptsCount, args: m.args || [], countSemantic: m.countSemantic || null });
      });
      (this.config.operators || []).forEach(o => {
        insertTrie(this.operatorsRoot, o.keys, { type: 'operator', id: o.id, supportsCount: !!o.supportsCount, appliesTo: o.appliesTo || [] });
      });
      (this.config.textObjects || []).forEach(t => {
        insertTrie(this.textObjectsRoot, t.keys, { type: 'textobj', id: t.id, objType: t.type, delims: t.delims || null });
      });
      (this.config.operatorSelf || []).forEach(os => {
        insertTrie(this.operatorSelfRoot, os.keys, { type: 'operator_self', operator: os.operator, target: os.target });
      });
      (this.config.commands || []).forEach(c => {
        const modes = c.modes || ['normal'];
        const meta = { type: 'command', id: c.id, acceptsCount: !!c.acceptsCount, args: c.args || [], modes };
        // Insert into each mode's trie separately
        modes.forEach(mode => {
          if (this.commandsRootByMode[mode]) {
            insertTrie(this.commandsRootByMode[mode], c.keys, meta);
          }
        });
      });
    }

    setMode(mode) {
      this.runtimeMode = mode || 'normal';
      // Reset command node to use the correct mode's trie
      this.commandNode = this._getCommandRoot();
    }

    _getCommandRoot() {
      return this.commandsRootByMode[this.runtimeMode] || this.commandsRootByMode['normal'];
    }

    reset() {
      this.buffer = [];
      this.register = null;
      this.awaitRegister = false;
      this.countStr = '';
      this.opCountStr = '';
      this.operatorNode = this.operatorsRoot;
      this.motionNode = this.motionsRoot;
      this.textObjNode = this.textObjectsRoot;
      this.selfNode = this.operatorSelfRoot;
      this.commandNode = this._getCommandRoot();
      this.haveOperator = false;
      this.operatorMeta = null;
      this.awaitingCharFor = null;
      this.args = {};
    }

    feed(token) {
      const out = this._feed(token);
      return out;
    }

    _feed(token) {
      const settings = this.settings;
      if (this.awaitRegister) {
        if (isSingleCharToken(token)) {
          this.register = token; this.awaitRegister = false; this.buffer.push('"', token);
          return { kind: 'prefix', keys: [...this.buffer] };
        } else {
          this.reset();
          return { kind: 'invalid' };
        }
      }
      if (!this.buffer.length && settings.allowRegisterPrefix && token === '"') {
        this.awaitRegister = true; this.buffer.push(token);
        return { kind: 'prefix', keys: [...this.buffer] };
      }

      if (!this.haveOperator && !this.motionStarted() && !this.textObjectStarted() && !this.awaitingCharFor) {
        if (isDigitToken(token)) {
          if (token === '0' && this.countStr === '') {
            return this._stepGeneral(token);
          }
          this.countStr += token; this.buffer.push(token);
          return { kind: 'prefix', keys: [...this.buffer], count: this._countVal() };
        }
      }

      if (this.haveOperator && !this.motionStarted() && !this.textObjectStarted() && !this.awaitingCharFor) {
        if (isDigitToken(token)) {
          this.opCountStr += token; this.buffer.push(token);
          return { kind: 'prefix', keys: [...this.buffer], count: this._countVal(), opCount: this._opCountVal() };
        }
      }

      return this._stepGeneral(token);
    }

    motionStarted() { return this.motionNode !== this.motionsRoot; }
    textObjectStarted() { return this.textObjNode !== this.textObjectsRoot; }

    _stepGeneral(token) {
      this.buffer.push(token);
      let progressed = false;
      let awaitedChar = false;
      const awaitingMotionChar = this.awaitingCharFor === 'motion';

      // Consider commands when no operator or text object is in progress,
      // but do NOT consider commands if a motion is awaiting a char (e.g., after 'f').
      // This avoids '.' being interpreted as repeat instead of the awaited char.
      if (!this.haveOperator && !this.textObjectStarted() && this.awaitingCharFor !== 'motion') {
        const steppedCmd = this._stepCommandTrie(token);
        progressed = progressed || steppedCmd.progressed;
        awaitedChar = awaitedChar || steppedCmd.awaitedChar;
        // Prefer a command immediately if it is valid for the current runtime mode
        if (this.commandNode && this.commandNode.meta && this.commandNode.meta.type === 'command') {
          const meta = this.commandNode.meta;
          const modes = meta.modes || ['normal'];
          if (!this.haveOperator && modes.includes(this.runtimeMode)) {
            const res = { kind: 'command', command: { id: meta.id, args: { ...this.args }, modes: modes }, count: this._countVal(), register: this.register, keys: [...this.buffer] };
            this.reset();
            return res;
          }
        }
      }

      if (!this.haveOperator) {
        if (!awaitingMotionChar) {
          const nextOp = this.operatorNode.children.get(token);
          if (nextOp) {
            this.operatorNode = nextOp; progressed = true;
            if (nextOp.meta && nextOp.meta.type === 'operator') {
              this.haveOperator = true; this.operatorMeta = nextOp.meta;
              this.motionNode = this.motionsRoot; this.textObjNode = this.textObjectsRoot;
              const selfStep = this._stepSelfTrie(token, true);
              progressed = progressed || selfStep.progressed;
            }
          } else {
            this.operatorNode = this.operatorsRoot;
          }
        }
      } else {
        if (!awaitingMotionChar) {
          const selfStep = this._stepSelfTrie(token, false);
          progressed = progressed || selfStep.progressed;
        }
      }

      const steppedMotion = this._stepMotionTrie(token);
      progressed = progressed || steppedMotion.progressed;
      awaitedChar = awaitedChar || steppedMotion.awaitedChar;

      const allowTextObj = this.haveOperator || (this.runtimeMode === 'visual' || this.runtimeMode === 'visualLine');
      const steppedText = allowTextObj ? this._stepTextObjTrie(token) : { progressed: false };
      progressed = progressed || steppedText.progressed;

      if (!progressed) {
        const result = { kind: 'invalid' };
        this.reset();
        return result;
      }

      if (awaitedChar) {
        return { kind: 'await_char', keys: [...this.buffer], operator: this._opInfo() };
      }

      // Check for complete command (block only if operator or text object context is active).
      // This permits command completion even if a motion prefix exists (e.g., 'g').
      if (!this.haveOperator && !this.textObjectStarted() && this.commandNode && this.commandNode.meta && this.commandNode.meta.type === 'command') {
        const meta = this.commandNode.meta;
        const res = { kind: 'command', command: { id: meta.id, args: { ...this.args }, modes: meta.modes }, count: this._countVal(), register: this.register, keys: [...this.buffer] };
        this.reset();
        return res;
      }

      if (this.selfNode && this.selfNode.meta && this.haveOperator) {
        const res = { kind: 'operator_self', operator: this.operatorMeta.id, target: this.selfNode.meta.target, count: this._countVal(), opCount: this._opCountVal(), register: this.register, keys: [...this.buffer] };
        this.reset();
        return res;
      }

      if (!this.haveOperator && allowTextObj && this.textObjNode && this.textObjNode.meta && this.textObjNode.meta.type === 'textobj') {
        const meta = this.textObjNode.meta;
        const res = { kind: 'visual_textobj', textobj: { id: meta.id, type: meta.objType, delims: meta.delims }, count: this._countVal(), keys: [...this.buffer] };
        this.reset();
        return res;
      }

      if (this.haveOperator && this.textObjNode && this.textObjNode.meta && this.textObjNode.meta.type === 'textobj') {
        const meta = this.textObjNode.meta;
        const res = { kind: 'operator_textobj', operator: this.operatorMeta.id, textobj: { id: meta.id, type: meta.objType, delims: meta.delims }, count: this._countVal(), opCount: this._opCountVal(), register: this.register, keys: [...this.buffer] };
        this.reset();
        return res;
      }

      if (this.motionNode && this.motionNode.meta && this.motionNode.meta.type === 'motion' && !this.haveOperator) {
        const meta = this.motionNode.meta;
        const res = { kind: 'motion', motion: { id: meta.id, args: { ...this.args } }, count: this._countVal(), countSemantic: meta.countSemantic || null, register: this.register, keys: [...this.buffer] };
        this.reset();
        return res;
      }

      if (this.motionNode && this.motionNode.meta && this.motionNode.meta.type === 'motion' && this.haveOperator) {
        const meta = this.motionNode.meta;
        const res = { kind: 'operator_motion', operator: this.operatorMeta.id, motion: { id: meta.id, args: { ...this.args } }, count: this._countVal(), opCount: this._opCountVal(), register: this.register, keys: [...this.buffer] };
        this.reset();
        return res;
      }

      return { kind: 'prefix', keys: [...this.buffer], operator: this._opInfo(), count: this._countVal(), opCount: this._opCountVal() };
    }

    _stepSelfTrie(token, includeStart) {
      const base = includeStart ? this.operatorSelfRoot : (this.selfNode || this.operatorSelfRoot);
      const next = base.children.get(token);
      if (next) { this.selfNode = next; return { progressed: true }; }
      return { progressed: false };
    }

    _stepMotionTrie(token) {
      let progressed = false; let awaitedChar = false;
      const tryStep = (node, t) => node ? node.children.get(t) : null;
      let next = tryStep(this.motionNode, token);
      if (!next && this.motionNode && this.motionNode.children.has(PLACEHOLDER_CHAR) && isSingleCharToken(token)) {
        next = this.motionNode.children.get(PLACEHOLDER_CHAR); this.args.char = token;
      }
      if (!next) {
        next = this.motionsRoot.children.get(token);
        if (!next && this.motionsRoot.children.has(PLACEHOLDER_CHAR) && isSingleCharToken(token)) {
          next = this.motionsRoot.children.get(PLACEHOLDER_CHAR); this.args.char = token;
        }
      }
      if (next) { this.motionNode = next; progressed = true; }
      if (this.motionNode && !this.motionNode.meta && this.motionNode.children.has(PLACEHOLDER_CHAR)) {
        this.awaitingCharFor = 'motion'; awaitedChar = true;
      }
      return { progressed, awaitedChar };
    }

    _stepTextObjTrie(token) {
      let progressed = false;
      const tryStep = (node, t) => node ? node.children.get(t) : null;
      let next = tryStep(this.textObjNode, token);
      if (!next) next = this.textObjectsRoot.children.get(token);
      if (next) { this.textObjNode = next; progressed = true; }
      return { progressed };
    }

    _stepCommandTrie(token) {
      let progressed = false; let awaitedChar = false;
      const tryStep = (node, t) => node ? node.children.get(t) : null;
      let next = tryStep(this.commandNode, token);
      if (!next && this.commandNode && this.commandNode.children.has(PLACEHOLDER_CHAR) && isSingleCharToken(token)) {
        next = this.commandNode.children.get(PLACEHOLDER_CHAR); this.args.char = token;
      }
      if (!next) {
        const commandRoot = this._getCommandRoot();
        next = commandRoot.children.get(token);
        if (!next && commandRoot.children.has(PLACEHOLDER_CHAR) && isSingleCharToken(token)) {
          next = commandRoot.children.get(PLACEHOLDER_CHAR); this.args.char = token;
        }
      }
      if (next) { this.commandNode = next; progressed = true; }
      if (this.commandNode && !this.commandNode.meta && this.commandNode.children.has(PLACEHOLDER_CHAR)) {
        this.awaitingCharFor = 'command'; awaitedChar = true;
      }
      return { progressed, awaitedChar };
    }

    _countVal() { return this.countStr ? parseInt(this.countStr, 10) : 1; }
    _opCountVal() { return this.opCountStr ? parseInt(this.opCountStr, 10) : undefined; }
    _opInfo() { return this.haveOperator ? { id: this.operatorMeta.id } : null; }
  }

  async function loadMotionsConfig() {
    const url = API.runtime.getURL('motions.json');
    const res = await fetch(url, { cache: 'no-cache' });
    return res.json();
  }

  window.VimMotionParser = VimMotionParser;
  window.loadVimMotionsConfig = loadMotionsConfig;
})();
