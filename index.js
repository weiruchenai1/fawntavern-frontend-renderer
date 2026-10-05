const HTML_LANGUAGES = new Set(["", "html", "htm", "frontend", "web", "xml", "vue"]);
const HTML_ELEMENT = /<(?:!doctype\s+html|html|head|body|style|script|iframe|div|section|article|details|form|main|header|footer|table|svg)\b/i;
const DOCUMENT_ELEMENT = /<(?:!doctype\s+html|html|head|body)\b/i;
const BARE_HTML_START = /^\s*<(?:!doctype\s+html|html|body|style|script|iframe|div|section|article|details|form|main|header|footer|table|svg)\b/i;

function normalizeLines(content) {
  return content.replace(/\r\n?/g, "\n");
}

function templateScope(ctx) {
  const ids = {
    getCurrentMessageId: () => ctx.messageIndex,
    getLastMessageId: () => ctx.lastMessageIndex
  };
  return {
    char: ctx.charName,
    user: ctx.userName,
    charName: ctx.charName,
    userName: ctx.userName,
    message_id: ctx.messageIndex,
    last_message_id: ctx.lastMessageIndex,
    ...ids,
    TavernHelper: ids
  };
}

function evaluateTemplate(source, ctx) {
  if (!source.includes("<%")) return source;
  const tag = /<%([=#-]?)([\s\S]*?)%>/g;
  let code = "let output = ''; const print = (...values) => { output += values.join(''); };";
  let cursor = 0;
  for (const match of source.matchAll(tag)) {
    code += `output += ${JSON.stringify(source.slice(cursor, match.index))};`;
    if (match[1] === "=" || match[1] === "-") {
      code += `output += String((${match[2]}) ?? '');`;
    } else if (match[1] !== "#") {
      code += `${match[2]}\n`;
    }
    cursor = match.index + match[0].length;
  }
  code += `output += ${JSON.stringify(source.slice(cursor))}; return output;`;
  try {
    return new Function("scope", `with (scope) { ${code} }`)(templateScope(ctx));
  } catch (_) {
    return source;
  }
}

function parseFences(lines) {
  const blocks = [];
  for (let start = 0; start < lines.length;) {
    const opening = lines[start].trim().match(/^(`{3,}|~{3,})([^`~]*)$/);
    if (!opening) {
      start++;
      continue;
    }
    const marker = opening[1];
    const language = opening[2].trim().split(/\s+/)[0].toLowerCase();
    let end = start + 1;
    while (end < lines.length) {
      const closing = lines[end].trim();
      if (closing.length >= marker.length &&
          [...closing].every(character => character === marker[0])) break;
      end++;
    }
    const closed = end < lines.length;
    const last = closed ? end : lines.length - 1;
    const body = lines.slice(start + 1, closed ? end : lines.length).join("\n");
    blocks.push({
      start,
      end: last,
      language,
      body,
      source: lines.slice(start, last + 1).join("\n")
    });
    start = last + 1;
  }
  return blocks;
}

function isFrontendBlock(block) {
  return HTML_ELEMENT.test(block.body) &&
    (HTML_LANGUAGES.has(block.language) || DOCUMENT_ELEMENT.test(block.body));
}

function stripNestedFenceLines(body) {
  return body.split("\n")
    .filter(line => !/^(?:`{3,}|~{3,})(?:html|htm|css|js|javascript)?$/i.test(line.trim()))
    .join("\n");
}

function replaceViewportHeightUnits(source) {
  return source.replace(/((?:min-|max-)?height\s*:\s*)([^;{}]*?)(\d+(?:\.\d+)?)vh(?=\s*[;}"'])/gi,
    (_match, property, prefix, amount) => {
      const scale = Number(amount) / 100;
      const height = scale === 1
        ? "var(--FT-viewport-height)"
        : `calc(var(--FT-viewport-height) * ${scale})`;
      return property + prefix + height;
    });
}

function withCardRuntime(html) {
  const libraries = FawnTavern.config.loadCompatibilityLibraries === false ? '' : `
<link rel="stylesheet" href="assets/vendor/fontawesome/css/all.min.css">
<link rel="stylesheet" href="assets/vendor/jquery-ui.min.css">
<link rel="stylesheet" href="assets/vendor/toastr.min.css">
<script src="assets/vendor/tailwindcss.min.js"></script>
<script src="assets/vendor/lodash.min.js"></script>
<script src="assets/vendor/jquery.min.js"></script>
<script src="assets/vendor/jquery-ui.min.js"></script>
<script src="assets/vendor/jquery.ui.touch-punch.min.js"></script>
<script src="assets/vendor/vue.runtime.global.prod.js"></script>
<script src="assets/vendor/vue-router.global.prod.js"></script>
<script src="assets/vendor/js-yaml.min.js"></script>
<script src="assets/vendor/zod.umd.js"></script>
<script src="assets/vendor/showdown.min.js"></script>
<script src="assets/vendor/toastr.min.js"></script>`;
  const runtime = html.includes('assets/card-runtime.js') ? '' : '<script src="assets/card-runtime.js"></script>';
  const script = libraries + runtime;
  if (!script) return html;
  const head = /<head(?:\s[^>]*)?>/i.exec(html);
  if (head) {
    const offset = head.index + head[0].length;
    return html.slice(0, offset) + script + html.slice(offset);
  }
  const root = /<html(?:\s[^>]*)?>/i.exec(html);
  if (root) {
    const offset = root.index + root[0].length;
    return html.slice(0, offset) + `<head>${script}</head>` + html.slice(offset);
  }
  return script + html;
}

function htmlSegment(content) {
  return { type: "html", content: withCardRuntime(content) };
}

function parseMessage(ctx, allowBareHtml) {
  const normalized = normalizeLines(ctx.content);
  const bare = normalized.trim();
  if (allowBareHtml && BARE_HTML_START.test(bare)) {
    return { segments: [htmlSegment(replaceViewportHeightUnits(evaluateTemplate(bare, ctx)))] };
  }
  const lines = normalized.split("\n");
  const blocks = parseFences(lines);
  if (!blocks.some(isFrontendBlock)) return null;

  const segments = [];
  function appendMarkdown(text) {
    const value = text.replace(/^\n+|\n+$/g, "");
    if (!value.trim()) return;
    const previous = segments[segments.length - 1];
    if (previous?.type === "markdown") previous.content += `\n${value}`;
    else segments.push({ type: "markdown", content: value });
  }

  let cursor = 0;
  for (const block of blocks) {
    if (cursor < block.start) appendMarkdown(lines.slice(cursor, block.start).join("\n"));
    if (isFrontendBlock(block)) {
      const html = replaceViewportHeightUnits(evaluateTemplate(stripNestedFenceLines(block.body), ctx)).trim();
      if (html) segments.push(htmlSegment(html));
    } else {
      appendMarkdown(block.source);
    }
    cursor = block.end + 1;
  }
  if (cursor < lines.length) appendMarkdown(lines.slice(cursor).join("\n"));
  return segments.some(segment => segment.type === "html") ? { segments } : null;
}

FawnTavern.register({
  "message-renderer": {
    render(ctx) {
      return parseMessage(ctx, FawnTavern.config.renderBareHtml !== false);
    }
  }
});
