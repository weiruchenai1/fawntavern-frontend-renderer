(() => {
  const context = window.__FTCardContext || {};
  const helper = {
    getCurrentMessageId: () => Number(context.messageIndex ?? -1),
    getLastMessageId: () => Number(context.lastMessageIndex ?? -1),
    setInputText(value) {
      if (window.FTCardInput?.setInputText) FTCardInput.setInputText(String(value ?? ""));
    }
  };
  try {
    if (!window.TavernHelper) window.TavernHelper = helper;
    for (const [name, method] of Object.entries(helper)) {
      if (window[name] === undefined) window[name] = method;
    }
  } catch (_) {}

  function viewportHeight() {
    const screen = window.screen;
    return (screen && (screen.availHeight || screen.height)) || window.innerHeight;
  }

  function syncViewport() {
    const value = `${viewportHeight()}px`;
    document.documentElement.style.setProperty("--FT-viewport-height", value);
    document.documentElement.style.setProperty("--TH-viewport-height", value);
  }

  function start() {
    syncViewport();
    window.addEventListener("resize", syncViewport);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})();
