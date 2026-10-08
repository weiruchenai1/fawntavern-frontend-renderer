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
test('MVU 初始化和更新保留结构类型，且不修改原变量', () => {
  const initial = variableEngine.finish(variableEngine.begin('<initvar>世界:\n  地点: 水云市\n主角:\n  金额: 150\n  物品: [车票]</initvar>', {}));
  const next = variableEngine.finish(variableEngine.begin("<UpdateVariable>_.add('主角.金额', 25); _.insert('主角.物品', '钥匙'); _.set('世界.地点', '旧地点', '车站');</UpdateVariable>", initial));
  assert.equal(initial.stat_data.主角.金额, 150);
  assert.equal(next.stat_data.主角.金额, 175);
  assert.equal(next.stat_data.世界.地点, '车站');
  assert.deepEqual(next.stat_data.主角.物品, ['车票', '钥匙']);
  const patched = variableEngine.finish(variableEngine.begin('<JSONPatch>[{"op":"replace","path":"/主角/金额","value":200},{"op":"add","path":"/主角/物品/-","value":"地图"}]</JSONPatch>', next));
  assert.equal(patched.stat_data.主角.金额, 200);
  assert.deepEqual(patched.stat_data.主角.物品, ['车票', '钥匙', '地图']);
});

test('MVU 拒绝原型路径，失败时不污染已有数据', () => {
  const initial = { stat_data: { score: 1 } };
  assert.throws(() => variableEngine.finish(variableEngine.begin("_.set('score', 2); _.set('__proto__.polluted', true);", initial)), /变量路径无效/);
  assert.deepEqual(initial, { stat_data: { score: 1 } });
  assert.equal({}.polluted, undefined);
});

test('生成完成后的变量更新只提交一次', async () => {
  let current = {};
  let writes = 0;
  const handlers = loadPlugin('tavern-helper', {}, { variables: {
    async snapshot() { return {
      messageId: 10, messageIndex: 1, version: 0, revision: '{}',
      global: {}, character: {}, chat: {}, previous: { stat_data: '{"金额":150}' },
      message: Object.fromEntries(Object.entries(current).map(([key, value]) => [key, JSON.stringify(value)])),
    }; },
    async replaceMessage(options) { writes++; current = options.value; return true; },
  } });
  const ctx = { permissions: ['variables.read', 'variables.write'], messages: [{ ts: 10, content: "<UpdateVariable>_.add('金额', 25);</UpdateVariable>" }] };
  await handlers['generation-lifecycle'].onGenerationComplete(ctx);
  await handlers['generation-lifecycle'].onGenerationComplete(ctx);
  assert.equal(writes, 1);
  assert.equal(current.stat_data.金额, 175);
});
