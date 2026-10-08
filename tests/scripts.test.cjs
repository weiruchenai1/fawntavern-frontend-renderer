const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const variableEngine = require('../src/variable-engine.cjs')({ YAML: require('yaml'), lodash: require('lodash') });
function loadPlugin(_folder, _variables = {}, services = {}) {
  let handlers;
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../index.js'), 'utf8'), {
    FawnTavern: { config: {}, register(value) { handlers = value; }, ...services },
  });
  return handlers;
}
test('角色脚本同时要求配置启用和角色读取授权', async () => {
  const config = {};
  const handlers = loadPlugin('tavern-helper', {}, {
    config,
    character: { async extensions() { assert.fail('不应读取角色脚本'); } },
  });
  const open = handlers['session-frontend'].open;
  assert.equal(await open({ permissions: ['character.read'] }), null);
  config.runCharacterScripts = true;
  assert.equal(await open({ permissions: [] }), null);
});

test('角色脚本尊重文件夹与脚本开关，代码不能提前闭合数据标签', async () => {
  const script = {
    type: 'script', id: 'script-1', enabled: true, name: '按钮脚本',
    content: 'const text = "</script><script>";', info: '<b>作者备注</b>',
    button: { buttons: [{ name: '可见', visible: true }, { name: '隐藏', visible: false }] },
  };
  const handlers = loadPlugin('tavern-helper', {}, {
    config: { runCharacterScripts: true },
    character: { async extensions() { return { tavern_helper: { scripts: [
      { type: 'folder', enabled: false, scripts: [script] },
      { type: 'folder', enabled: true, scripts: [script, { ...script, enabled: false }] },
    ] } }; } },
  });
  const plan = await handlers['session-frontend'].open({ permissions: ['character.read'] });
  assert.equal(plan.segments.length, 1);
  const data = plan.segments[0].content.match(/id="ft-script-data">([\s\S]*?)<\/script>/)[1];
  assert.ok(!data.includes('<'));
  const decoded = JSON.parse(data);
  assert.equal(decoded.content, script.content);
  assert.deepEqual(decoded.buttons, script.button.buttons);
  assert.equal(decoded.info, script.info);
  assert.equal(decoded.buttonsEnabled, true);
  assert.match(plan.segments[0].content, /<iframe[^>]+hidden[^>]+srcdoc=/);
});

function scriptRuntime(overrides = {}) {
  const elements = {};
  function element() {
    return { textContent: '', children: [], events: {}, hidden: true,
      appendChild(child) { this.children.push(child); },
      replaceChildren() { this.children = []; },
      setAttribute() {},
      addEventListener(name, handler) { this.events[name] = handler; },
    };
  }
  for (const id of ['ft-script-data', 'ft-script-buttons', 'ft-script-error', 'ft-script-error-details', 'ft-script-error-summary']) elements[id] = element();
  elements['ft-script-data'].textContent = JSON.stringify({
    id: 'script-1', name: '测试', info: '作者备注', content: 'globalThis.started = true;',
    buttonsEnabled: true, buttons: [{ name: '回复', visible: true }, { name: '隐藏', visible: false }],
    ...overrides,
  });
  const events = {};
  const errors = [];
  const context = {
    FawnVariableEngine: variableEngine,
    FTCardHost: { getContext: () => JSON.stringify({ sessionId: 'chat', hostCallsAllowed: false }) },
    document: { readyState: 'loading', addEventListener() {}, createElement: element, body: element() },
    parent: { document: { getElementById: id => elements[id], createElement: element } },
    frameElement: {},
    console: { error: value => errors.push(value) },
    toastr: { error() { assert.fail('脚本异常应通过脚本错误详情报告'); } },
    addEventListener(name, handler) { (events[name] ||= []).push(handler); },
  };
  context.window = context;
  const sandbox = vm.createContext(context);
  for (const name of ['card-runtime.js', 'script-runtime.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../assets', name), 'utf8'), sandbox);
  }
  return { context, elements, errors, dispatch: (name, event) => events[name].forEach(handler => handler(event)) };
}

test('角色脚本按钮、自定义事件和卸载清理使用同一套兼容事件', async () => {
  const { context, elements, dispatch } = scriptRuntime();
  let clicks = 0;
  context.TavernHelper.eventOn(context.getButtonEvent('回复'), () => { clicks++; });
  context.TavernScript.eventOnce('custom', () => { clicks += 10; });
  await elements['ft-script-buttons'].children[0].events.click();
  await context.eventEmit('custom');
  await context.eventEmit('custom');
  assert.equal(clicks, 11);
  assert.equal(context.document.body.children[0].type, 'module');
  assert.equal(context.document.body.children[0].textContent, 'globalThis.started = true;');
  dispatch('pagehide');
  await context.eventEmit(context.getButtonEvent('回复'));
  assert.equal(clicks, 11);
});

test('脚本信息与动态按钮支持同步、异步更新并隔离返回值', async () => {
  const { context, elements } = scriptRuntime();
  assert.equal(context.getScriptName(), '测试');
  assert.equal(context.getScriptInfo(), '作者备注');
  context.replaceScriptInfo('<b>新备注</b>');
  assert.equal(context.TavernHelper.getScriptInfo(), '<b>新备注</b>');
  assert.equal(context.TavernScript.getScriptInfo(), '<b>新备注</b>');
  assert.equal(context.getScriptButtons().length, 2);
  const detached = context.getScriptButtons();
  detached[0].name = '不应写入';
  assert.equal(context.getScriptButtons()[0].name, '回复');
  const next = [{ name: '动态', visible: true }];
  context.replaceScriptButtons(next);
  next[0].name = '不应写入';
  assert.equal(elements['ft-script-buttons'].children[0].textContent, '动态');
  const sync = context.updateScriptButtonsWith(buttons => [...buttons, { name: '同步', visible: false }]);
  assert.equal(sync.length, 2);
  const asyncResult = await context.updateScriptButtonsWith(async buttons => buttons.map(button => ({ ...button, visible: true })));
  assert.equal(asyncResult.length, 2);
  assert.equal(elements['ft-script-buttons'].children.length, 2);
  context.appendInexistentScriptButtons('script-1', [{ name: '动态', visible: true }, { name: '新增', visible: true }, { name: '新增', visible: true }]);
  assert.equal(context.getScriptButtons().length, 3);
  context.replaceScriptButtons('script-1', []);
  assert.equal(elements['ft-script-buttons'].hidden, true);
  await assert.rejects(context.updateScriptButtonsWith(async () => { throw new Error('更新失败'); }), /更新失败/);
  assert.equal(context.getScriptButtons().length, 0);
  const disabled = scriptRuntime({ buttonsEnabled: false });
  disabled.context.replaceScriptButtons([{ name: '不能显示', visible: true }]);
  assert.equal(disabled.elements['ft-script-buttons'].hidden, true);
  assert.equal(disabled.context.getScriptButtons().length, 1);
});

test('脚本报错默认折叠，保留堆栈并继续抛出同步与异步异常', async () => {
  const { context, elements, errors, dispatch } = scriptRuntime({ buttons: [] });
  assert.equal(elements['ft-script-error-details'].hidden, true);
  assert.equal(elements['ft-script-buttons'].hidden, true);
  const failure = new TypeError('Expected a function');
  assert.throws(context.errorCatched(() => { throw failure; }), error => error === failure);
  assert.equal(elements['ft-script-error-details'].hidden, false);
  assert.equal(elements['ft-script-error-details'].open, false);
  assert.equal(elements['ft-script-error'].textContent, failure.stack);
  assert.match(elements['ft-script-error-summary'].textContent, /测试.*TypeError/);
  await assert.rejects(context.errorCatched(async () => { throw failure; })(), error => error === failure);
  dispatch('unhandledrejection', { reason: failure });
  dispatch('error', { error: failure });
  assert.equal(errors.length, 4);
});
