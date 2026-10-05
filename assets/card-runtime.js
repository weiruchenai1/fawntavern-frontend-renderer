(() => {
  const native = window.FTCardHost;
  const fallback = window.__FTCardContext || {};
  const pending = new Map();
  let sequence = 0;

  function context() {
    if (!native?.getContext) return fallback;
    try {
      return JSON.parse(native.getContext());
    } catch (_) {
      return fallback;
    }
  }

  function call(method, params = {}) {
    if (!native?.postMessage) return Promise.reject(new Error('宿主接口不可用'));
    const id = String(++sequence);
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      try {
        native.postMessage(JSON.stringify({ id, method, params }));
      } catch (error) {
        pending.delete(id);
        reject(error);
      }
    });
  }

  window.addEventListener('fawntavern:response', event => {
    const response = event.detail;
    const waiter = pending.get(response.id);
    if (!waiter) return;
    pending.delete(response.id);
    if (response.ok) waiter.resolve(response.value);
    else waiter.reject(new Error(response.error || '宿主调用失败'));
  });

  function setInputText(value) {
    window.FTCardInput?.setInputText(String(value ?? ''));
  }

  function currentMessageId() {
    return Number(context().messageIndex ?? -1);
  }

  function lastMessageId() {
    return Number(context().lastMessageIndex ?? -1);
  }

  function messagePage(options = {}) {
    return call('chat.messages.list', options);
  }

  function generate(request = {}) {
    return call('model.generate', request);
  }

  const variables = new Map();
  const variableLoads = new Map();
  function variableScope(options = {}) {
    const scope = typeof options === 'string' ? options : (options.type || 'chat');
    if (scope !== 'chat' && scope !== 'global') throw new Error(`变量范围不可用: ${scope}`);
    return scope;
  }

  function copy(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function loadVariables(scope) {
    if (variables.has(scope)) return Promise.resolve(variables.get(scope));
    if (variableLoads.has(scope)) return variableLoads.get(scope);
    const loading = call('variables.get', { scope }).then(value => {
      variables.set(scope, value);
      return value;
    }).finally(() => variableLoads.delete(scope));
    variableLoads.set(scope, loading);
    return loading;
  }

  function getVariables(options) {
    const scope = variableScope(options);
    if (!variables.has(scope)) loadVariables(scope).catch(() => {});
    return copy(variables.get(scope) || {});
  }

  async function getVariablesAsync(options) {
    return copy(await loadVariables(variableScope(options)));
  }

  async function replaceVariables(value, options) {
    const scope = variableScope(options);
    const next = Object.fromEntries(Object.entries(value).map(([key, entry]) => [
      key, typeof entry === 'string' ? entry : JSON.stringify(entry)
    ]));
    await call('variables.replace', { scope, value: next });
    variables.set(scope, next);
    return copy(next);
  }

  async function updateVariablesWith(updater, options) {
    const current = await getVariablesAsync(options);
    const result = await updater(current);
    const next = result === undefined ? current : result;
    await replaceVariables(next, options);
    return next;
  }

  const listeners = new Map();
  function eventOn(type, listener) {
    const values = listeners.get(type) || new Set();
    values.add(listener);
    listeners.set(type, values);
    return { stop: () => values.delete(listener) };
  }

  function eventEmit(type, ...args) {
    return Promise.all([...(listeners.get(type) || [])].map(listener => listener(...args)));
  }

  const helper = {
    getCurrentMessageId: currentMessageId,
    getLastMessageId: lastMessageId,
    getChatMessagesPage: messagePage,
    generate,
    getVariables,
    getVariablesAsync,
    replaceVariables,
    updateVariablesWith,
    setInputText,
    eventOn,
    eventEmit,
    callHost: call
  };
  window.TavernHelper = Object.assign(window.TavernHelper || {}, helper);
  for (const [name, method] of Object.entries(helper)) {
    if (window[name] === undefined) window[name] = method;
  }
  window.FawnTavern = Object.freeze({
    call,
    context,
    chat: Object.freeze({ messages: Object.freeze({ list: messagePage }) }),
    model: Object.freeze({ generate }),
    variables: Object.freeze({ get: getVariablesAsync, replace: replaceVariables })
  });
  window.SillyTavern = Object.assign(window.SillyTavern || {}, {
    getContext: () => ({
      chatId: context().sessionId || '',
      name1: context().userName || '',
      name2: context().charName || '',
      messageId: currentMessageId(),
      lastMessageId: lastMessageId()
    })
  });

  function syncViewport() {
    const height = Number(context().viewportHeight) || window.innerHeight;
    const value = `${height}px`;
    document.documentElement.style.setProperty('--FT-viewport-height', value);
    document.documentElement.style.setProperty('--TH-viewport-height', value);
  }

  function start() {
    syncViewport();
    window.addEventListener('resize', syncViewport);
    window.addEventListener('fawntavern:context', syncViewport);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
