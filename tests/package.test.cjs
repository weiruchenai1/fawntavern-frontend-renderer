const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { test } = require('node:test');
const { unzipSync } = require('fflate');
const { packagePlugin } = require('../scripts/package.cjs');

test('安装包根目录、入口、运行库及许可证完整', () => {
  const files = unzipSync(readFileSync(packagePlugin()));
  const manifest = JSON.parse(Buffer.from(files['manifest.json']).toString('utf8'));
  assert.equal(manifest.id, 'me.rerere.fawntavern.frontend');
  assert.equal(manifest.entry, 'index.js');
  assert.ok(files[manifest.entry].length <= 384 * 1024);
  for (const path of ['assets/card-runtime.js', 'assets/script-runtime.js',
    'assets/vendor/libraries.js', 'assets/vendor/tailwind.js',
    'assets/vendor/fontawesome/webfonts/fa-solid-900.woff2',
    'assets/vendor/licenses/yaml.txt', 'assets/vendor/licenses/zod.txt', 'LICENSE']) {
    assert.ok(files[path]?.length > 0, path);
  }
  assert.ok(Object.keys(files).every(path => !path.startsWith('node_modules/') && !path.startsWith('.git/') && !path.includes('\\')));
});
