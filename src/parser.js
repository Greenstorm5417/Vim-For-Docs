(() => {
  const IS_BROWSER = typeof browser !== 'undefined';
  const API = IS_BROWSER ? browser : chrome;

  const PLACEHOLDER_CHAR = '*CHAR*';

  class TrieNode {
    constructor() { this.children = new Map(); this.meta = null; }
  }

  function keysToTokens(keys) {
    return keys.map(k => (k === '<char>' ? PLACEHOLDER_CHAR : window.VimConfig.normalizeToken(k)));
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
  function isSingleCharToken(t) { return t === '<SPACE>' || (typeof t === 'string' && Array.from(t).length === 1); }
  function literalChar(token) { return token === '<SPACE>' ? ' ' : token; }

  class VimMotionParser {
    constructor(config) {
      this.setConfig(config);
      this.reset();
      this.runtimeMode = 'normal';
    }

    setConfig(config) {
      const error = window.VimConfig.validate(config);
      if (error) throw new Error(error);
      this.config = config || {};
      this.settings = window.VimConfig.normalizeSettings(this.config.settings);
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
      this.reset();
    }

    // True if `token` can start a mapping in the current runtime mode.
    // Insert mode only consults insert commands so hjkl/i/a still type.
    isBinding(token) {
      if (!token) return false;
      token = this.settings.tokenAliases?.[token] || token;
      if (this.runtimeMode === 'insert') {
        const root = this._getCommandRoot();
        return !!(root && root.children.has(token));
      }
      if (this.settings.allowRegisterPrefix && token === this.settings.registerPrefix &&
          !this.haveOperator && !this.mappingStarted && !this.awaitingCharFor && this.register == null) return true;
      const roots = [
        this.motionsRoot,
        this._getCommandRoot(),
        this.operatorsRoot,
        this.operatorSelfRoot,
        this.textObjectsRoot
      ];
      return roots.some((r) => r && r.children.has(token));
    }

    isPending() {
      return !!(this.awaitingCharFor || this.awaitRegister || this.haveOperator || (this.buffer && this.buffer.length));
    }

    canContinue(token) {
      if (!token || !this.isPending()) return false;
      token = this.settings.tokenAliases?.[token] || token;
      const nodes = this.runtimeMode === 'insert' ? [this.commandNode] :
        [this.commandNode, this.motionNode, this.textObjNode, this.selfNode, this.operatorNode];
      return nodes.some(node => node && (node.children.has(token) ||
        (isSingleCharToken(token) && node.children.has(PLACEHOLDER_CHAR))));
    }

    isCancel(token) {
      return this.settings.cancelTokens.includes(this.settings.tokenAliases?.[token] || token);
    }

    // Bounded hint for the status bar: pending keys/count/register and next tokens.
    hint() {
      const next = [];
      const addNode = node => {
        if (!node || next.length >= 20) return;
        for (const key of node.children.keys()) {
          const token = key === PLACEHOLDER_CHAR ? '<char>' : key;
          if (!next.includes(token)) next.push(token);
          if (next.length >= 20) return;
        }
      };
      if (this.awaitRegister) {
        return { keys: [...this.buffer], register: this.register, count: this._countVal(), next: ['<char>'], awaiting: 'register' };
      }
      if (this.awaitingCharFor) {
        return { keys: [...this.buffer], register: this.register, count: this._countVal(), next: ['<char>'], awaiting: this.awaitingCharFor };
      }
      if (this.runtimeMode === 'insert') addNode(this.commandNode);
      else {
        addNode(this.commandNode);
        addNode(this.motionNode);
        addNode(this.operatorNode);
        addNode(this.selfNode);
        addNode(this.textObjNode);
      }
      return {
        keys: [...this.buffer],
        register: this.register,
        count: this._countVal(),
        opCount: this._opCountVal(),
        next,
        awaiting: this.haveOperator ? 'motion' : (this.buffer.length ? 'command' : null),
      };
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
      this.mappingStarted = false;
    }

    feed(token) {
      token = this.settings.tokenAliases?.[token] || token;
      const out = this._feed(token);
      // Bound synchronous loops and text expansion, including multiplied counts.
      const total = out.countSemantic ? out.count : (out.count || 1) * (out.opCount || 1);
      if (!Number.isFinite(total) || total > 10000) {
        this.reset();
        return { kind: 'invalid', reason: 'Count exceeds 10000' };
      }
      return out;
    }

    _feed(token) {
      if (this.runtimeMode === 'insert') return this._feedInsert(token);
      const settings = this.settings;
      if (this.awaitRegister) {
        if (isSingleCharToken(token)) {
          this.register = token; this.awaitRegister = false; this.buffer.push(token);
          return { kind: 'prefix', keys: [...this.buffer] };
        } else {
          this.reset();
          return { kind: 'invalid' };
        }
      }
      if (!this.haveOperator && !this.mappingStarted && !this.awaitingCharFor &&
          this.register == null && settings.allowRegisterPrefix && token === (settings.registerPrefix || '"')) {
        this.awaitRegister = true; this.buffer.push(token);
        return { kind: 'prefix', keys: [...this.buffer] };
      }

      if (settings.allowCountPrefix !== false && !this.haveOperator && !this.mappingStarted && !this.awaitingCharFor) {
        if (isDigitToken(token)) {
          if (token === '0' && this.countStr === '') {
            return this._stepGeneral(token);
          }
          this.countStr += token; this.buffer.push(token);
          return { kind: 'prefix', keys: [...this.buffer], count: this._countVal() };
        }
      }

      if (settings.allowCountPrefix !== false && this.haveOperator && !this.mappingStarted && !this.awaitingCharFor) {
        if (isDigitToken(token)) {
          if (token === '0' && this.opCountStr === '') return this._stepGeneral(token);
          this.opCountStr += token; this.buffer.push(token);
          return { kind: 'prefix', keys: [...this.buffer], count: this._countVal(), opCount: this._opCountVal() };
        }
      }

      return this._stepGeneral(token);
    }

    _feedInsert(token) {
      this.buffer.push(token);
      const steppedCmd = this._stepCommandTrie(token);
      if (steppedCmd.awaitedChar) {
        return { kind: 'await_char', keys: [...this.buffer] };
      }
      if (this.commandNode && this.commandNode.meta && this.commandNode.meta.type === 'command') {
        const meta = this.commandNode.meta;
        const res = { kind: 'command', command: { id: meta.id, args: { ...this.args }, modes: meta.modes || ['insert'] }, count: this._countVal(), countProvided: !!this.countStr, register: this.register, keys: [...this.buffer] };
        this.reset();
        return res;
      }
      if (!steppedCmd.progressed) {
        this.reset();
        return { kind: 'invalid' };
      }
      return { kind: 'prefix', keys: [...this.buffer] };
    }

    motionStarted() { return !!this.motionNode && this.motionNode !== this.motionsRoot; }
    textObjectStarted() { return !!this.textObjNode && this.textObjNode !== this.textObjectsRoot; }

    _stepGeneral(token) {
      this.buffer.push(token);
      this.mappingStarted = true;
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
            const res = { kind: 'command', command: { id: meta.id, args: { ...this.args }, modes: modes }, count: this._countVal(), countProvided: !!this.countStr, register: this.register, keys: [...this.buffer] };
            this.reset();
            return res;
          }
        }
      }

      const selfStep = this._stepSelfTrie(token);
      progressed = progressed || selfStep.progressed;
      if (this.selfNode && this.selfNode.meta) {
        const meta = this.selfNode.meta;
        const res = { kind: 'operator_self', operator: meta.operator, target: meta.target, count: this._countVal(), opCount: this._opCountVal(), register: this.register, keys: [...this.buffer] };
        this.reset();
        return res;
      }

      if (!this.haveOperator) {
        if (!awaitingMotionChar) {
          const nextOp = this.operatorNode && this.operatorNode.children.get(token);
          if (nextOp) {
            this.operatorNode = nextOp; progressed = true;
            if (nextOp.meta && nextOp.meta.type === 'operator') {
              this.haveOperator = true; this.operatorMeta = nextOp.meta;
              this.motionNode = this.motionsRoot; this.textObjNode = this.textObjectsRoot;
              this.mappingStarted = false;
              // The final operator key belongs to the operator, not its motion.
              return { kind: 'prefix', keys: [...this.buffer], operator: this._opInfo(), count: this._countVal() };
            }
          } else {
            this.operatorNode = null;
          }
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
        const res = { kind: 'command', command: { id: meta.id, args: { ...this.args }, modes: meta.modes }, count: this._countVal(), countProvided: !!this.countStr, register: this.register, keys: [...this.buffer] };
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
        const res = { kind: 'motion', motion: { id: meta.id, args: { ...this.args } }, count: this._countVal(), countSemantic: meta.countSemantic || null, countProvided: !!this.countStr, register: this.register, keys: [...this.buffer] };
        this.reset();
        return res;
      }

      if (this.motionNode && this.motionNode.meta && this.motionNode.meta.type === 'motion' && this.haveOperator) {
        const meta = this.motionNode.meta;
        const res = { kind: 'operator_motion', operator: this.operatorMeta.id, motion: { id: meta.id, args: { ...this.args } }, count: this._countVal(), opCount: this._opCountVal(), countProvided: !!(this.countStr || this.opCountStr), countSemantic: meta.countSemantic || null, register: this.register, keys: [...this.buffer] };
        this.reset();
        return res;
      }

      return { kind: 'prefix', keys: [...this.buffer], operator: this._opInfo(), count: this._countVal(), opCount: this._opCountVal() };
    }

    _stepSelfTrie(token) {
      const next = this.selfNode && this.selfNode.children.get(token);
      this.selfNode = next || null;
      if (next) { this.selfNode = next; return { progressed: true }; }
      return { progressed: false };
    }

    _stepMotionTrie(token) {
      let progressed = false; let awaitedChar = false;
      const tryStep = (node, t) => node ? node.children.get(t) : null;

      // A placeholder node represents a completed f/t/F/T prefix that is
      // waiting for exactly one literal character. Consume that character
      // here; it is not a second trie key.
      if (this.awaitingCharFor === 'motion' && this.motionNode && this.motionNode.children.has(PLACEHOLDER_CHAR)) {
        if (isSingleCharToken(token)) {
          this.motionNode = this.motionNode.children.get(PLACEHOLDER_CHAR);
          this.args.char = literalChar(token);
          this.awaitingCharFor = null;
          return { progressed: true, awaitedChar: false };
        }
        return { progressed: false, awaitedChar: false };
      }

      let next = tryStep(this.motionNode, token);
      if (!next && this.motionNode && this.motionNode.children.has(PLACEHOLDER_CHAR) && isSingleCharToken(token)) {
        next = this.motionNode.children.get(PLACEHOLDER_CHAR); this.args.char = literalChar(token);
      }
      if (!next) this.motionNode = null;
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
      if (!next) this.textObjNode = null;
      if (next) { this.textObjNode = next; progressed = true; }
      return { progressed };
    }

    _stepCommandTrie(token) {
      let progressed = false; let awaitedChar = false;
      const tryStep = (node, t) => node ? node.children.get(t) : null;

      if (this.awaitingCharFor === 'command' && this.commandNode && this.commandNode.children.has(PLACEHOLDER_CHAR)) {
        if (isSingleCharToken(token)) {
          const exact = this.commandNode.children.get(token);
          this.commandNode = exact || this.commandNode.children.get(PLACEHOLDER_CHAR);
          if (!exact) this.args.char = literalChar(token);
          this.awaitingCharFor = null;
          return { progressed: true, awaitedChar: false };
        }
        return { progressed: false, awaitedChar: false };
      }

      let next = tryStep(this.commandNode, token);
      if (!next && this.commandNode && this.commandNode.children.has(PLACEHOLDER_CHAR) && isSingleCharToken(token)) {
        next = this.commandNode.children.get(PLACEHOLDER_CHAR); this.args.char = literalChar(token);
      }
      if (!next) this.commandNode = null;
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
    if (!res.ok) throw new Error('Could not load bundled motions configuration');
    return res.json();
  }

  window.VimMotionParser = VimMotionParser;
  window.loadVimMotionsConfig = loadMotionsConfig;
})();
