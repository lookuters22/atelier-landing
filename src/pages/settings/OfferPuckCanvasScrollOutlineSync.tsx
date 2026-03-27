import { createUsePuck } from "@measured/puck";
import { useEffect, useMemo, useRef } from "react";
import {
  getOfferPuckCanvasScrollParent,
  offerPuckProgrammaticCanvasScroll,
} from "./offerPuckCanvasScrollLock";

const usePuck = createUsePuck();

const OFFER_PUCK_OUTLINE_SCROLL_SYNC_DISABLED = false;

/** Puck root drop zone id (see @measured/puck root-droppable-id). */
const ROOT_DROP_ZONE = "root:default-zone";

function relTopInScrollport(scrollParent: HTMLElement, el: HTMLElement): number {
  const sp = scrollParent.getBoundingClientRect();
  const er = el.getBoundingClientRect();
  return scrollParent.scrollTop + (er.top - sp.top);
}

/** Index of the root block whose top has passed the anchor line (scrollspy). */
function activeIndexFromScroll(
  scrollParent: HTMLElement,
  blockEls: HTMLElement[],
): number {
  if (blockEls.length === 0) return 0;
  const viewportH = scrollParent.clientHeight;
  const anchorY =
    scrollParent.scrollTop + Math.min(viewportH * 0.22, Math.max(72, viewportH * 0.15));
  let best = 0;
  for (let i = 0; i < blockEls.length; i++) {
    const relTop = relTopInScrollport(scrollParent, blockEls[i]);
    if (relTop <= anchorY) best = i;
  }
  return best;
}

function collectRootBlockElements(
  root: HTMLElement,
  content: unknown,
): HTMLElement[] {
  if (!Array.isArray(content)) return [];
  const out: HTMLElement[] = [];
  for (const item of content) {
    const id =
      item &&
      typeof item === "object" &&
      "props" in item &&
      (item as { props?: { id?: unknown } }).props &&
      typeof (item as { props: { id?: unknown } }).props.id === "string"
        ? (item as { props: { id: string } }).props.id
        : null;
    if (!id) continue;
    const el = root.querySelector(
      `[data-puck-component="${CSS.escape(id)}"]`,
    ) as HTMLElement | null;
    if (el) out.push(el);
  }
  return out;
}

/**
 * While the user scrolls the canvas, keep the outline / itemSelector aligned with the block
 * nearest the top of the viewport (same idea as scrollspy nav).
 */
export function OfferPuckCanvasScrollOutlineSync() {
  const dispatch = usePuck((s) => s.dispatch);
  const itemSelector = usePuck((s) => s.appState.ui.itemSelector);
  const content = usePuck((s) => s.appState.data?.content);
  const contentRef = useRef(content);
  contentRef.current = content;

  const contentKey = useMemo(() => {
    if (!Array.isArray(content)) return "";
    return content
      .map((c) => (c as { props?: { id?: string } })?.props?.id ?? "")
      .join("\0");
  }, [content]);

  const itemSelectorRef = useRef(itemSelector);
  itemSelectorRef.current = itemSelector;

  useEffect(() => {
    if (OFFER_PUCK_OUTLINE_SCROLL_SYNC_DISABLED) return;
    const root = document.getElementById("puck-canvas-root");
    const scrollParent = getOfferPuckCanvasScrollParent(root);
    if (!root || !scrollParent) return;

    let raf = 0;
    const sync = () => {
      if (offerPuckProgrammaticCanvasScroll.current) return;
      const blocks = collectRootBlockElements(root, contentRef.current);
      if (blocks.length === 0) return;

      const container = scrollParent;
      const isAtBottom =
        Math.abs(
          container.scrollHeight - container.clientHeight - container.scrollTop,
        ) < 5;

      const nextIndex = isAtBottom
        ? blocks.length - 1
        : activeIndexFromScroll(scrollParent, blocks);

      const cur = itemSelectorRef.current;
      if (
        cur &&
        cur.zone === ROOT_DROP_ZONE &&
        typeof cur.index === "number" &&
        cur.index === nextIndex
      ) {
        return;
      }

      dispatch({
        type: "setUi",
        ui: { itemSelector: { index: nextIndex, zone: ROOT_DROP_ZONE } },
        recordHistory: false,
      });
    };

    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(sync);
    };

    scrollParent.addEventListener("scroll", onScroll, { passive: true });

    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(sync);
    });
    ro.observe(scrollParent);

    requestAnimationFrame(sync);

    return () => {
      scrollParent.removeEventListener("scroll", onScroll);
      ro.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [dispatch, contentKey]);

  return null;
}
