const fencePattern = /^ {0,3}(`{3,}|~{3,})([^\n]*)\n/gm;
const documentPattern = /^\s*(?:<!doctype\s+html\b|<html\b|<head\b|<body\b)/i;
const htmlPattern = /<(?:!doctype\s+html\b|\/?(?:html|head|body|style|script|link|meta|div|span|section|article|main|header|footer|nav|aside|details|summary|iframe|button|input|textarea|select|label|form|table|thead|tbody|tr|td|th|ul|ol|li|p|h[1-6]|img|picture|video|audio|canvas|svg|br|hr|a|b|i|em|strong|blockquote|pre|code)(?=[\s/>]))/i;
const assetRoot = 'https://plugin.local/me.rerere.fawntavern.frontend/assets/';
const compatibilityScript = '<link rel="stylesheet" href="' + assetRoot + 'vendor/fontawesome/css/all.min.css">'
  + '<link rel="stylesheet" href="' + assetRoot + 'vendor/jquery-ui/jquery-ui.min.css">'
  + '<link rel="stylesheet" href="' + assetRoot + 'vendor/toastr.min.css">'
  + '<script src="' + assetRoot + 'vendor/libraries.js"></script>'
  + '<script src="' + assetRoot + 'vendor/tailwind.js"></script>'
  + '<script src="' + assetRoot + 'card-runtime.js"></script>';

function addCompatibilityScript(html) {
  const headPattern = /^\s*(?:<!doctype[^>]*>\s*)?(?:<html\b[^>]*>\s*)?<head\b[^>]*>/i;
  if (headPattern.test(html)) {
    return html.replace(headPattern, head => head + compatibilityScript);
  }
  const rootPattern = /^\s*(?:<!doctype[^>]*>\s*)?<html\b[^>]*>/i;
  if (rootPattern.test(html)) {
    return html.replace(rootPattern, root => root + '<head>' + compatibilityScript + '</head>');
  }
  return '<!doctype html><html><head>' + compatibilityScript + '</head><body>' + html + '</body></html>';
}

function renderFrontendBlocks(content) {
  content = content.replace(/\r\n?/g, '\n');
  if (documentPattern.test(content)) {
    return { head: compatibilityScript, segments: [{ type: 'html', content: addCompatibilityScript(content), heightDp: 0 }] };
  }
  const segments = [];
  let offset = 0;
  let found = false;

  function appendText(text) {
    if (!text.trim()) return;
    const visible = text.replace(/(`+)[\s\S]*?\1/g, '');
    if (htmlPattern.test(visible)) {
      found = true;
      segments.push({ type: 'html', content: text, heightDp: 0, isolated: false });
    } else {
      segments.push({ type: 'markdown', content: text });
    }
  }

  fencePattern.lastIndex = 0;
  let match;
  while ((match = fencePattern.exec(content)) !== null) {
    const close = new RegExp('^ {0,3}' + match[1][0] + '{' + match[1].length + ',}[ \\t]*(?:\\n|$)', 'gm');
    close.lastIndex = fencePattern.lastIndex;
    const end = close.exec(content);
    appendText(content.slice(offset, match.index));
    if (!end) { offset = match.index; break; }
    const html = content.slice(fencePattern.lastIndex, end.index);
    const language = match[2].trim().split(/\s+/)[0].toLowerCase();
    if (documentPattern.test(html) ||
        ((language === 'html' || language === 'htm' || language === '') && htmlPattern.test(html))) {
      segments.push({ type: 'html', content: addCompatibilityScript(html), heightDp: 0 });
      found = true;
    } else {
      segments.push({ type: 'markdown', content: content.slice(match.index, close.lastIndex) });
    }
    offset = close.lastIndex;
    fencePattern.lastIndex = offset;
  }
  // 未闭合围栏按代码保留，避免把普通代码示例中的标签当作前端执行。
  if (match) segments.push({ type: 'markdown', content: content.slice(offset) });
  else appendText(content.slice(offset));
  if (!found) return null;
  return { head: compatibilityScript, segments };
}

function characterScripts(extensions) {
  const trees = extensions.tavern_helper?.scripts || [];
  return trees.filter(tree => tree.enabled === true).flatMap(tree =>
    tree.type === 'folder' ? (tree.scripts || []).filter(script => script.enabled === true) : [tree])
    .filter(script => (script.type === 'script' || script.type === undefined) && script.content?.trim());
}

function scriptDocument(script) {
  const data = JSON.stringify({
    id: script.id, name: script.name, info: script.info || '', content: script.content,
    buttonsEnabled: script.button?.enabled !== false, buttons: script.button?.buttons || [],
  }).replace(/</g, '\\u003c');
  const runtime = '<!doctype html><html><head>'
    + '<script>window.FTCardHost=parent.FTCardHost;window.FTCardInput=parent.FTCardInput;</script>'
    + compatibilityScript + '</head><body>'
    + '<script src="' + assetRoot + 'script-runtime.js"></script></body></html>';
  const srcdoc = runtime.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return '<!doctype html><html><head>' + compatibilityScript
    + '<link rel="stylesheet" href="' + assetRoot + 'script-ui.css">'
    + '</head><body><div id="ft-script-buttons" role="group" hidden></div>'
    + '<details id="ft-script-error-details" hidden><summary id="ft-script-error-summary"></summary>'
    + '<pre id="ft-script-error"></pre></details>'
    + '<script type="application/json" id="ft-script-data">' + data + '</script>'
    + '<iframe id="ft-script-frame" hidden style="display:none!important" srcdoc="' + srcdoc + '"></iframe>'
    + '</body></html>';
}

FawnTavern.register({
  'generation-lifecycle': {
    async onGenerationComplete(ctx) {
      if (!ctx.permissions?.includes('variables.read') || !ctx.permissions?.includes('variables.write')) return;
      const last = ctx.messages.at(-1);
      if (!last || !/<(?:initvar|UpdateVariable|JSONPatch)\b/i.test(last.content)) return;
      const snapshot = await FawnTavern.variables.snapshot(last.ts);
      const decode = values => Object.fromEntries(Object.entries(values).map(([key, raw]) => {
        try { return [key, JSON.parse(raw)]; } catch (_) { return [key, raw]; }
      }));
      const current = decode(snapshot.message);
      const source = FawnVariableEngine.sourceOf(last.content);
      if (current._fawn_mvu_source === source) return;
      const base = Object.assign({}, ...['global', 'character', 'chat', 'previous'].map(scope => decode(snapshot[scope])));
      const next = FawnVariableEngine.finish(FawnVariableEngine.begin(last.content, base));
      if (!next) return;
      next._fawn_mvu_source = source;
      const saved = await FawnTavern.variables.replaceMessage({
        messageId: snapshot.messageId, version: snapshot.version, revision: snapshot.revision, value: next,
      });
      if (!saved) throw new Error('消息变量已变化，未覆盖新版本');
    },
  },
  'session-frontend': {
    async open(ctx) {
      if (!FawnTavern.config.runCharacterScripts || !(ctx.permissions || []).includes('character.read')) return null;
      const scripts = characterScripts(await FawnTavern.character.extensions());
      if (scripts.length === 0) return null;
      return { segments: scripts.map(script => ({ type: 'html', content: scriptDocument(script), heightDp: 0 })) };
    },
  },
  'message-renderer': {
    render(ctx) {
      return renderFrontendBlocks(ctx.content);
    },
  },
});
