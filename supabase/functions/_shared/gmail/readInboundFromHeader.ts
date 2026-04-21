/**
 * Read the inbound `From` header back from a materialized `messages.metadata`
 * row. Companion to `extractSuppressionRelevantInboundHeaders` in
 * `buildGmailMaterializationArtifact.ts` — that one PERSISTS the structured
 * headers slice; this one READS it back when feeding the suppression
 * classifier or auditing a thread post-hoc.
 *
 * Lives in its own module so unit tests can import the pure helper without
 * dragging in `gmailImportMaterialize.ts` → `supabase.ts` → `npm:@supabase/...`
 * which Vitest cannot resolve.
 *
 * Returns `null` when:
 *   - metadata is missing or not an object
 *   - `gmail_import.inbound_headers` is absent (legacy materialization or
 *     non-Gmail message)
 *   - the `from` field is missing or empty after trimming
 */
export function readInboundFromHeader(
  metadata: Record<string, unknown> | null | undefined,
): string | null {
  if (!metadata || typeof metadata !== "object") return null;
  const gi = (metadata as Record<string, unknown>).gmail_import;
  if (!gi || typeof gi !== "object") return null;
  const headers = (gi as Record<string, unknown>).inbound_headers;
  if (!headers || typeof headers !== "object") return null;
  const from = (headers as Record<string, unknown>).from;
  if (typeof from !== "string") return null;
  const trimmed = from.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Map persisted `gmail_import.inbound_headers` (snake_case) into the header
 * map expected by `classifyInboundSuppression` (lower-case RFC names).
 * Returns `null` when no suppression-relevant headers were stored.
 */
export function inboundMetadataHeadersForClassifier(
  metadata: Record<string, unknown> | null | undefined,
): Record<string, string | null | undefined> | null {
  if (!metadata || typeof metadata !== "object") return null;
  const gi = (metadata as Record<string, unknown>).gmail_import;
  if (!gi || typeof gi !== "object") return null;
  const h = (gi as Record<string, unknown>).inbound_headers;
  if (!h || typeof h !== "object") return null;
  const o = h as Record<string, unknown>;
  const pick = (k: string): string | undefined => {
    const v = o[k];
    if (typeof v !== "string") return undefined;
    const t = v.trim();
    return t.length > 0 ? t : undefined;
  };
  const auto = pick("auto_submitted");
  const prec = pick("precedence");
  const lu = pick("list_unsubscribe");
  const lid = pick("list_id");
  if (!auto && !prec && !lu && !lid) return null;
  return {
    "auto-submitted": auto,
    precedence: prec,
    "list-unsubscribe": lu,
    "list-id": lid,
  };
}
