const fs = require('node:fs');
const path = require('node:path');
const esbuild = require('esbuild');
const output = path.resolve(__dirname, '../assets/vendor');
const modules = path.join(__dirname, '../node_modules');
fs.mkdirSync(output, { recursive: true });

esbuild.buildSync({
  entryPoints: [path.join(__dirname, '../src/worker.cjs')],
  outfile: path.resolve(output, '../../index.js'),
  bundle: true, minify: true, platform: 'neutral', mainFields: ['module', 'main'],
  conditions: ['browser'], target: 'es2020', format: 'iife', legalComments: 'external',
});
if (fs.statSync(path.resolve(output, '../../index.js')).size > 384 * 1024) {
  throw new Error('QuickJS 入口超过宿主上限');
}

esbuild.buildSync({
  entryPoints: [path.join(__dirname, '../src/libraries.cjs')],
  outfile: path.join(output, 'libraries.js'),
  bundle: true, minify: true, platform: 'browser', target: 'es2020',
  conditions: ['browser'], legalComments: 'external',
  define: {
    'process.env.NODE_ENV': '"production"',
    __VUE_OPTIONS_API__: 'true', __VUE_PROD_DEVTOOLS__: 'false',
    __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: 'false',
  },
});

function copy(source, destination) {
  const target = path.join(output, destination);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(path.join(modules, source), target);
}
copy('@tailwindcss/browser/dist/index.global.js', 'tailwind.js');
copy('jquery-ui-dist/jquery-ui.min.css', 'jquery-ui/jquery-ui.min.css');
for (const file of fs.readdirSync(path.join(modules, 'jquery-ui-dist/images'))) {
  copy('jquery-ui-dist/images/' + file, 'jquery-ui/images/' + file);
}
copy('toastr/build/toastr.min.css', 'toastr.min.css');
copy('@fortawesome/fontawesome-free/css/all.min.css', 'fontawesome/css/all.min.css');
for (const file of fs.readdirSync(path.join(modules, '@fortawesome/fontawesome-free/webfonts'))) {
  copy('@fortawesome/fontawesome-free/webfonts/' + file, 'fontawesome/webfonts/' + file);
}
for (const name of Object.keys(require('../package.json').dependencies)) {
  const directory = path.join(modules, name);
  const license = fs.readdirSync(directory).find(file => /^licen[sc]e(?:\.|$)/i.test(file));
  if (license) copy(name + '/' + license, 'licenses/' + name.replace('/', '-') + '.txt');
  else fs.copyFileSync(path.join(__dirname, 'licenses', name + '.txt'), path.join(output, 'licenses', name + '.txt'));
}
console.log('前端依赖已生成：' + output);

fs.copyFileSync(path.join(__dirname, '../src/card-runtime.js'), path.resolve(output, '../card-runtime.js'));
fs.copyFileSync(path.join(__dirname, '../src/script-runtime.js'), path.resolve(output, '../script-runtime.js'));
