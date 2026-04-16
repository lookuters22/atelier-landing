/**
 * One-line preview text for collapsed thread rows (plain + imported HTML bodies).
 */

export function stripHtmlToPlainSnippet(html: string, maxChars = 220): string {
  const t = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  if (t.length <= maxChars) return t;
  return t.slice(0, maxChars - 1).trimEnd() + "…";
}

export function snippetForThreadRow(opts: {
  body: string;
  bodyHtmlSanitized?: string | null;
  maxChars?: number;
}): string {
  const plain = (opts.body ?? "").trim();
  if (plain.length > 0) {
    const oneLine = plain.replace(/\s+/g, " ").trim();
    const max = opts.maxChars ?? 140;
    return oneLine.length <= max ? oneLine : oneLine.slice(0, max - 1).trimEnd() + "…";
  }
  if (opts.bodyHtmlSanitized) {
    return stripHtmlToPlainSnippet(opts.bodyHtmlSanitized, opts.maxChars ?? 140);
  }
  return "—";
}
