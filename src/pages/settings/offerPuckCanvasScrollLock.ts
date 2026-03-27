/**
 * Set while OfferPuckCanvasSelectionScroll adjusts #puck-canvas-root.scrollTop so
 * OfferPuckCanvasScrollOutlineSync does not overwrite the outline during that scroll.
 */
export const offerPuckProgrammaticCanvasScroll = { current: false };

/**
 * True while the user is actively scrolling the canvas (wheel / touch / scrollbar).
 * Selection scroll-into-view is skipped to avoid feedback loops with outline sync.
 */
export const offerPuckUserCanvasScrollingRef = { current: false };

export function getOfferPuckCanvasScrollParent(root: HTMLElement | null): HTMLElement | null {
  if (!root) return null;
  return root.closest(
    '[class*="PuckCanvas_"]:not([class*="PuckCanvas-inner"]):not([class*="PuckCanvas-root"]):not([class*="PuckCanvas-loader"])',
  ) as HTMLElement | null;
}
