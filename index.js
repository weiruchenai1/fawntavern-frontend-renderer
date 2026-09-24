function escapeHtml(text) {
  return text.replace(/[&<>"']/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[character]);
}

function renderHtmlFences(content) {
  const lines = content.split("\n");
  const parts = [];
  let plain = [];
  let html = [];
  let marker = null;
  let found = false;
  let hasPlain = false;

  function flushPlain() {
    if (plain.length === 0) return;
    const text = plain.join("\n").trim();
    if (text) {
      parts.push(`<div class="ft-plain">${escapeHtml(text)}</div>`);
      hasPlain = true;
    }
    plain = [];
  }

  for (const line of lines) {
    if (marker === null) {
      const opening = line.match(/^\s*(`{3,}|~{3,})\s*html?\s*$/i);
      if (opening) {
        flushPlain();
        marker = opening[1];
        html = [];
      } else {
        plain.push(line);
      }
      continue;
    }
    const closing = line.trim();
    if (closing.length >= marker.length &&
        closing[0] === marker[0] &&
        [...closing].every(character => character === marker[0])) {
      parts.push(html.join("\n"));
      html = [];
      marker = null;
      found = true;
    } else {
      html.push(line);
    }
  }

  if (marker !== null) return null;
  flushPlain();
  if (!found) return null;
  return `${hasPlain ? '<style>.ft-plain{white-space:pre-wrap;margin:0 0 1em;font:inherit}</style>' : ''}${parts.join("\n")}`;
}

function isBareHtml(content) {
  return /^\s*(?:<!doctype\s+html\b|<html\b|<body\b|<(?:div|section|article|main|style|script|svg|canvas|table)\b)/i.test(content);
}

FawnTavern.register({
  "message-renderer": {
    render(ctx) {
      const content = ctx.content.replace(/\r\n?/g, "\n").trim();
      const html = renderHtmlFences(content) ??
        (FawnTavern.config.renderBareHtml !== false && isBareHtml(content) ? content : null);
      if (!html) return null;
      return {
        html,
        heightDp: FawnTavern.config.heightDp ?? 360
      };
    }
  }
});
