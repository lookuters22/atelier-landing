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
