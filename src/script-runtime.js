(() => {
  const script = JSON.parse(document.getElementById('ft-script-data').textContent);
  const errorOutput = document.getElementById('ft-script-error');
  const showError = error => { errorOutput.textContent = String(error?.message || error); };
  const getButtonEvent = name => 'fawntavern:button:' + script.id + ':' + name;
  const api = { ...window.TavernHelper, getButtonEvent, getScriptId: () => script.id };
  for (const [name, value] of Object.entries(api)) {
    if (!(name in window)) Object.defineProperty(window, name, { value });
  }
  Object.defineProperty(window, 'TavernScript', { value: Object.freeze(api) });
  window.name = 'TH-script--' + script.name + '--' + script.id;
  document.getElementById('ft-script-name').textContent = script.name;
  const buttons = document.getElementById('ft-script-buttons');
  for (const item of script.buttons) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = item.name;
    button.addEventListener('click', () => api.eventEmit(getButtonEvent(item.name)).catch(showError));
    buttons.appendChild(button);
  }
  window.addEventListener('error', event => showError(event.error || event.message));
  window.addEventListener('unhandledrejection', event => showError(event.reason));
  window.addEventListener('fawntavern:context', () => {
    api.eventEmit('fawntavern:context', JSON.parse(FTCardHost.getContext())).catch(showError);
  });
  const entry = document.createElement('script');
  entry.type = 'module';
  entry.textContent = script.content;
  document.body.appendChild(entry);
})();
