(() => {
  let pending = false;
  let lastHeight = 0;
  const observedFrames = new WeakSet();

  function viewportHeight() {
    const screen = window.screen;
    return (screen && (screen.availHeight || screen.height)) || window.innerHeight;
  }

  function syncViewport() {
    const value = `${viewportHeight()}px`;
    document.documentElement.style.setProperty("--FT-viewport-height", value);
    document.documentElement.style.setProperty("--TH-viewport-height", value);
  }

  function schedule() {
    if (pending) return;
    pending = true;
    requestAnimationFrame(measure);
  }

  function bindFrame(frame) {
    if (observedFrames.has(frame)) return;
    observedFrames.add(frame);

    function resizeFrame() {
      try {
        const child = frame.contentDocument;
        if (!child || !child.body) return;
        const value = `${viewportHeight()}px`;
        child.documentElement.style.setProperty("--FT-viewport-height", value);
        child.documentElement.style.setProperty("--TH-viewport-height", value);
        const height = Math.ceil(Math.max(child.body.scrollHeight, child.documentElement.scrollHeight));
        const nextHeight = `${height}px`;
        if (height > 0 && frame.style.height !== nextHeight) frame.style.height = nextHeight;
        schedule();
      } catch (_) {}
    }

    frame.addEventListener("load", () => {
      try {
        if (window.ResizeObserver && frame.contentDocument?.body) {
          new ResizeObserver(resizeFrame).observe(frame.contentDocument.body);
        }
      } catch (_) {}
      resizeFrame();
    });
    resizeFrame();
  }

  function measure() {
    pending = false;
    document.querySelectorAll("iframe[srcdoc]").forEach(bindFrame);
    const body = document.body;
    const root = document.documentElement;
    const height = Math.ceil(Math.max(
      body ? body.scrollHeight : 0,
      body ? body.offsetHeight : 0,
      root ? root.scrollHeight : 0
    ));
    if (height > 0 && height !== lastHeight) {
      lastHeight = height;
      if (window.FTCardHeight?.report) FTCardHeight.report(height);
    }
  }

  function start() {
    syncViewport();
    if (window.ResizeObserver) {
      const resize = new ResizeObserver(schedule);
      resize.observe(document.documentElement);
      if (document.body) resize.observe(document.body);
    } else {
      setInterval(schedule, 500);
    }
    if (window.MutationObserver && document.body) {
      new MutationObserver(schedule).observe(document.body, {
        subtree: true, childList: true, attributes: true, characterData: true
      });
    }
    window.addEventListener("load", schedule);
    window.addEventListener("resize", () => {
      syncViewport();
      schedule();
    });
    schedule();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})();
