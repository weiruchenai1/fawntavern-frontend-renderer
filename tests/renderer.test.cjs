const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
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
