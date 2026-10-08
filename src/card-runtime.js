(() => {
  const owner = window.parent?.__FawnCard ? window.parent : window;
  const engine = window.FawnVariableEngine;
  const clone = value => engine.clone(value);
  const context = () => JSON.parse(FTCardHost.getContext());
  const report = error => window.toastr.error(String(error?.message || error));

  function createShared() {
    const state = { snapshot: null, scopes: {}, events: new Map(), globals: new Map(), waiters: new Map(), pending: new Map(), queue: Promise.resolve() };
    state.emit = async (name, ...args) => {
      for (const record of [...(state.events.get(name) || [])]) {
        if (record.once) state.events.get(name).delete(record);
        await record.listener(...args);
      }
    };
    state.call = (method, params = {}) => new Promise((resolve, reject) => {
      const id = 'card-' + crypto.randomUUID();
      const timer = setTimeout(() => { state.pending.delete(id); reject(new Error('宿主调用超时: ' + method)); }, 15000);
      state.pending.set(id, { resolve, reject, timer });
      FTCardHost.postMessage(JSON.stringify({ id, method, params }));
    });
    window.addEventListener('fawntavern:response', event => {
      const response = event.detail;
      const pending = state.pending.get(response.id);
      if (!pending) return;
      clearTimeout(pending.timer);
      state.pending.delete(response.id);
      if (response.ok) pending.resolve(response.value);
      else pending.reject(new Error(response.error));
    });
    state.refresh = async () => {
      if (context().hostCallsAllowed === false) return;
      const snapshot = await state.call('variables.snapshot', { messageId: context().messageId });
      const before = state.scopes.message;
      state.snapshot = snapshot;
      for (const scope of ['global', 'character', 'chat', 'previous', 'message']) {
        state.scopes[scope] = Object.fromEntries(Object.entries(snapshot[scope]).map(([key, raw]) => {
          try { return [key, JSON.parse(raw)]; } catch (_) { return [key, raw]; }
        }));
      }
      if (before && JSON.stringify(before) !== JSON.stringify(state.scopes.message)) {
        await state.emit('mag_variable_update_ended', clone(state.scopes.message), clone(before));
      }
    };
    window.addEventListener('fawntavern:context', () => state.refresh().catch(report));
    window.addEventListener('fawntavern:variables', () => state.refresh().catch(report));
    window.addEventListener('pagehide', () => {
      for (const pending of state.pending.values()) { clearTimeout(pending.timer); pending.reject(new Error('前端已卸载')); }
      state.pending.clear();
      state.events.clear();
    });
    return state;
  }
  if (!owner.__FawnCard) Object.defineProperty(owner, '__FawnCard', { value: createShared() });
  const shared = owner.__FawnCard;

  function listen(name, listener, once = false, first = false) {
    if (!shared.events.has(name)) shared.events.set(name, new Set());
    const records = shared.events.get(name);
    const existing = [...records].find(record => record.listener === listener && record.frame === window);
    if (existing) return { stop: () => shared.events.get(name)?.delete(existing) };
    const record = { frame: window, listener, once };
    if (first) shared.events.set(name, new Set([record, ...records]));
    else records.add(record);
    return { stop: () => shared.events.get(name)?.delete(record) };
  }
  function removeListener(name, listener) {
    const records = shared.events.get(name);
    for (const record of records || []) if (record.frame === window && record.listener === listener) records.delete(record);
  }
  function clearEvents(name) {
    for (const [event, records] of shared.events) {
      if (name !== undefined && event !== name) continue;
      for (const record of records) if (record.frame === window) records.delete(record);
    }
  }
  window.addEventListener('pagehide', () => clearEvents());

  function scopeName(options = {}) {
    const type = options.type || 'chat';
    if (!['global', 'character', 'chat', 'message'].includes(type)) throw new Error('变量作用域尚未开放: ' + type);
    if (type === 'message' && shared.snapshot) {
      const requested = options.message_id;
      const index = requested === undefined || requested === 'latest' ? shared.snapshot.lastMessageIndex
        : requested < 0 ? shared.snapshot.lastMessageIndex + 1 + requested : requested;
      if (index !== shared.snapshot.messageIndex) throw new Error('当前同步快照只包含本楼层变量');
    }
    return type;
  }
  function getVariables(options = {}) { return clone(shared.scopes[scopeName(options)] || {}); }
  function getAllVariables() {
    return clone(Object.assign({}, ...['global', 'character', 'chat', 'previous', 'message'].map(scope => shared.scopes[scope] || {})));
  }
  function replaceVariables(values, options = {}) {
    engine.validate(values);
    const scope = scopeName(options);
    if (scope === 'character') throw new Error('角色变量当前只读');
    const value = clone(values);
    const write = shared.queue.then(async () => {
      const before = clone(shared.scopes[scope] || {});
      if (scope === 'message') {
        const snapshot = shared.snapshot;
        if (!snapshot) throw new Error('消息变量尚未加载');
        const saved = await shared.call('variables.message.replace', {
          messageId: snapshot.messageId, version: snapshot.version, revision: snapshot.revision, value,
        });
        if (!saved) { await shared.refresh(); throw new Error('变量或消息版本已变化，写入未覆盖'); }
      } else await shared.call('variables.replace', { scope, value });
      await shared.refresh();
      if (scope !== 'message') await shared.emit('mag_variable_update_ended', getAllVariables(), before);
    });
    shared.queue = write.catch(report);
    return write;
  }
  function updateVariablesWith(updater, options = {}) {
    const value = updater(getVariables(options));
    if (value?.then) return value.then(async next => { await replaceVariables(next, options); return next; });
    replaceVariables(value, options);
    return value;
  }
  function initializeGlobal(name, value) {
    shared.globals.set(name, value);
    if (!(name in owner)) Object.defineProperty(owner, name, { configurable: true, get: () => shared.globals.get(name) });
    for (const resolve of shared.waiters.get(name) || []) resolve(value);
    shared.waiters.delete(name);
    shared.emit('global_' + name + '_initialized').catch(report);
  }
  async function waitGlobalInitialized(name) {
    if (name === 'Mvu') await shared.ready;
    if (!shared.globals.has(name) && name in owner) shared.globals.set(name, owner[name]);
    const value = shared.globals.has(name) ? shared.globals.get(name)
      : await new Promise(resolve => {
        if (!shared.waiters.has(name)) shared.waiters.set(name, []);
        shared.waiters.get(name).push(resolve);
      });
    Object.defineProperty(window, name, { configurable: true, get: () => shared.globals.get(name) });
    return value;
  }
  async function parseMessage(message, oldData) {
    const plan = engine.begin(message, oldData);
    await shared.emit('mag_variable_update_started', plan.data);
    await shared.emit('mag_command_parsed', plan.data, plan.commands, message);
    const result = engine.finish(plan);
    if (result) await shared.emit('mag_variable_update_ended', result, oldData);
    return result;
  }
  const mvu = {
    events: Object.freeze({
      VARIABLE_INITIALIZED: 'mag_variable_initiailized', VARIABLE_UPDATE_STARTED: 'mag_variable_update_started',
      COMMAND_PARSED: 'mag_command_parsed', VARIABLE_UPDATE_ENDED: 'mag_variable_update_ended',
      BEFORE_MESSAGE_UPDATE: 'mag_before_message_update',
    }),
    getMvuData: getVariables, replaceMvuData: replaceVariables, parseMessage,
    isDuringExtraAnalysis: () => false,
  };
  const helper = {
    getMessageId(name) { return name ? Number(name.match(/^TH-message--(\d+)--/)?.[1]) : context().messageIndex; },
    getCurrentMessageId() { return context().messageIndex; },
    getLastMessageId() { return context().lastMessageIndex; },
    getIframeName() { return window.name || 'TH-message--' + context().messageIndex + '--0'; },
    getCurrentCharacterName() { return context().charName; },
    getCurrentChatId() { return context().sessionId; },
    setInputText(value) { FTCardInput.setInputText(String(value)); },
    getVariables, getAllVariables, replaceVariables, updateVariablesWith,
    insertOrAssignVariables: (values, options) => updateVariablesWith(current => _.merge(current, values), options),
    insertVariables: (values, options) => updateVariablesWith(current => _.defaultsDeep(current, values), options),
    deleteVariable(path, options) {
      const variables = getVariables(options);
      const delete_occurred = _.has(variables, engine.safePath(path));
      _.unset(variables, engine.safePath(path));
      replaceVariables(variables, options);
      return { variables, delete_occurred };
    },
    eventOn: (name, listener) => listen(name, listener),
    eventOnce: (name, listener) => listen(name, listener, true),
    eventMakeFirst(name, listener) { removeListener(name, listener); return listen(name, listener, false, true); },
    eventMakeLast(name, listener) { removeListener(name, listener); return listen(name, listener); },
    eventRemoveListener: removeListener, eventClearEvent: clearEvents, eventClearAll: () => clearEvents(),
    eventEmit: shared.emit, eventEmitAndWait: shared.emit, initializeGlobal, waitGlobalInitialized,
    errorCatched(fn) { return function (...args) {
      try { const result = fn.apply(this, args); return result?.catch ? result.catch(report) : result; }
      catch (error) { report(error); }
    }; },
    reloadIframe: () => location.reload(),
  };
  Object.defineProperty(window, 'TavernHelper', { value: Object.freeze(helper), configurable: true });
  const getContext = () => ({
    chatId: context().sessionId, name1: context().userName, name2: context().charName,
    variables: getVariables(), getCurrentChatId: helper.getCurrentChatId,
    eventSource: { on: helper.eventOn, once: helper.eventOnce, emit: helper.eventEmit, removeListener: helper.eventRemoveListener },
  });
  Object.defineProperty(window, 'SillyTavern', { configurable: true, get: () => ({ ...getContext(), getContext }) });
  for (const [name, method] of Object.entries(helper)) {
    if (!(name in window)) Object.defineProperty(window, name, { value: method, configurable: true });
  }
  function ensureInput() {
    if (document.getElementById('send_textarea')) return;
    const input = document.createElement('textarea');
    input.id = 'send_textarea';
    input.hidden = true;
    input.addEventListener('input', () => helper.setInputText(input.value));
    document.body.appendChild(input);
  }
  const domReady = document.readyState === 'loading'
    ? new Promise(resolve => document.addEventListener('DOMContentLoaded', resolve, { once: true })) : Promise.resolve();
  domReady.then(ensureInput);
  if (!shared.ready) {
    shared.ready = (async () => {
      await domReady;
      if (context().hostCallsAllowed === false) return;
      await shared.refresh();
      if (!shared.scopes.message?.stat_data) {
        function text(node) {
          if (node.nodeType === 3) return node.nodeValue;
          if (node.nodeName === 'BR') return '\n';
          return [...node.childNodes].map(text).join('');
        }
        const source = [...document.querySelectorAll('initvar')]
          .map(element => '<initvar>' + text(element) + '</initvar>').join('\n');
        const result = engine.finish(engine.begin(source, getAllVariables()));
        if (result) {
          result._fawn_mvu_source = source;
          await replaceVariables(result, { type: 'message', message_id: shared.snapshot.messageIndex });
          await shared.emit(mvu.events.VARIABLE_INITIALIZED, result, shared.snapshot.version);
        }
      }
      initializeGlobal('Mvu', mvu);
    })();
    shared.ready.catch(report);
  }
})();
