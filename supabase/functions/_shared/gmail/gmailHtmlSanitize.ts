/**
 * Server-side HTML sanitization for Gmail `text/html` bodies before storage in `messages.metadata`.
 * Defense-in-depth: the client re-sanitizes before `dangerouslySetInnerHTML`.
 *
 * Hardening: no remote URL loads for media (tracking pixels / beacons); no video/audio/source/track;
 * inline styles may only use `url(data:...)` for backgrounds, not remote http(s) CSS URLs.
 */
import sanitizeHtml from "npm:sanitize-html@2.13.0";

import { GMAIL_HTML_MAX_STORAGE_CHARS } from "./gmailHtmlLimits.ts";

export { GMAIL_HTML_MAX_STORAGE_CHARS } from "./gmailHtmlLimits.ts";

/** Allows solid colors and `url(data:...)` only — blocks remote `url(https://...)` in styles. */
const urlDataOnly = /^url\(\s*data:[^)]+\)$/i;

const allowedStyles: Record<string, Record<string, RegExp[]>> = {
  "*": {
    color: [/^#[0-9a-f]{3,8}$/i, /^rgb\(/i, /^rgba\(/i],
    "background-color": [/^#[0-9a-f]{3,8}$/i, /^rgb\(/i, /^rgba\(/i, /^transparent$/i],
    /** After asset inlining, `url(data:...)` must survive sanitization; remote URLs are stripped. */
    background: [urlDataOnly, /^none$/i, /^transparent$/i, /^#[0-9a-f]{3,8}$/i, /^rgb\(/i, /^rgba\(/i],
    "background-image": [urlDataOnly, /^none$/i],
    "background-size": [/^[\w\s,.%\-]+$/i],
    "background-repeat": [/^[\w\s-]+$/i],
    "background-position": [/^[\w\s,.%\-]+$/i],
    "text-align": [/^left$/i, /^right$/i, /^center$/i, /^justify$/i],
    "font-size": [/^\d+(?:px|pt|em|%|rem)$/i],
    "font-weight": [/^bold$/i, /^normal$/i, /^\d{3}$/],
    "line-height": [/^\d+(?:\.\d+)?$/i, /^\d+(?:px|em|%)$/i],
    margin: [/^\d+(?:px|em|%)?$/i, /^\d+px\s+\d+px$/i],
    padding: [/^\d+(?:px|em|%)?$/i, /^\d+px\s+\d+px(?:\s+\d+px\s+\d+px)?$/i],
    width: [/^\d+(?:px|%)$/i],
    "max-width": [/^\d+(?:px|%)$/i],
    border: [/^[\d\w\s#(),.%\-]+$/i],
    "border-radius": [/^\d+px$/i],
    display: [/^block$/i, /^inline$/i, /^inline-block$/i, /^table$/i, /^table-row$/i, /^table-cell$/i],
  },
};

export function sanitizeGmailHtmlForStorage(raw: string): string {
  const trimmed = raw.length > GMAIL_HTML_MAX_STORAGE_CHARS ? raw.slice(0, GMAIL_HTML_MAX_STORAGE_CHARS) : raw;
  return sanitizeHtml(trimmed, {
    allowedTags: [
      "html",
      "head",
      "body",
      "style",
      "title",
      "meta",
      "p",
      "br",
      "div",
      "span",
      "center",
      "hr",
      "h1",
      "h2",
      "h3",
      "h4",
      "h5",
      "h6",
      "ul",
      "ol",
      "li",
      "table",
      "thead",
      "tbody",
      "tfoot",
      "tr",
      "td",
      "th",
      "colgroup",
      "col",
      "caption",
      "strong",
      "b",
      "em",
      "i",
      "u",
      "s",
      "strike",
      "sub",
      "sup",
      "small",
      "blockquote",
      "pre",
      "code",
      "a",
      "img",
      "font",
    ],
    allowedAttributes: {
      html: ["lang", "xmlns", "dir"],
      head: [],
      body: ["style", "class", "bgcolor", "dir", "lang", "id"],
      style: ["type", "media"],
      title: [],
      meta: ["charset", "name", "content", "http-equiv"],
      a: ["href", "name", "title", "target", "rel"],
      img: ["src", "alt", "width", "height", "title"],
      td: ["colspan", "rowspan", "align", "valign", "width", "height"],
      th: ["colspan", "rowspan", "align", "valign", "width", "height"],
      table: ["border", "cellpadding", "cellspacing", "width", "align", "role"],
      font: ["color", "face", "size"],
      "*": ["style", "class", "dir", "lang"],
    },
    exclusiveFilter(frame) {
      if (frame.tag === "meta") {
        const a = frame.attribs ?? {};
        if (a.charset) return false;
        if (String(a.name ?? "").toLowerCase() === "viewport" && a.content) return false;
        const he = String(a["http-equiv"] ?? "").toLowerCase();
        if (he === "content-type" && a.content) return false;
        return true;
      }
      return false;
    },
    allowedStyles,
    allowedSchemes: ["http", "https", "mailto", "tel", "cid"],
    allowedSchemesByTag: {
      /** Remote http(s) images are tracking vectors; only cid/data after inline pipeline. */
      img: ["cid", "data"],
    },
    transformTags: {
      a: (tagName, attribs) => ({
        tagName: "a",
        attribs: {
          href: attribs.href,
          title: attribs.title,
          target: "_blank",
          rel: "noopener noreferrer",
        },
      }),
    },
  });
}
