globalThis.FawnVariableEngine = require('./variable-engine.cjs')({ YAML: require('yaml'), lodash: require('lodash') });
require('./plugin.js');
