import { createUsePuck } from "@measured/puck";
import { useEffect, useLayoutEffect } from "react";
import {
  getOfferPuckCanvasScrollParent,
  offerPuckProgrammaticCanvasScroll,
  offerPuckUserCanvasScrollingRef,
} from "./offerPuckCanvasScrollLock";

const usePuck = createUsePuck();

/** Set to false to re-enable scroll-into-view on selection (can fight scroll / cause loops). */
const OFFER_PUCK_SELECTION_SCROLL_DISABLED = true;

/** Scroll #puck-canvas-root (single canvas scrollport). */
function scrollBlockIntoScrollParent(scrollParent: HTMLElement, el: HTMLElement) {
  const spRect = scrollParent.getBoundingClientRect();
  const elRect = el.getBoundingClientRect();
  const margin = 12;
  const fullyVisible =
    elRect.top >= spRect.top + margin && elRect.bottom <= spRect.bottom - margin;
  if (fullyVisible) return;

  const y = elRect.top - spRect.top + scrollParent.scrollTop;
  const target = Math.max(0, y - margin);
  const max = scrollParent.scrollHeight - scrollParent.clientHeight;

  offerPuckProgrammaticCanvasScroll.current = true;
  scrollParent.scrollTop = Number.isFinite(max) && max >= 0 ? Math.min(max, target) : target;
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      offerPuckProgrammaticCanvasScroll.current = false;
    });
  });
}

/**
 * After selection changes, scroll the canvas column so the selected block is in view (iframe off).
 * Skips while the user is scrolling the canvas so outline sync does not fight manual scroll.
 */
export function OfferPuckCanvasSelectionScroll() {
  const selectedId = usePuck((s) => s.selectedItem?.props?.id as string | undefined);
  const itemSelector = usePuck((s) => s.appState.ui.itemSelector);
  const selectorKey = itemSelector ? `${String(itemSelector.zone)}:${itemSelector.index}` : "";

  useEffect(() => {
    if (OFFER_PUCK_SELECTION_SCROLL_DISABLED) return;
    const root = document.getElementById("puck-canvas-root");
    const scrollParent = getOfferPuckCanvasScrollParent(root);
    if (!root || !scrollParent) return;

    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const bumpUserScrolling = () => {
      if (offerPuckProgrammaticCanvasScroll.current) return;
      offerPuckUserCanvasScrollingRef.current = true;
      if (timeoutId !== undefined) clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        offerPuckUserCanvasScrollingRef.current = false;
        timeoutId = undefined;
      }, 150);
    };

    scrollParent.addEventListener("wheel", bumpUserScrolling, { passive: true });
    scrollParent.addEventListener("touchmove", bumpUserScrolling, { passive: true });
    scrollParent.addEventListener("scroll", bumpUserScrolling, { passive: true });

    return () => {
      scrollParent.removeEventListener("wheel", bumpUserScrolling);
      scrollParent.removeEventListener("touchmove", bumpUserScrolling);
      scrollParent.removeEventListener("scroll", bumpUserScrolling);
      if (timeoutId !== undefined) clearTimeout(timeoutId);
      offerPuckUserCanvasScrollingRef.current = false;
    };
  }, []);

  useLayoutEffect(() => {
    if (OFFER_PUCK_SELECTION_SCROLL_DISABLED) return;
    if (!selectedId) return;

    const root = document.getElementById("puck-canvas-root");
    const scrollParent = getOfferPuckCanvasScrollParent(root);
    if (!root || !scrollParent) return;
    const el = root.querySelector(`[data-puck-component="${CSS.escape(selectedId)}"]`) as HTMLElement | null;
    if (!el) return;

    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        if (offerPuckUserCanvasScrollingRef.current) return;
        scrollBlockIntoScrollParent(scrollParent, el);
      });
    });

    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
  }, [selectedId, selectorKey]);

  return null;
}
