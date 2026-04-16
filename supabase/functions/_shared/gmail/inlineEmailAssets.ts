/**
 * Prefetch remote http(s) assets (img, srcset, CSS url(...), @import, link stylesheet) and inline
 * as data: URIs or merged <style> so Inbox refresh does not re-hit third-party hosts.
 */
import { load } from "npm:cheerio@1.0.0-rc.12";
import { fetchWithTimeout } from "../http/fetchWithTimeout.ts";

export { scanRemainingRemoteAssetRefs } from "./gmailEmailRemoteAssetScan.ts";

const MAX_ROUNDS = 3;
const MAX_ASSET_URLS_PER_ROUND = 90;
const MAX_PER_ASSET_BYTES = 500_000;
const MAX_TOTAL_INLINED_BYTES = 4_000_000;
const FETCH_MS = 8_000;

const ALLOWED_IMAGE_MIME = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/avif",
]);

const ALLOWED_FONT_MIME = new Set([
  "font/woff2",
  "font/woff",
  "application/font-woff2",
  "application/font-woff",
  "application/x-font-woff",
  "font/ttf",
  "font/otf",
  "application/font-sfnt",
  "application/vnd.ms-fontobject",
]);

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.byteLength; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export function isBlockedAssetHost(hostname: string): boolean {
  const h = hostname.trim().toLowerCase();
  if (!h) return true;
  if (h === "localhost" || h === "127.0.0.1" || h === "0.0.0.0" || h === "::1") return true;
  if (h.endsWith(".localhost") || h.endsWith(".local")) return true;
  if (h === "metadata.google.internal") return true;

  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(h);
  if (m) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 192 && b === 168) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
  }
  return false;
}

/** Normalize remote http(s) or protocol-relative URL for dedupe. */
export function normalizeRemoteHttpUrl(raw: string): string | null {
  const t = raw.trim();
  if (!t || t.startsWith("data:") || t.startsWith("cid:")) return null;
  if (t.startsWith("//")) {
    try {
      const u = new URL("https:" + t);
      if (isBlockedAssetHost(u.hostname)) return null;
      return u.href;
    } catch {
      return null;
    }
  }
  try {
    const u = new URL(t);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    if (isBlockedAssetHost(u.hostname)) return null;
    return u.href;
  } catch {
    return null;
  }
}

function normalizeMimeFromResponse(url: string, ctRaw: string): string | null {
  const ct = ctRaw.split(";")[0].trim().toLowerCase();
  const jpg = ct === "image/jpg" ? "image/jpeg" : ct;
  if (ALLOWED_IMAGE_MIME.has(jpg)) return jpg;
  if (ALLOWED_FONT_MIME.has(ct)) return ct;
  if (ct === "text/css" || ct === "application/x-css") return "text/css";
  if (ct === "text/plain" && url.toLowerCase().includes(".css")) return "text/css";
  if (ct === "application/octet-stream") {
    const u = url.toLowerCase();
    if (u.includes(".woff2")) return "font/woff2";
    if (u.includes(".woff")) return "font/woff";
    if (u.includes(".ttf")) return "font/ttf";
    if (u.includes(".otf")) return "font/otf";
    if (u.includes(".eot")) return "application/vnd.ms-fontobject";
    if (u.includes(".css")) return "text/css";
  }
  return null;
}

async function fetchRemoteAssetAsDataUri(url: string): Promise<string | null> {
  try {
    const res = await fetchWithTimeout(url, {
      redirect: "follow",
      headers: {
        Accept: "text/css,*/*;q=0.9,image/avif,image/webp,image/apng,image/*,font/*",
        "User-Agent": "Mozilla/5.0 (compatible; AtelierEmailAssetInline/1.0)",
      },
      timeoutMs: FETCH_MS,
    });
    if (!res.ok) return null;
    const ctHeader = res.headers.get("content-type") ?? "";
    const mime = normalizeMimeFromResponse(url, ctHeader);
    if (!mime) return null;
    const buf = new Uint8Array(await res.arrayBuffer());
    if (buf.byteLength === 0 || buf.byteLength > MAX_PER_ASSET_BYTES) return null;
    const b64 = uint8ToBase64(buf);
    if (mime === "text/css") {
      return `data:text/css;charset=utf-8;base64,${b64}`;
    }
    return `data:${mime};base64,${b64}`;
  } catch {
    return null;
  }
}

/** Fetch external stylesheet as UTF-8 text (preferred for <link> merge). */
async function fetchRemoteStylesheetText(url: string): Promise<string | null> {
  try {
    const res = await fetchWithTimeout(url, {
      redirect: "follow",
      headers: {
        Accept: "text/css,*/*;q=0.8",
        "User-Agent": "Mozilla/5.0 (compatible; AtelierEmailAssetInline/1.0)",
      },
      timeoutMs: FETCH_MS,
    });
    if (!res.ok) return null;
    const ct = (res.headers.get("content-type") ?? "").toLowerCase();
    const u = url.toLowerCase();
    if (!ct.includes("css") && !ct.includes("text/plain") && !u.includes(".css")) return null;
    const text = await res.text();
    return text.length > 0 && text.length <= MAX_PER_ASSET_BYTES ? text : null;
  } catch {
    return null;
  }
}

/**
 * All `url(...)` inner values that normalize to a remote http(s) URL (includes `//cdn...`).
 */
export function extractRemoteAssetUrlsFromCss(css: string): string[] {
  const out: string[] = [];
  const re = /url\s*\(\s*(['"]?)([^'")]+)\1\s*\)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(css)) !== null) {
    const raw = m[2].trim();
    if (normalizeRemoteHttpUrl(raw)) out.push(raw);
  }
  return out;
}

/**
 * @import "https://..." | @import url(...) | @import url(//...)
 */
export function extractImportUrlsFromCss(css: string): string[] {
  const out: string[] = [];
  const re1 = /@import\s+url\s*\(\s*(['"]?)([^'")]+)\1\s*\)\s*;?/gi;
  let m: RegExpExecArray | null;
  while ((m = re1.exec(css)) !== null) {
    const raw = m[2].trim();
    if (normalizeRemoteHttpUrl(raw)) out.push(raw);
  }
  const re2 = /@import\s+(["'])((?:https?:\/\/|\/\/)[^'"]+)\1\s*;?/gi;
  while ((m = re2.exec(css)) !== null) {
    const raw = m[2].trim();
    if (normalizeRemoteHttpUrl(raw)) out.push(raw);
  }
  return out;
}

export function rewriteCssUrlsWithMap(css: string, map: Map<string, string>): string {
  return css.replace(/url\s*\(\s*(['"]?)([^'")]+)\1\s*\)/gi, (full, quote, inner) => {
    const norm = normalizeRemoteHttpUrl(inner.trim());
    if (!norm) return full;
    const rep = map.get(norm);
    if (!rep) return full;
    return `url(${quote}${rep}${quote})`;
  });
}

export function rewriteCssImportsWithMap(css: string, map: Map<string, string>): string {
  let s = css.replace(/@import\s+url\s*\(\s*(['"]?)([^'")]+)\1\s*\)\s*;?/gi, (full, quote, inner) => {
    const norm = normalizeRemoteHttpUrl(inner.trim());
    if (!norm) return full;
    const rep = map.get(norm);
    if (!rep) return full;
    return `@import url(${quote}${rep}${quote});`;
  });
  s = s.replace(/@import\s+(["'])((?:https?:\/\/|\/\/)[^'"]+)\1\s*;?/gi, (full, q, inner) => {
    const norm = normalizeRemoteHttpUrl(inner.trim());
    if (!norm) return full;
    const rep = map.get(norm);
    if (!rep) return full;
    return `@import url(${q}${rep}${q});`;
  });
  return s;
}

function applyCssRewrites(css: string, dataUriByUrl: Map<string, string>): string {
  let s = rewriteCssUrlsWithMap(css, dataUriByUrl);
  s = rewriteCssImportsWithMap(s, dataUriByUrl);
  return s;
}

export function parseSrcsetUrls(srcset: string): string[] {
  const out: string[] = [];
  for (const part of srcset.split(",")) {
    const t = part.trim();
    if (!t) continue;
    const firstToken = t.split(/\s+/)[0]?.trim() ?? "";
    if (firstToken) out.push(firstToken);
  }
  return out;
}

export type AssetUrlKind =
  | "img_src"
  | "img_srcset"
  | "css_inline_style"
  | "style_tag"
  | "link_stylesheet"
  | "video_src"
  | "video_poster"
  | "audio_src"
  | "media_source_src";

export type InlineEmailAssetsStats = {
  img: {
    attempted: number;
    inlined: number;
    failed: number;
    skipped_non_http: number;
    skipped_cap: number;
    srcset_candidates: number;
  };
  /** video/audio/iframe/embed + media source + poster (G6) */
  media: {
    attempted: number;
    inlined: number;
    failed: number;
    skipped_non_http: number;
    skipped_cap: number;
  };
  css_url: {
    discovered_unique: number;
    attempted: number;
    inlined: number;
    failed: number;
    skipped_non_http: number;
    skipped_cap: number;
  };
  link_stylesheet: {
    discovered: number;
    merged_as_style: number;
    failed: number;
  };
  combined: {
    max_urls_budget_per_round: number;
    rounds_executed: number;
    urls_attempted_total: number;
    approx_total_inlined_bytes: number;
  };
};

/** Stats when remote-asset inlining is skipped (no http(s) refs detected by pre-scan). */
export function emptyInlineEmailAssetsStats(): InlineEmailAssetsStats {
  return {
    img: {
      attempted: 0,
      inlined: 0,
      failed: 0,
      skipped_non_http: 0,
      skipped_cap: 0,
      srcset_candidates: 0,
    },
    media: {
      attempted: 0,
      inlined: 0,
      failed: 0,
      skipped_non_http: 0,
      skipped_cap: 0,
    },
    css_url: {
      discovered_unique: 0,
      attempted: 0,
      inlined: 0,
      failed: 0,
      skipped_non_http: 0,
      skipped_cap: 0,
    },
    link_stylesheet: {
      discovered: 0,
      merged_as_style: 0,
      failed: 0,
    },
    combined: {
      max_urls_budget_per_round: MAX_ASSET_URLS_PER_ROUND,
      rounds_executed: 0,
      urls_attempted_total: 0,
      approx_total_inlined_bytes: 0,
    },
  };
}

// deno-lint-ignore no-explicit-any
function stripResponsiveImageAttrs($: any): void {
  $("img").each((_: number, el: unknown) => {
    const n = $(el);
    n.removeAttr("srcset");
    n.removeAttr("sizes");
  });
  $("picture source").each((_: number, el: unknown) => {
    $(el).removeAttr("srcset");
    $(el).removeAttr("sizes");
  });
  $("video source, audio source").each((_: number, el: unknown) => {
    $(el).removeAttr("srcset");
    $(el).removeAttr("sizes");
  });
}

function collectUrl(
  raw: string,
  unique: Map<string, { raw: string; kind: AssetUrlKind }>,
  stats: { skipped_non_http: number },
  kind: AssetUrlKind,
): void {
  const norm = normalizeRemoteHttpUrl(raw);
  if (!norm) {
    stats.skipped_non_http += 1;
    return;
  }
  if (!unique.has(norm)) unique.set(norm, { raw, kind });
}

function collectFromCssText(
  css: string,
  unique: Map<string, { raw: string; kind: AssetUrlKind }>,
  cssStats: { skipped_non_http: number; discovered_unique: number },
  kind: "css_inline_style" | "style_tag",
): void {
  for (const u of extractRemoteAssetUrlsFromCss(css)) {
    const norm = normalizeRemoteHttpUrl(u);
    if (!norm) {
      cssStats.skipped_non_http += 1;
      continue;
    }
    if (!unique.has(norm)) {
      unique.set(norm, { raw: u, kind });
      cssStats.discovered_unique += 1;
    }
  }
  for (const u of extractImportUrlsFromCss(css)) {
    const norm = normalizeRemoteHttpUrl(u);
    if (!norm) {
      cssStats.skipped_non_http += 1;
      continue;
    }
    if (!unique.has(norm)) {
      unique.set(norm, { raw: u, kind });
      cssStats.discovered_unique += 1;
    }
  }
}

function escapeStyleTextForHtml(css: string): string {
  return css.replace(/<\/style/gi, "<\\/style");
}

function isMediaAssetKind(kind: AssetUrlKind): boolean {
  return (
    kind === "video_src" ||
    kind === "video_poster" ||
    kind === "audio_src" ||
    kind === "media_source_src"
  );
}

// deno-lint-ignore no-explicit-any
function collectAllUrlsFromDom(
  $: any,
  imgStats: InlineEmailAssetsStats["img"],
  mediaStats: InlineEmailAssetsStats["media"],
  cssStats: InlineEmailAssetsStats["css_url"],
  linkStats: InlineEmailAssetsStats["link_stylesheet"],
): Map<string, { raw: string; kind: AssetUrlKind }> {
  const unique = new Map<string, { raw: string; kind: AssetUrlKind }>();

  $("img[src]").each((_: number, el: unknown) => {
    const src = $(el).attr("src");
    if (!src) return;
    collectUrl(src, unique, imgStats, "img_src");
  });

  $("img[srcset]").each((_: number, el: unknown) => {
    const srcset = $(el).attr("srcset");
    if (!srcset) return;
    for (const u of parseSrcsetUrls(srcset)) {
      const norm = normalizeRemoteHttpUrl(u);
      if (!norm) {
        imgStats.skipped_non_http += 1;
        continue;
      }
      if (!unique.has(norm)) {
        unique.set(norm, { raw: u, kind: "img_srcset" });
        imgStats.srcset_candidates += 1;
      }
    }
  });

  $("picture source[srcset]").each((_: number, el: unknown) => {
    const srcset = $(el).attr("srcset");
    if (!srcset) return;
    for (const u of parseSrcsetUrls(srcset)) {
      const norm = normalizeRemoteHttpUrl(u);
      if (!norm) {
        imgStats.skipped_non_http += 1;
        continue;
      }
      if (!unique.has(norm)) {
        unique.set(norm, { raw: u, kind: "img_srcset" });
        imgStats.srcset_candidates += 1;
      }
    }
  });

  $("link[href]").each((_: number, el: unknown) => {
    const rel = String($(el).attr("rel") ?? "").toLowerCase();
    if (rel !== "stylesheet") return;
    const href = $(el).attr("href");
    if (!href) return;
    const norm = normalizeRemoteHttpUrl(href);
    if (!norm) return;
    if (!unique.has(norm)) {
      unique.set(norm, { raw: href, kind: "link_stylesheet" });
      linkStats.discovered += 1;
    }
  });

  $("video[src]").each((_: number, el: unknown) => {
    const src = $(el).attr("src");
    if (!src) return;
    collectUrl(src, unique, mediaStats, "video_src");
  });

  $("video[poster]").each((_: number, el: unknown) => {
    const poster = $(el).attr("poster");
    if (!poster) return;
    collectUrl(poster, unique, mediaStats, "video_poster");
  });

  $("audio[src]").each((_: number, el: unknown) => {
    const src = $(el).attr("src");
    if (!src) return;
    collectUrl(src, unique, mediaStats, "audio_src");
  });

  $("video source[src], audio source[src]").each((_: number, el: unknown) => {
    const src = $(el).attr("src");
    if (!src) return;
    collectUrl(src, unique, mediaStats, "media_source_src");
  });

  $("[style]").each((_: number, el: unknown) => {
    const st = $(el).attr("style");
    if (!st) return;
    collectFromCssText(st, unique, cssStats, "css_inline_style");
  });

  $("style").each((_: number, el: unknown) => {
    const text = $(el).text() ?? "";
    collectFromCssText(text, unique, cssStats, "style_tag");
  });

  return unique;
}

export async function inlineRemoteEmailAssets(html: string): Promise<{
  html: string;
  stats: InlineEmailAssetsStats;
}> {
  const imgStats = {
    attempted: 0,
    inlined: 0,
    failed: 0,
    skipped_non_http: 0,
    skipped_cap: 0,
    srcset_candidates: 0,
  };
  const cssStats = {
    discovered_unique: 0,
    attempted: 0,
    inlined: 0,
    failed: 0,
    skipped_non_http: 0,
    skipped_cap: 0,
  };
  const linkStats = { discovered: 0, merged_as_style: 0, failed: 0 };
  const mediaStats = {
    attempted: 0,
    inlined: 0,
    failed: 0,
    skipped_non_http: 0,
    skipped_cap: 0,
  };

  let $ = load(html, { decodeEntities: false });
  let totalInlinedBytes = 0;
  let urlsAttemptedTotal = 0;
  let roundsExecuted = 0;

  for (let round = 0; round < MAX_ROUNDS; round++) {
    const unique = collectAllUrlsFromDom($, imgStats, mediaStats, cssStats, linkStats);
    const urls = [...unique.keys()].slice(0, MAX_ASSET_URLS_PER_ROUND);
    if (urls.length === 0) {
      roundsExecuted = round;
      break;
    }
    roundsExecuted = round + 1;

    const nImg = urls.filter((u) => {
      const k = unique.get(u)?.kind;
      return k === "img_src" || k === "img_srcset";
    }).length;
    const nMedia = urls.filter((u) => {
      const k = unique.get(u)?.kind;
      return k ? isMediaAssetKind(k) : false;
    }).length;
    const nCss = urls.filter((u) => {
      const k = unique.get(u)?.kind;
      return k === "css_inline_style" || k === "style_tag";
    }).length;
    const nLink = urls.filter((u) => unique.get(u)?.kind === "link_stylesheet").length;
    imgStats.attempted += nImg;
    mediaStats.attempted += nMedia;
    cssStats.attempted += nCss;
    urlsAttemptedTotal += urls.length;

    const dataUriByUrl = new Map<string, string>();
    const stylesheetTextByUrl = new Map<string, string>();

    for (const url of urls) {
      const kind = unique.get(url)?.kind ?? "img_src";
      if (kind === "link_stylesheet") {
        const text = await fetchRemoteStylesheetText(url);
        if (!text) {
          linkStats.failed += 1;
          continue;
        }
        const approxBytes = text.length * 2;
        if (totalInlinedBytes + approxBytes > MAX_TOTAL_INLINED_BYTES) {
          linkStats.failed += 1;
          continue;
        }
        totalInlinedBytes += approxBytes;
        stylesheetTextByUrl.set(url, text);
        continue;
      }

      const dataUri = await fetchRemoteAssetAsDataUri(url);
      if (!dataUri) {
        if (kind === "css_inline_style" || kind === "style_tag") cssStats.failed += 1;
        else if (isMediaAssetKind(kind)) mediaStats.failed += 1;
        else imgStats.failed += 1;
        continue;
      }
      const approxBytes = Math.floor((dataUri.length * 3) / 4);
      if (totalInlinedBytes + approxBytes > MAX_TOTAL_INLINED_BYTES) {
        if (kind === "css_inline_style" || kind === "style_tag") cssStats.skipped_cap += 1;
        else if (isMediaAssetKind(kind)) mediaStats.skipped_cap += 1;
        else imgStats.skipped_cap += 1;
        continue;
      }
      totalInlinedBytes += approxBytes;
      dataUriByUrl.set(url, dataUri);
      if (kind === "css_inline_style" || kind === "style_tag") cssStats.inlined += 1;
      else if (isMediaAssetKind(kind)) mediaStats.inlined += 1;
      else imgStats.inlined += 1;
    }

    $("img[src]").each((_: number, el: unknown) => {
      const src = $(el).attr("src");
      if (!src) return;
      const norm = normalizeRemoteHttpUrl(src);
      if (!norm) return;
      const replacement = dataUriByUrl.get(norm);
      if (replacement) $(el).attr("src", replacement);
    });

    $("video[src]").each((_: number, el: unknown) => {
      const src = $(el).attr("src");
      if (!src) return;
      const norm = normalizeRemoteHttpUrl(src);
      if (!norm) return;
      const replacement = dataUriByUrl.get(norm);
      if (replacement) $(el).attr("src", replacement);
    });

    $("video[poster]").each((_: number, el: unknown) => {
      const poster = $(el).attr("poster");
      if (!poster) return;
      const norm = normalizeRemoteHttpUrl(poster);
      if (!norm) return;
      const replacement = dataUriByUrl.get(norm);
      if (replacement) $(el).attr("poster", replacement);
    });

    $("audio[src]").each((_: number, el: unknown) => {
      const src = $(el).attr("src");
      if (!src) return;
      const norm = normalizeRemoteHttpUrl(src);
      if (!norm) return;
      const replacement = dataUriByUrl.get(norm);
      if (replacement) $(el).attr("src", replacement);
    });

    $("video source[src], audio source[src]").each((_: number, el: unknown) => {
      const src = $(el).attr("src");
      if (!src) return;
      const norm = normalizeRemoteHttpUrl(src);
      if (!norm) return;
      const replacement = dataUriByUrl.get(norm);
      if (replacement) $(el).attr("src", replacement);
    });

    stripResponsiveImageAttrs($);

    $("link[href]").each((_: number, el: unknown) => {
      const rel = String($(el).attr("rel") ?? "").toLowerCase();
      if (rel !== "stylesheet") return;
      const href = $(el).attr("href");
      if (!href) return;
      const norm = normalizeRemoteHttpUrl(href);
      if (!norm) return;
      const text = stylesheetTextByUrl.get(norm);
      if (text) {
        $(el).replaceWith(`<style type="text/css">${escapeStyleTextForHtml(text)}</style>`);
        linkStats.merged_as_style += 1;
      }
    });

    $ = load($.html(), { decodeEntities: false });

    $("[style]").each((_: number, el: unknown) => {
      const st = $(el).attr("style");
      if (!st) return;
      $(el).attr("style", applyCssRewrites(st, dataUriByUrl));
    });

    $("style").each((_: number, el: unknown) => {
      const text = $(el).text() ?? "";
      $(el).text(applyCssRewrites(text, dataUriByUrl));
    });

    $ = load($.html(), { decodeEntities: false });
  }

  return {
    html: $.html(),
    stats: {
      img: imgStats,
      media: mediaStats,
      css_url: cssStats,
      link_stylesheet: linkStats,
      combined: {
        max_urls_budget_per_round: MAX_ASSET_URLS_PER_ROUND,
        rounds_executed: roundsExecuted,
        urls_attempted_total: urlsAttemptedTotal,
        approx_total_inlined_bytes: totalInlinedBytes,
      },
    },
  };
}
