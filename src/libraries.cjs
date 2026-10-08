window.$ = window.jQuery = require('jquery');
require('jquery-ui-dist/jquery-ui.js');
require('jquery-ui-touch-punch/jquery.ui.touch-punch.js');
window._ = require('lodash');
window.Vue = require('vue');
window.VueRouter = require('vue-router');
window.YAML = require('yaml');
window.z = require('zod');
window.showdown = require('showdown');
window.toastr = require('toastr');
window.FawnVariableEngine = require('./variable-engine.cjs')({
  YAML: window.YAML, lodash: window._,
});
