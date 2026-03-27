const CANVAS_SCROLL_PARENT_SELECTOR =
  '[class*="PuckCanvas_"]:not([class*="PuckCanvas-inner"]):not([class*="PuckCanvas-root"]):not([class*="PuckCanvas-loader"])';

function getCanvasScrollParent(input: HTMLInputElement): HTMLElement | null {
  const root = input.ownerDocument.getElementById("puck-canvas-root");
  return (root?.closest(CANVAS_SCROLL_PARENT_SELECTOR) ??
    input.closest(CANVAS_SCROLL_PARENT_SELECTOR)) as HTMLElement | null;
}

export function openFilePickerWithoutScrollJump(input: HTMLInputElement | null) {
  if (!input) return;

  const scrollParent = getCanvasScrollParent(input);
  if (!scrollParent) return;

  const top = scrollParent.scrollTop;
  const left = scrollParent.scrollLeft;
  let timeoutId = 0;
  let raf1 = 0;
  let raf2 = 0;

  const restore = () => {
    scrollParent.scrollTo({ top, left, behavior: "auto" });
  };

  const cleanup = () => {
    window.removeEventListener("focus", onFocusBack, true);
    window.clearTimeout(timeoutId);
    cancelAnimationFrame(raf1);
    cancelAnimationFrame(raf2);
  };

  const onFocusBack = () => {
    restore();
    raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(restore);
    });
    cleanup();
  };

  window.addEventListener("focus", onFocusBack, true);
  timeoutId = window.setTimeout(cleanup, 15000);

  restore();
  requestAnimationFrame(restore);
}
