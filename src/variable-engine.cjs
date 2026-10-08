module.exports = function createVariableEngine({ YAML, lodash: _ }) {
  const clone = value => JSON.parse(JSON.stringify(value));
  const forbidden = new Set(['__proto__', 'prototype', 'constructor']);
  function safePath(path) {
    const parts = Array.isArray(path) ? path : _.toPath(String(path));
    if (!parts.length || parts.some(part => forbidden.has(String(part)))) throw new Error('变量路径无效');
    return parts;
  }
  function validate(value) {
    if (!value || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value)) {
      if (forbidden.has(key)) throw new Error('变量键无效: ' + key);
      validate(child);
    }
  }
  function sourceOf(message) {
    const blocks = [...message.matchAll(/<(initvar|UpdateVariable|JSONPatch)\b[^>]*>([\s\S]*?)<\/\1>/gi)];
    return blocks.length ? blocks.map(match => match[0]).join('\n') : message;
  }
  function commandsFrom(source) {
    const commands = [];
    const patches = [...source.matchAll(/<JSONPatch\b[^>]*>([\s\S]*?)<\/JSONPatch>/gi)];
    for (const match of patches) {
      const operations = JSON.parse(match[1].replace(/^\s*```(?:json)?\s*|\s*```\s*$/g, ''));
      if (!Array.isArray(operations)) throw new Error('JSONPatch 必须是数组');
      for (const operation of operations) commands.push({ type: 'patch', operation });
    }
    const pattern = /_\.(set|insert|delete|add|move)\s*\(/g;
    let match;
    while ((match = pattern.exec(source))) {
      let depth = 1;
      let quote = '';
      let end = pattern.lastIndex;
      for (; end < source.length && depth; end++) {
        const char = source[end];
        if (quote) {
          if (char === '\\') end++;
          else if (char === quote) quote = '';
        } else if (char === '"' || char === "'") quote = char;
        else if (char === '(') depth++;
        else if (char === ')') depth--;
      }
      if (depth) throw new Error('变量更新命令未闭合');
      const args = YAML.parse('[' + source.slice(pattern.lastIndex, end - 1) + ']');
      commands.push({ type: match[1], args: [args[0], ...args.slice(1).map(value => JSON.stringify(value))], full_match: source.slice(match.index, end), reason: '' });
      pattern.lastIndex = end;
    }
    return commands;
  }
  function remove(root, path) {
    const parent = _.get(root, path.slice(0, -1), root);
    const key = path[path.length - 1];
    if (Array.isArray(parent)) parent.splice(Number(key), 1);
    else _.unset(root, path);
  }
  function apply(root, command) {
    if (command.type === 'patch') {
      const op = command.operation;
      const path = safePath(op.path.split('/').slice(1).map(value => value.replace(/~1/g, '/').replace(/~0/g, '~')));
      if (op.op === 'remove') remove(root, path);
      else if (op.op === 'test') {
        if (!_.isEqual(_.get(root, path), op.value)) throw new Error('JSONPatch test 失败');
      } else if (op.op === 'move' || op.op === 'copy') {
        const from = safePath(op.from.split('/').slice(1).map(value => value.replace(/~1/g, '/').replace(/~0/g, '~')));
        const value = clone(_.get(root, from));
        if (op.op === 'move') remove(root, from);
        _.set(root, path, value);
      } else if (op.op === 'add' || op.op === 'replace') {
        validate(op.value);
        const parent = path.length === 1 ? root : _.get(root, path.slice(0, -1));
        if (op.op === 'add' && Array.isArray(parent)) {
          const index = path.at(-1) === '-' ? parent.length : Number(path.at(-1));
          parent.splice(index, 0, clone(op.value));
        } else _.set(root, path, clone(op.value));
      } else throw new Error('不支持的 JSONPatch 操作: ' + op.op);
      return;
    }
    const args = [command.args[0], ...command.args.slice(1).map(value => YAML.parse(value))];
    const path = safePath(args[0]);
    const current = _.get(root, path);
    validate(args.slice(1));
    switch (command.type) {
      case 'set': _.set(root, path, clone(args.at(-1))); break;
      case 'add': {
        const delta = args[1];
        if (typeof current === 'boolean' && typeof delta === 'boolean') _.set(root, path, delta ? !current : current);
        else if (typeof current === 'number' && typeof delta === 'number') _.set(root, path, current + delta);
        else throw new Error('add 需要数值或布尔变量');
        break;
      }
      case 'insert':
        if (Array.isArray(current)) current.splice(args.length === 2 ? current.length : Number(args[1]), 0, clone(args.at(-1)));
        else if (args.length === 3) _.set(root, safePath([...path, String(args[1])]), clone(args[2]));
        else if (current && typeof current === 'object') Object.assign(current, clone(args[1]));
        else _.set(root, path, clone(args[1]));
        break;
      case 'delete':
        if (args.length === 2 && Array.isArray(current)) {
          const index = typeof args[1] === 'number' ? args[1] : current.findIndex(value => _.isEqual(value, args[1]));
          if (index >= 0) current.splice(index, 1);
        } else remove(root, args.length === 2 ? safePath([...path, String(args[1])]) : path);
        break;
      case 'move': { const value = clone(current); remove(root, path); _.set(root, safePath(args[1]), value); break; }
      default: throw new Error('不支持的变量更新命令');
    }
  }
  function begin(message, oldData) {
    const source = sourceOf(message);
    const data = clone(oldData || {});
    const initial = source.match(/<initvar\b[^>]*>([\s\S]*?)<\/initvar>/i);
    let initialized = false;
    if (initial && !data.stat_data) {
      const value = YAML.parse(initial[1]);
      if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('initvar 必须是对象');
      validate(value);
      data.stat_data = value;
      data.initialized_lorebooks = data.initialized_lorebooks || {};
      initialized = true;
    }
    const commandSource = source.replace(/<initvar\b[^>]*>[\s\S]*?<\/initvar>/gi, '').replace(/<Analysis\b[^>]*>[\s\S]*?<\/Analysis>/gi, '');
    return { data, source, commands: commandsFrom(commandSource), initialized };
  }
  function finish(plan) {
    if (!plan.initialized && !plan.commands.length) return undefined;
    if (!plan.data.stat_data) throw new Error('变量尚未初始化');
    for (const command of plan.commands) apply(plan.data.stat_data, command);
    return plan.data;
  }
  return { begin, finish, sourceOf, clone, validate, safePath };
};
