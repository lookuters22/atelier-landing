import type { Data } from "@measured/puck";
import { useEffect, useRef } from "react";
import { buildStandaloneHtmlFromPuck } from "../../features/offer-puck/exportHtml";

const previewHtmlCache = new Map<string, string>();

export function getCachedOfferPreviewHtml(data: Data, cacheKey: string): string {
  const hit = previewHtmlCache.get(cacheKey);
  if (hit) return hit;
  try {
    const html = buildStandaloneHtmlFromPuck(data);
    previewHtmlCache.set(cacheKey, html);
    return html;
  } catch {
    return "<!DOCTYPE html><html><body><p>Preview unavailable.</p></body></html>";
  }
}

/** Match exported HTML `.offer-doc` max-width (48rem ≈ 768px). */
export const OFFER_HOVER_DESIGN_WIDTH_PX = 768;
export const OFFER_HOVER_VIEWPORT_HEIGHT_PX = 900;
export const OFFER_HOVER_BOX_W = 220;
export const OFFER_HOVER_BOX_H = 300;
export const OFFER_HOVER_SCALE = OFFER_HOVER_BOX_W / OFFER_HOVER_DESIGN_WIDTH_PX;

type OfferHoverPreviewProps = {
  label: string;
  active: boolean;
  mouse: { x: number; y: number };
  html: string;
};

export function OfferHoverPreview({ label, active, mouse, html }: OfferHoverPreviewProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const rafRef = useRef(0);

  useEffect(() => {
    if (!active) return;
    const iframe = iframeRef.current;
    if (!iframe) return;

    const runScroll = () => {
      const win = iframe.contentWindow;
      if (!win?.document?.documentElement) return;
      const doc = win.document.documentElement;
      const body = win.document.body;
      const scrollable = Math.max(doc.scrollHeight, body?.scrollHeight ?? 0);
      const max = Math.max(0, scrollable - win.innerHeight);
      const next = win.scrollY + 1.2;
      win.scrollTo(0, next > max + 40 ? 0 : next);
      rafRef.current = requestAnimationFrame(runScroll);
    };

    const onLoad = () => {
      cancelAnimationFrame(rafRef.current);
      const win = iframe.contentWindow;
      iframe.style.width = `${OFFER_HOVER_DESIGN_WIDTH_PX}px`;
      iframe.style.height = `${OFFER_HOVER_VIEWPORT_HEIGHT_PX}px`;
      win?.scrollTo(0, 0);
      requestAnimationFrame(() => {
        rafRef.current = requestAnimationFrame(runScroll);
      });
    };

    iframe.addEventListener("load", onLoad);
    iframe.srcdoc = html;
    if (iframe.contentDocument?.readyState === "complete") {
      onLoad();
    }

    return () => {
      iframe.removeEventListener("load", onLoad);
      cancelAnimationFrame(rafRef.current);
    };
  }, [active, html]);

  if (!active) return null;

  const pad = 12;
  let left = mouse.x + pad;
  let top = mouse.y + pad;
  if (typeof document !== "undefined") {
    left = Math.min(left, document.documentElement.clientWidth - OFFER_HOVER_BOX_W - pad);
    top = Math.min(top, document.documentElement.clientHeight - OFFER_HOVER_BOX_H - pad);
    left = Math.max(pad, left);
    top = Math.max(pad, top);
  }

  return (
    <div
      className="pointer-events-none fixed z-[200] overflow-hidden rounded-lg border border-border bg-[#fafaf9] shadow-xl"
      style={{ left, top, width: OFFER_HOVER_BOX_W, height: OFFER_HOVER_BOX_H }}
    >
      <div
        className="absolute left-0 top-0 origin-top-left"
        style={{
          width: OFFER_HOVER_DESIGN_WIDTH_PX,
          transform: `scale(${OFFER_HOVER_SCALE})`,
        }}
      >
        <iframe
          ref={iframeRef}
          title={`Preview ${label}`}
          className="block border-0"
          style={{ width: OFFER_HOVER_DESIGN_WIDTH_PX, height: OFFER_HOVER_VIEWPORT_HEIGHT_PX }}
          sandbox="allow-same-origin"
        />
      </div>
    </div>
  );
}
