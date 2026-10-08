(() => {
  const ui = window.parent.document;
  const script = JSON.parse(ui.getElementById('ft-script-data').textContent);
  const buttons = ui.getElementById('ft-script-buttons');
  const errorDetails = ui.getElementById('ft-script-error-details');
  const errorOutput = ui.getElementById('ft-script-error');
  errorDetails.hidden = true;
  errorDetails.open = false;
  errorOutput.textContent = '';
  const showError = error => {
    const detail = String(error?.stack || error?.message || error);
    ui.getElementById('ft-script-error-summary').textContent = script.name + ' · ' + (error?.name || 'Error');
    errorOutput.textContent = detail;
    errorDetails.hidden = false;
    console.error('[' + script.name + '] ' + detail);
  };

  const getButtonEvent = name => `fawntavern:button:${script.id}:${name}`;
  const getScriptButtons = () => script.buttons.map(button => ({ ...button }));

  function renderButtons() {
    buttons.replaceChildren();
    buttons.setAttribute('aria-label', script.name);
    const visible = script.buttonsEnabled ? script.buttons.filter(button => button.visible) : [];
    buttons.hidden = visible.length === 0;
    for (const item of visible) {
      const button = ui.createElement('button');
      button.type = 'button';
      button.textContent = item.name;
      button.addEventListener('click', () => window.eventEmit(getButtonEvent(item.name)).catch(showError));
      buttons.appendChild(button);
    }
  }

  function replaceScriptButtons(buttonsOrId, legacyButtons) {
    const next = typeof buttonsOrId === 'string' ? legacyButtons : buttonsOrId;
    script.buttons = next.map(button => ({ ...button }));
    renderButtons();
  }

  function updateScriptButtonsWith(updater) {
    const next = updater(getScriptButtons());
    if (next?.then) return next.then(buttons => { replaceScriptButtons(buttons); return buttons; });
    replaceScriptButtons(next);
    return next;
  }

  const api = {
    ...window.TavernHelper, getButtonEvent, getScriptId: () => script.id,
    getScriptName: () => script.name,
    getScriptInfo: () => script.info,
    replaceScriptInfo(info) { script.info = info; },
    getScriptButtons, replaceScriptButtons, updateScriptButtonsWith,
    appendInexistentScriptButtons(buttonsOrId, legacyButtons) {
      const next = typeof buttonsOrId === 'string' ? legacyButtons : buttonsOrId;
      updateScriptButtonsWith(current => {
        for (const button of next) if (!current.some(item => item.name === button.name)) current.push(button);
        return current;
      });
    },
    errorCatched(fn) {
      const onError = error => { showError(error); throw error; };
      return function (...args) {
        try {
          const result = fn.apply(this, args);
          return result?.catch ? result.catch(onError) : result;
        } catch (error) { return onError(error); }
      };
    },
  };
  // 脚本、全局函数和命名空间必须使用同一套事件接口，动态按钮才能触达同一批监听器。
  for (const [name, value] of Object.entries(api)) {
    Object.defineProperty(window, name, { value, configurable: true });
  }
  Object.defineProperty(window, 'TavernHelper', { value: Object.freeze(api), configurable: true });
  Object.defineProperty(window, 'TavernScript', { value: api });

  renderButtons();
  window.addEventListener('error', event => showError(event.error || event.message));
  window.addEventListener('unhandledrejection', event => showError(event.reason));
  window.addEventListener('fawntavern:context', () => {
    window.eventEmit('fawntavern:context', JSON.parse(FTCardHost.getContext())).catch(showError);
  });
  window.name = 'TH-script--' + script.name + '--' + script.id;
  window.frameElement.id = window.name;
  const entry = document.createElement('script');
  entry.type = 'module';
  entry.textContent = script.content;
  document.body.appendChild(entry);
})();
