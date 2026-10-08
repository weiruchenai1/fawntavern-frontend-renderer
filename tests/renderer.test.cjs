const assert = require('node:assert/strict');
const { existsSync, readFileSync } = require('node:fs');
const { join } = require('node:path');
const { test } = require('node:test');
const { runInNewContext } = require('node:vm');

function renderer() {
  let handlers;
  runInNewContext(readFileSync(join(__dirname, '../index.js'), 'utf8'), {
    FawnTavern: { config: {}, register: value => { handlers = value; } },
  });
  return content => handlers['message-renderer'].render({
    content, messageIndex: 1, lastMessageIndex: 2, charName: '角色', userName: '用户',
  });
}
test('完整 HTML 和 HTML 片段都生成前端计划', () => {
  const render = renderer();
  for (const content of ['<div>卡片</div>',
    '\x60\x60\x60html\n<div>卡片</div>\n\x60\x60\x60',
    '~~~HTML\r\n<html><body>卡片</body></html>\r\n~~~~']) {
    assert.ok(render(content)?.segments.some(part => part.type === 'html'));
  }
});
test('变量片段共享正文 DOM，独立前端代码块保持隔离', () => {
  const plan = renderer()('开头\n\x60\x60\x60html\n<div>前端</div>\n\x60\x60\x60\n<details>变量</details><style>details{color:red}</style>');
  assert.deepEqual(Array.from(plan.segments, part => part.type), ['markdown', 'html', 'html']);
  assert.equal(plan.segments[1].isolated, undefined);
  assert.equal(plan.segments[2].isolated, false);
  assert.ok(plan.segments[2].content.includes('<style>'));
});
test('普通代码和未闭合围栏不作为 HTML 执行', () => {
  const render = renderer();
  for (const content of ['普通正文', '代码 \x60<div>示例</div>\x60',
    '\x60\x60\x60js\nconst html = "<html>示例</html>";\n\x60\x60\x60',
    '\x60\x60\x60html\n<div>未闭合</div>']) assert.equal(render(content), null);
});
test('资源使用独立插件 ID 且全部存在于安装目录', () => {
  const head = renderer()('<div>卡片</div>').head;
  for (const match of head.matchAll(/(?:src|href)="https:\/\/plugin\.local\/([^/]+)\/([^"]+)"/g)) {
    assert.equal(match[1], 'me.rerere.fawntavern.frontend');
    assert.ok(existsSync(join(__dirname, '..', match[2])), match[2]);
  }
  assert.equal(head.includes('js-yaml'), false);
});
