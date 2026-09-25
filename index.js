const HTML_LANGUAGES = new Set(["", "html", "htm", "frontend", "web", "xml", "vue"]);
const HTML_ELEMENT = /<(?:!doctype\s+html|html|head|body|style|script|iframe|div|section|article|details|form|main|header|footer|table|svg)\b/i;
const DOCUMENT_ELEMENT = /<(?:!doctype\s+html|html|head|body)\b/i;
const BARE_HTML_START = /^\s*<(?:!doctype\s+html|html|body|style|script|iframe|div|section|article|details|form|main|header|footer|table|svg)\b/i;

function normalizeLines(content) {
  return content.replace(/\r\n?/g, "\n");
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

function blockType(block) {
  if (block.language === "css") return "css";
  if (block.language === "js" || block.language === "javascript") return "js";
  if (HTML_ELEMENT.test(block.body) &&
      (HTML_LANGUAGES.has(block.language) || DOCUMENT_ELEMENT.test(block.body))) return "html";
  return "other";
}

function stripNestedFenceLines(body) {
  return body.split("\n")
    .filter(line => !/^(?:`{3,}|~{3,})(?:html|htm|css|js|javascript)?$/i.test(line.trim()))
    .join("\n");
}

function wrapResource(body, tag) {
  return new RegExp(`^\\s*<${tag}\\b`, "i").test(body)
    ? body
    : `<${tag}>\n${body}\n</${tag}>`;
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

function toHtml(token) {
  if (token.type === "html") return replaceViewportHeightUnits(stripNestedFenceLines(token.body));
  if (token.type === "css") return wrapResource(replaceViewportHeightUnits(token.body), "style");
  if (token.type === "js") return wrapResource(token.body, "script");
  return token.source;
}

function withCardRuntime(html) {
  const script = '<script src="assets/card-runtime.js"></script>';
  if (html.includes('assets/card-runtime.js')) return html;
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

function htmlSegment(content, heightDp) {
  return { type: "html", content: withCardRuntime(content), heightDp };
}

function parseMessage(content, heightDp, allowBareHtml) {
  const normalized = normalizeLines(content);
  const bare = normalized.trim();
  if (allowBareHtml && BARE_HTML_START.test(bare)) {
    return { segments: [htmlSegment(replaceViewportHeightUnits(bare), heightDp)] };
  }
  const lines = normalized.split("\n");
  const blocks = parseFences(lines);
  const typedBlocks = blocks.map(block => ({ ...block, type: blockType(block) }));
  if (!typedBlocks.some(block => block.type === "html")) return null;

  const tokens = [];
  let cursor = 0;
  for (const block of typedBlocks) {
    if (cursor < block.start) {
      tokens.push({ type: "text", source: lines.slice(cursor, block.start).join("\n") });
    }
    tokens.push(block);
    cursor = block.end + 1;
  }
  if (cursor < lines.length) {
    tokens.push({ type: "text", source: lines.slice(cursor).join("\n") });
  }

  const segments = [];
  let frontendGroup = [];
  function appendMarkdown(text) {
    const value = text.replace(/^\n+|\n+$/g, "");
    if (!value.trim()) return;
    const previous = segments[segments.length - 1];
    if (previous?.type === "markdown") previous.content += `\n${value}`;
    else segments.push({ type: "markdown", content: value });
  }
  function flushFrontendGroup() {
    if (frontendGroup.length === 0) return;
    if (frontendGroup.some(token => token.type === "html")) {
      const html = frontendGroup.map(toHtml).join("\n").trim();
      if (html) segments.push(htmlSegment(html, heightDp));
    } else {
      appendMarkdown(frontendGroup.map(token => token.source).join("\n"));
    }
    frontendGroup = [];
  }

  for (const token of tokens) {
    const frontend = token.type === "html" || token.type === "css" || token.type === "js";
    if (frontend || (token.type === "text" && !token.source.trim() && frontendGroup.length > 0)) {
      frontendGroup.push(token);
    } else {
      flushFrontendGroup();
      appendMarkdown(token.source);
    }
  }
  flushFrontendGroup();
  return segments.some(segment => segment.type === "html") ? { segments } : null;
}

FawnTavern.register({
  "message-renderer": {
    render(ctx) {
      const heightDp = FawnTavern.config.heightDp ?? 0;
      return parseMessage(ctx.content, heightDp, FawnTavern.config.renderBareHtml !== false);
    }
  }
});
