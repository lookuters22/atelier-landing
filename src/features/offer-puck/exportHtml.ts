import type { Data } from "@measured/puck";
import type { CoverImageProps } from "./blocks/CoverImageBlock";
import type { GalleryGridProps, GalleryItem } from "./blocks/GalleryGridBlock";
import type { PricingTierProps } from "./blocks/PricingTierBlock";
import type { SplitBlockProps } from "./blocks/SplitBlock";
import type { StatementBlockProps } from "./blocks/StatementBlock";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const sectionMaxWidthCss: Record<CoverImageProps["sectionMaxWidth"], string> = {
  full: "100%",
  "3xl": "48rem",
  "5xl": "64rem",
  "7xl": "80rem",
};

function escapeCssAspect(s: string): string {
  const t = (s || "3/4").trim();
  return t.includes("/") ? t.replace(/\s*\/\s*/, " / ") : "3 / 4";
}

function clampCover(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function numericOr(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

/** Desktop aspect override (mobile is inline on the section). */
function coverAspectMediaRule(p: CoverImageProps, cls: string): string {
  const ad = escapeCssAspect(p.aspectDesktop ?? "16/10");
  return `@media (min-width:640px){ .${cls}{ aspect-ratio:${ad} !important; } }`;
}

function coverHtml(p: CoverImageProps, arClass: string): string {
  const align =
    p.align === "center"
      ? "align-items:center;justify-content:center;text-align:center"
      : p.align === "bottom-center"
        ? "align-items:flex-end;justify-content:center;text-align:center"
        : "align-items:flex-end;justify-content:flex-start;text-align:left";
  const maxW = sectionMaxWidthCss[p.sectionMaxWidth ?? "full"] ?? "100%";
  const am = escapeCssAspect(p.aspectMobile ?? "3/4");
  const fx = clampCover(Number.isFinite(p.imageFocalX) ? Number(p.imageFocalX) : 50, 0, 100);
  const fy = clampCover(Number.isFinite(p.imageFocalY) ? Number(p.imageFocalY) : 50, 0, 100);
  const sc = clampCover(Number.isFinite(p.imageScale) ? Number(p.imageScale) : 1, 1, 1.5);
  const fit = p.imageFit === "contain" ? "contain" : "cover";
  const img = p.imageSrc
    ? `<div style="position:absolute;inset:0;overflow:hidden;"><img src="${escapeHtml(p.imageSrc)}" alt="" style="position:absolute;inset:0;width:100%;height:100%;object-fit:${fit};object-position:${fx}% ${fy}%;transform:scale(${sc});transform-origin:${fx}% ${fy}%;" /></div>`
    : "";
  return `<section class="offer-block offer-cover ${arClass}" style="position:relative;width:100%;max-width:${maxW};margin:0 auto;overflow:hidden;background:#0a0a0a;aspect-ratio:${am};">
  ${img}
  <div style="position:absolute;inset:0;pointer-events:none;background:linear-gradient(to top, rgba(0,0,0,0.75), rgba(0,0,0,0.2), transparent);"></div>
  <div style="position:absolute;inset:0;display:flex;padding:2rem;${align}">
    <div style="max-width:36rem;">
      <p style="font-size:10px;letter-spacing:0.28em;text-transform:uppercase;color:rgba(255,255,255,0.6);margin:0 0 0.5rem;">Cover</p>
      <h2 style="margin:0;font-family:Georgia,serif;font-weight:300;font-size:clamp(1.75rem,4vw,2.75rem);color:#fff;">${escapeHtml(p.title || "")}</h2>
      ${p.subtitle ? `<p style="margin:0.75rem 0 0;font-size:0.875rem;font-weight:300;line-height:1.6;color:rgba(255,255,255,0.85);">${escapeHtml(p.subtitle)}</p>` : ""}
    </div>
  </div>
</section>`;
}

function splitHtml(p: SplitBlockProps): string {
  const r = Math.round((p.splitRatio || 0.5) * 1000) / 10;
  const fit = p.imageFit === "contain" ? "contain" : "cover";
  const fx = clampCover(numericOr(p.imageFocalX, 50), 0, 100);
  const fy = clampCover(numericOr(p.imageFocalY, 50), 0, 100);
  const sc = clampCover(numericOr(p.imageScale, 1), 1, 2.4);
  const img = p.imageSrc
    ? `<img src="${escapeHtml(p.imageSrc)}" alt="" style="width:100%;height:100%;object-fit:${fit};object-position:${fx}% ${fy}%;transform:scale(${sc});transform-origin:${fx}% ${fy}%;" />`
    : `<div style="min-height:200px;background:#f5f5f5;"></div>`;
  const text = `<div style="flex:1;padding:2.5rem 2rem;display:flex;flex-direction:column;justify-content:center;background:#fff;">
    <p style="font-size:10px;letter-spacing:0.28em;text-transform:uppercase;color:#737373;margin:0 0 0.5rem;">Editorial</p>
    <div style="font-size:0.875rem;font-weight:300;line-height:1.85;color:#404040;white-space:pre-wrap;">${escapeHtml(p.body || "")}</div>
  </div>`;
  const imgCol = `<div style="flex:0 0 ${r}%;min-width:0;position:relative;overflow:hidden;background:#f5f5f5;">${img}</div>`;
  if (p.imageSide === "left") {
    return `<section class="offer-block offer-split" style="display:flex;flex-wrap:wrap;width:100%;border-top:1px solid #e5e5e5;border-bottom:1px solid #e5e5e5;">
      ${imgCol}${text}
    </section>`;
  }
  return `<section class="offer-block offer-split" style="display:flex;flex-wrap:wrap;width:100%;border-top:1px solid #e5e5e5;border-bottom:1px solid #e5e5e5;">
    ${text}${imgCol}
  </section>`;
}

function statementHtml(p: StatementBlockProps): string {
  const ta =
    p.alignment === "center"
      ? "center"
      : p.alignment === "right"
        ? "right"
        : "left";
  return `<section class="offer-block offer-statement" style="width:100%;border-top:1px solid #e5e5e5;padding:3rem 0;">
  <p style="margin:0;font-family:Georgia,serif;font-weight:300;font-size:1.05rem;line-height:1.85;letter-spacing:0.02em;color:#292524;white-space:pre-wrap;text-align:${ta};">${escapeHtml(p.body || "")}</p>
</section>`;
}

function pricingTierHtml(p: PricingTierProps): string {
  const lines = Array.isArray(p.features) ? p.features : [];
  const lis = lines
    .map(
      (line) =>
        `<li style="display:flex;gap:0.5rem;margin:0 0 0.5rem 0;font-size:0.875rem;font-weight:300;line-height:1.6;color:#404040;"><span style="margin-top:0.45rem;width:0.25rem;height:0.25rem;min-width:0.25rem;border-radius:9999px;background:#a3a3a3;"></span><span>${escapeHtml(line.text || "")}</span></li>`,
    )
    .join("");
  const footer = p.footerNote
    ? `<p style="margin:2rem 0 0;font-size:12px;font-weight:300;line-height:1.6;color:#737373;">${escapeHtml(p.footerNote)}</p>`
    : "";
  return `<section class="offer-block offer-pricing" style="width:100%;border-top:1px solid #e5e5e5;padding:3rem 0;">
  <div style="display:flex;flex-wrap:wrap;gap:2rem;justify-content:space-between;align-items:flex-start;">
    <div>
      <p style="margin:0;font-size:10px;letter-spacing:0.28em;text-transform:uppercase;color:#737373;">${escapeHtml(p.tierName || "")}</p>
      <p style="margin:0.5rem 0 0;font-family:Georgia,serif;font-weight:300;font-size:2rem;letter-spacing:-0.02em;color:#1c1917;">${escapeHtml(p.price || "")}</p>
    </div>
    <ul style="margin:0;padding:0;list-style:none;max-width:36rem;flex:1;">${lis}</ul>
  </div>
  ${footer}
</section>`;
}

function galleryHtml(p: GalleryGridProps): string {
  const cols = p.columns === 3 ? 3 : 2;
  const items = Array.isArray(p.items) ? p.items : [];
  const cells = items
    .map((it: GalleryItem) => {
      const fit = it.fit === "contain" ? "contain" : "cover";
      const focalX = Math.max(0, Math.min(100, numericOr(it.focalX, 50)));
      const focalY = Math.max(0, Math.min(100, numericOr(it.focalY, 50)));
      const zoom = Math.max(1, Math.min(2, numericOr(it.zoom, 1)));
      const inner = it.src
        ? `<img src="${escapeHtml(it.src)}" alt="" style="width:100%;height:100%;object-fit:${fit};object-position:${focalX}% ${focalY}%;transform:scale(${zoom});transform-origin:${focalX}% ${focalY}%;" />`
        : `<div style="min-height:120px;background:#fafafa;"></div>`;
      const ar = numericOr(it.aspectRatio, 1);
      return `<div style="position:relative;overflow:hidden;background:#fff;aspect-ratio:${ar};">${inner}</div>`;
    })
    .join("");
  const cap = p.caption
    ? `<p style="margin:1.5rem 0 0;text-align:center;font-size:11px;font-weight:300;letter-spacing:0.2em;text-transform:uppercase;color:#737373;">${escapeHtml(p.caption)}</p>`
    : "";
  return `<section class="offer-block offer-gallery" style="width:100%;padding-top:2.5rem;border-top:1px solid #e5e5e5;">
    <p style="font-size:10px;letter-spacing:0.28em;text-transform:uppercase;color:#737373;margin:0 0 1.5rem;">Gallery</p>
    <div style="display:grid;grid-template-columns:repeat(${cols},minmax(0,1fr));gap:1px;background:#e5e5e5;padding:1px;">
      ${cells}
    </div>
    ${cap}
  </section>`;
}

/** Serialize Puck page data to a standalone HTML document (print-friendly). */
export function buildStandaloneHtmlFromPuck(data: Data): string {
  const rootTitle =
    (data.root?.props as { title?: string } | undefined)?.title ?? "Investment guide";
  const documentTitle = rootTitle;
  const parts: string[] = [];
  const coverCss: string[] = [];
  let coverIdx = 0;
  parts.push(`<header style="border-bottom:1px solid #e7e5e4;padding-bottom:2rem;margin-bottom:3rem;">
  <p style="font-size:10px;letter-spacing:0.28em;text-transform:uppercase;color:#737373;margin:0 0 0.5rem;">Document</p>
  <h1 style="margin:0;font-family:Georgia,serif;font-weight:300;font-size:1.5rem;letter-spacing:-0.02em;color:#1c1917;">${escapeHtml(documentTitle)}</h1>
</header>`);
  const content = Array.isArray(data.content) ? data.content : [];
  for (const item of content) {
    if (item.type === "CoverImage") {
      const cp = item.props as CoverImageProps;
      const cls = `offer-cover-ar-${coverIdx++}`;
      coverCss.push(coverAspectMediaRule(cp, cls));
      parts.push(coverHtml(cp, cls));
    } else if (item.type === "SplitBlock") {
      parts.push(splitHtml(item.props as SplitBlockProps));
    } else if (item.type === "GalleryGrid") {
      parts.push(galleryHtml(item.props as GalleryGridProps));
    } else if (item.type === "StatementBlock") {
      parts.push(statementHtml(item.props as StatementBlockProps));
    } else if (item.type === "PricingTier") {
      parts.push(pricingTierHtml(item.props as PricingTierProps));
    }
  }
  const inner = parts.join("\n");
  const title = escapeHtml(documentTitle);
  const coverCssBlock = coverCss.length ? `${coverCss.join("\n")}\n` : "";
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${title}</title>
<style>
  :root { color-scheme: light; }
  body { margin: 0; font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif; background: #fafaf9; color: #1c1917; }
  .offer-doc { max-width: min(100%, 80rem); margin: 0 auto; padding: 2.5rem 1.25rem 4rem; box-sizing: border-box; }
  @media print { body { background: #fff; } .offer-doc { padding: 0; max-width: none; } }
${coverCssBlock}</style>
</head>
<body>
<main class="offer-doc">
${inner}
</main>
</body>
</html>`;
}
