const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { zipSync } = require('fflate');

function packagePlugin() {
  const root = path.resolve(__dirname, '..');
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
  const files = {};
  function include(relative) {
    const full = path.join(root, relative);
    if (fs.statSync(full).isDirectory()) {
      for (const name of fs.readdirSync(full).sort()) include(path.join(relative, name));
    } else {
      files[relative.split(path.sep).join('/')] = [fs.readFileSync(full), { mtime: new Date(2020, 0, 1) }];
    }
  }
  for (const file of ['manifest.json', manifest.entry, manifest.entry + '.LEGAL.txt', 'assets', 'LICENSE', 'README.md', 'DEPENDENCIES.md']) include(file);
  if (files[manifest.entry][0].length > 384 * 1024) throw new Error('插件入口超过 384 KiB');
  const output = path.join(root, 'dist');
  fs.mkdirSync(output, { recursive: true });
  const archive = path.join(output, 'fawntavern-frontend-renderer-' + manifest.version + '.zip');
  const bytes = zipSync(files, { level: 6 });
  fs.writeFileSync(archive, bytes);
  fs.writeFileSync(archive + '.sha256', createHash('sha256').update(bytes).digest('hex') + '  ' + path.basename(archive) + '\n', 'utf8');
  return archive;
}
if (require.main === module) console.log(packagePlugin());
module.exports = { packagePlugin };
