import type { MouseEvent, PointerEvent } from "react";
import { useEffect, type RefObject } from "react";

/**
 * Block Puck / @dnd-kit from starting a component drag when selecting text in an inline editor.
 * Kept for extra defense; see `useInlineEditStopDrag` for the fix that actually wins the event race.
 */
export const inlineEditStopDragProps = {
  onPointerDownCapture: (e: PointerEvent<HTMLElement>) => {
    e.stopPropagation();
  },
  onMouseDownCapture: (e: MouseEvent<HTMLElement>) => {
    e.stopPropagation();
  },
};

/**
 * Native capture listeners on the field: @dnd-kit registers `pointerdown` on the draggable root in the
 * bubble phase, which runs before React’s delegated listeners on the app root. Stopping propagation in
 * capture on the textarea/input prevents the event from reaching the block’s `[data-puck-component]` node.
 */
export function useInlineEditStopDrag(
  el: RefObject<HTMLElement | null>,
  active: boolean,
  /** Same ref reused for a new node (e.g. keyed line editor) — pass a value that changes per mount. */
  refreshKey?: unknown,
) {
  useEffect(() => {
    if (!active) return;
    const node = el.current;
    if (!node) return;
    const handler = (e: Event) => {
      e.stopPropagation();
    };
    const opts = { capture: true } as const;
    node.addEventListener("pointerdown", handler, opts);
    node.addEventListener("mousedown", handler, opts);
    return () => {
      node.removeEventListener("pointerdown", handler, opts);
      node.removeEventListener("mousedown", handler, opts);
    };
  }, [active, el, refreshKey]);
}
