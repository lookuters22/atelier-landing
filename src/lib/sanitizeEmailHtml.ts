/**
 * Client-side email HTML for the sandboxed `EmailHtmlIframe` (Slice 4: remote `<img>` http(s) allowed;
 * script/iframe/embed/etc. remain forbidden; `on*` handlers extended in `FORBID_ATTR`).
 */
import createDOMPurify from "dompurify";

let purifySingleton: ReturnType<typeof createDOMPurify> | null = null;

/** DOMPurify requires a DOM (browser or Vitest jsdom). Lazy-init avoids SSR issues. */
function getPurify(): ReturnType<typeof createDOMPurify> {
  if (purifySingleton) return purifySingleton;
  const w =
    typeof globalThis !== "undefined" && typeof (globalThis as { document?: Document }).document !== "undefined"
      ? (globalThis as unknown as Window)
      : null;
  if (!w?.document) {
    throw new Error("sanitizeEmailHtmlForIframe requires a DOM (browser or @vitest-environment jsdom)");
  }
  purifySingleton = createDOMPurify(w);
  return purifySingleton;
}

const URI_REG =
  /^(?:(?:https?|mailto|tel|cid|callto|sms|xmpp|data):|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i;

let hooksInstalled = false;
function ensureEmailSanitizerHooks(purify: ReturnType<typeof createDOMPurify>): void {
  if (hooksInstalled) return;
  hooksInstalled = true;
  /**
   * Gmail-like email viewing: allow remote http(s) images in `<img src>` / `srcset` inside the sandboxed
   * iframe. Other media (`video`, `audio`, …) stay forbidden via `FORBID_TAGS`; dangerous active content
   * stays blocked via `FORBID_ATTR` and default DOMPurify behavior.
   */
  purify.addHook("afterSanitizeAttributes", (node: Element) => {
    if (node.nodeName?.toLowerCase() !== "a") return;
    const el = node;
    const href = el.getAttribute("href");
    if (!href || typeof href !== "string") return;
    const t = href.trim();
    /** Open web URLs in a new tab so the app shell is not navigated; skip `mailto:` / `tel:` / etc. */
    const isHttpLike = /^https?:\/\//i.test(t) || /^\/\//.test(t);
    if (!isHttpLike) return;
    if (!el.hasAttribute("target")) el.setAttribute("target", "_blank");
    const rel = el.getAttribute("rel")?.trim() ?? "";
    const parts = new Set(rel.split(/\s+/).filter(Boolean));
    parts.add("noopener");
    parts.add("noreferrer");
    el.setAttribute("rel", [...parts].join(" "));
  });
}

const PURIFY_IFRAME: import("dompurify").Config = {
  WHOLE_DOCUMENT: true,
  ADD_ATTR: ["target", "rel", "charset", "http-equiv", "content", "media", "xmlns"],
  ADD_TAGS: ["style", "link", "meta", "title", "head", "body", "html"],
  ADD_DATA_URI_TAGS: ["img"],
  ALLOWED_URI_REGEXP: URI_REG,
  FORBID_TAGS: [
    "script",
    "iframe",
    "object",
    "embed",
    "base",
    "form",
    "input",
    "button",
    "video",
    "audio",
    "source",
    "track",
  ],
  FORBID_ATTR: [
    "onerror",
    "onload",
    "onclick",
    "onmouseover",
    "onmouseenter",
    "onmouseleave",
    "onmousedown",
    "onmouseup",
    "onfocus",
    "onblur",
    "oninput",
    "onkeyup",
    "onkeydown",
    "onchange",
    "onsubmit",
  ],
};

/**
 * Wrap a fragment so DOMPurify can treat it as a document (head styles, body layout).
 */
export function wrapEmailFragmentAsDocument(html: string): string {
  const t = html.trim();
  if (/^<!DOCTYPE/i.test(t) || /^<html[\s>]/i.test(t)) return html;
  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>${html}</body></html>`;
}

/**
 * Client-side sanitization for email HTML shown inside a sandboxed iframe (`srcDoc`).
 * Uses whole-document mode so `<html>`, `<head>`, `<style>`, and `<body>` are preserved when safe.
 */
export function sanitizeEmailHtmlForIframe(raw: string): string {
  const purify = getPurify();
  ensureEmailSanitizerHooks(purify);
  const wrapped = wrapEmailFragmentAsDocument(raw);
  return purify.sanitize(wrapped, PURIFY_IFRAME);
}

/**
 * @returns Sanitized full document, or `null` if sanitization yields nothing useful.
 */
export function trySanitizeEmailHtmlForIframe(raw: string | null | undefined): string | null {
  if (typeof raw !== "string" || raw.trim().length === 0) return null;
  try {
    const out = sanitizeEmailHtmlForIframe(raw).trim();
    if (out.length === 0) return null;
    return out;
  } catch {
    return null;
  }
}
