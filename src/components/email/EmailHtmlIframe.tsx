import { useCallback, useEffect, useRef, useState } from "react";

/** No allow-popups* — email HTML must not open new windows from the iframe. `allow-same-origin` kept for content measurement. */
const SANDBOX = "allow-same-origin";
const READER_STYLE_ID = "atelier-email-reader-reset";
/** ~max-h-[5.5rem] — clipped preview height when foldable + collapsed */
const COLLAPSED_PREVIEW_PX = 88;

/** Injected into the iframe so the document doesn’t scroll internally; the app scroll area scrolls instead. */
function injectReaderCss(doc: Document): void {
  if (doc.getElementById(READER_STYLE_ID)) return;
  const style = doc.createElement("style");
  style.id = READER_STYLE_ID;
  style.textContent = `
    html {
      overflow-x: hidden !important;
      overflow-x: clip !important;
      overflow-y: visible !important;
      width: 100% !important;
      max-width: 100% !important;
      margin: 0 !important;
      padding: 0 !important;
      /* Do not set background — let the email HTML / UA define html surface (Gmail-like). */
      scrollbar-width: none;
      -ms-overflow-style: none;
    }
    html::-webkit-scrollbar { width: 0 !important; height: 0 !important; }
    body {
      overflow-x: hidden !important;
      overflow-x: clip !important;
      overflow-y: visible !important;
      margin: 0 !important;
      padding: 0 !important;
      min-width: 0 !important;
      width: 100% !important;
      max-width: 100%;
      box-sizing: border-box !important;
      /* Do not set background — preserves email-authored body/wrapper colors. */
      scrollbar-width: none;
      -ms-overflow-style: none;
    }
    body::-webkit-scrollbar { width: 0 !important; height: 0 !important; }
    body * { box-sizing: border-box; }
    img, svg, video, canvas, picture { max-width: 100% !important; height: auto !important; }
    /* Do not force tables to 100% width — that stretches newsletter layouts; cap overflow only. */
    table { max-width: 100% !important; height: auto !important; }
    td, th { word-wrap: break-word !important; overflow-wrap: anywhere !important; }
    pre { white-space: pre-wrap !important; word-break: break-word !important; }
    /* Viewport units inside the iframe can exceed the email “canvas” (scrollbar / vw quirks). */
    [style*="100vw"], [style*="100vmin"], [style*="100dvw"] {
      width: 100% !important;
      max-width: 100% !important;
    }
    [style*="min-width"][style*="vw"], [style*="min-width"][style*="vmin"] {
      min-width: 0 !important;
      max-width: 100% !important;
    }
  `;
  if (doc.head) doc.head.appendChild(style);
  else doc.documentElement.appendChild(style);
}

function measureIframeContentHeight(win: Window): number {
  const doc = win.document;
  const h = Math.max(
    doc.documentElement?.scrollHeight ?? 0,
    doc.body?.scrollHeight ?? 0,
    doc.documentElement?.offsetHeight ?? 0,
    doc.body?.offsetHeight ?? 0,
  );
  return Math.max(h, 1);
}

type EmailHtmlIframeProps = {
  /** Full HTML document string for `srcDoc` (already sanitized). */
  srcDoc: string;
  /** When false, outer wrapper clips height (preview). */
  expanded: boolean;
  className?: string;
};

/**
 * Sandboxed email document: fills the parent width (use {@link EmailHtmlReadingSurface} for a centered stage).
 * Height follows content so the outer thread scrolls (no inner iframe scrollbars).
 */
export function EmailHtmlIframe({ srcDoc, expanded, className }: EmailHtmlIframeProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [contentHeightPx, setContentHeightPx] = useState(200);

  const measure = useCallback(() => {
    const iframe = iframeRef.current;
    const win = iframe?.contentWindow;
    if (!win?.document?.documentElement) return;
    try {
      injectReaderCss(win.document);
      const h = measureIframeContentHeight(win);
      setContentHeightPx(h);
    } catch {
      /* ignore */
    }
  }, []);

  const scheduleMeasure = useCallback(() => {
    measure();
    requestAnimationFrame(() => {
      measure();
      requestAnimationFrame(() => measure());
    });
    window.setTimeout(measure, 50);
    window.setTimeout(measure, 300);
  }, [measure]);

  const onLoad = useCallback(() => {
    scheduleMeasure();
    const win = iframeRef.current?.contentWindow;
    if (!win?.document) return;
    const imgs = win.document.querySelectorAll("img");
    imgs.forEach((img) => {
      if (img.complete) return;
      img.addEventListener("load", scheduleMeasure, { once: true });
      img.addEventListener("error", scheduleMeasure, { once: true });
    });
  }, [scheduleMeasure]);

  useEffect(() => {
    scheduleMeasure();
  }, [srcDoc, expanded, scheduleMeasure]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => scheduleMeasure());
    ro.observe(el);
    return () => ro.disconnect();
  }, [scheduleMeasure]);

  useEffect(() => {
    const onResize = () => scheduleMeasure();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [scheduleMeasure]);

  const iframeDisplayHeightPx = expanded ? contentHeightPx : Math.min(contentHeightPx, COLLAPSED_PREVIEW_PX);

  return (
    <div
      ref={containerRef}
      className={
        expanded
          ? "w-full min-w-0 max-w-full overflow-x-clip " + (className ?? "")
          : "max-h-[5.5rem] w-full min-w-0 max-w-full overflow-hidden " + (className ?? "")
      }
    >
      <iframe
        ref={iframeRef}
        title="Email message"
        srcDoc={srcDoc}
        sandbox={SANDBOX}
        referrerPolicy="no-referrer"
        onLoad={onLoad}
        className="block w-full max-w-full min-w-0 border-0 bg-transparent align-top"
        style={{
          width: "100%",
          maxWidth: "100%",
          height: iframeDisplayHeightPx,
          minHeight: expanded ? 120 : iframeDisplayHeightPx,
          overflow: "hidden",
          display: "block",
        }}
      />
    </div>
  );
}
