const assert = require('node:assert/strict');
const { existsSync, readFileSync } = require('node:fs');
const { join } = require('node:path');
const { test } = require('node:test');
const { runInNewContext } = require('node:vm');

function renderer(config) {
  let handlers;
  runInNewContext(readFileSync(join(__dirname, '../index.js'), 'utf8'), {
    FawnTavern: { config, register: value => { handlers = value; } }
  });
  return content => handlers['message-renderer'].render({
    content, messageIndex: 1, lastMessageIndex: 2, charName: '角色', userName: '用户'
  });
}

test('升级后保存的旧固定高度不再限制裸 HTML 和围栏卡片', () => {
  const render = renderer({ heightDp: 720 });
  for (const content of ['<div>卡片</div>', '```html\n<div>卡片</div>\n```', '正文\n```html\n<div>卡片</div>\n```']) {
    const plan = render(content);
    const html = plan.segments.find(segment => segment.type === 'html');
    assert.ok(html);
    assert.equal(Object.hasOwn(html, 'heightDp'), false);
  }
});

test('设置界面不再提供高度选项，独立 HTML 开关继续有效', () => {
  const manifest = JSON.parse(readFileSync(join(__dirname, '../manifest.json'), 'utf8'));
  assert.equal(Object.hasOwn(manifest.configSchema.properties, 'heightDp'), false);
  assert.equal(renderer({ renderBareHtml: false })('<div>卡片</div>'), null);
  assert.ok(renderer({ renderBareHtml: true })('<div>卡片</div>'));
});

test('每个前端代码块独立渲染，代码块外内容保持原生', () => {
  const render = renderer({});
  const message = [
    '开头说明',
    '```html', '<div id="first">第一张卡</div>', '```',
    '```css', '#first { color: red; }', '```',
    '```js', 'window.extra = true;', '```',
    '```html', '<div id="second">第二张卡</div>', '```',
    '结尾说明'
  ].join('\n');
  const segments = render(message).segments;
  assert.deepEqual(Array.from(segments, segment => segment.type), [
    'markdown', 'html', 'markdown', 'html', 'markdown'
  ]);
  assert.ok(segments[1].content.includes('id="first"'));
  assert.equal(segments[1].content.includes('id="second"'), false);
  assert.equal(segments[1].content.includes('window.extra'), false);
  assert.ok(segments[2].content.includes('```css'));
  assert.ok(segments[2].content.includes('```js'));
  assert.ok(segments[3].content.includes('id="second"'));

  const adjacent = render('```html\n<div>甲</div>\n```\n\n```html\n<div>乙</div>\n```').segments;
  assert.deepEqual(Array.from(adjacent, segment => segment.type), ['html', 'html']);
});

test('文档不嵌入动态楼层，兼容库由插件提供', () => {
  const html = renderer({})('<div>卡片</div>').segments[0].content;
  assert.ok(html.includes('assets/card-runtime.js'));
  assert.ok(html.includes('assets/vendor/jquery.min.js'));
  assert.ok(html.includes('assets/vendor/vue.runtime.global.prod.js'));
  assert.equal(html.includes('__FTCardContext'), false);
  for (const match of html.matchAll(/(?:src|href)="(assets\/[^\"]+)"/g)) {
    assert.ok(existsSync(join(__dirname, '..', match[1])), match[1]);
  }

  const withoutLibraries = renderer({ loadCompatibilityLibraries: false })('<div>卡片</div>').segments[0].content;
  assert.equal(withoutLibraries.includes('assets/vendor/'), false);
});

test('卡片运行时读取最新楼层和视口，并转发权限受控调用', async () => {
  let context = {
    sessionId: 'chat-1', messageIndex: 40, lastMessageIndex: 42,
    charName: '角色', userName: '用户', viewportHeight: 500
  };
  const events = new Map();
  const calls = [];
  const styles = new Map();
  const window = {
    innerHeight: 800,
    addEventListener(name, listener) { events.set(name, listener); },
    FTCardHost: {
      getContext() { return JSON.stringify(context); },
      postMessage(raw) { calls.push(JSON.parse(raw)); }
    },
    FTCardInput: { setInputText(value) { calls.push({ input: value }); } }
  };
  const document = {
    readyState: 'complete',
    documentElement: { style: { setProperty(name, value) { styles.set(name, value); } } }
  };
  runInNewContext(readFileSync(join(__dirname, '../assets/card-runtime.js'), 'utf8'), { window, document });

  assert.equal(window.TavernHelper.getCurrentMessageId(), 40);
  assert.equal(window.TavernHelper.getLastMessageId(), 42);
  assert.equal(styles.get('--FT-viewport-height'), '500px');
  context = { ...context, lastMessageIndex: 43, viewportHeight: 320 };
  events.get('fawntavern:context')();
  assert.equal(window.TavernHelper.getLastMessageId(), 43);
  assert.equal(styles.get('--FT-viewport-height'), '320px');

  const result = window.TavernHelper.getChatMessagesPage({ limit: 5 });
  assert.equal(calls[0].method, 'chat.messages.list');
  assert.equal(calls[0].params.limit, 5);
  events.get('fawntavern:response')({ detail: { id: calls[0].id, ok: true, value: [{ content: '消息' }] } });
  assert.equal((await result)[0].content, '消息');
  window.TavernHelper.setInputText('回复');
  assert.equal(calls[1].input, '回复');

  const loaded = window.TavernHelper.getVariablesAsync();
  assert.equal(calls[2].method, 'variables.get');
  events.get('fawntavern:response')({ detail: { id: calls[2].id, ok: true, value: { score: '5' } } });
  assert.equal((await loaded).score, '5');
  const saved = window.TavernHelper.replaceVariables({ score: 6 });
  assert.equal(calls[3].method, 'variables.replace');
  assert.equal(calls[3].params.value.score, '6');
  events.get('fawntavern:response')({ detail: { id: calls[3].id, ok: true, value: null } });
  await saved;
  assert.equal(window.TavernHelper.getVariables().score, '6');
});
