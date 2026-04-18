/**
 * Pure helpers for the inbound-header slice we persist on Gmail import.
 *
 * Lives in its own module (no `npm:` deps, no `supabase.ts`) so it can be
 * unit-tested under Vitest without dragging the Deno-only Supabase client
 * imports through the resolver.
 *
 * Companion to `readInboundFromHeader.ts` (which reads the *materialized*
 * shape back out of `messages.metadata`).
 */
import type { GmailPayloadPart } from "./gmailMessageBody.ts";

/**
 * Allow-listed inbound headers we surface for suppression and routing.
 * `from` is the canonical inbound sender identity needed by
 * `classifyGmailImportCandidate` (sender local-part / domain heuristics) and
 * by `messages.sender` so downstream draft suppression sees the real sender
 * (not the photographer's mailbox).
 */
export type GmailInboundHeadersV1 = {
  from: string | null;
  list_unsubscribe: string | null;
  list_id: string | null;
  precedence: string | null;
  auto_submitted: string | null;
};

const INBOUND_HEADER_VALUE_MAX = 1000;

function pickHeaderValue(
  headers: { name?: string; value?: string }[] | undefined,
  name: string,
): string | null {
  if (!headers) return null;
  const lowered = name.toLowerCase();
  for (const h of headers) {
    if ((h.name ?? "").toLowerCase() === lowered) {
      const v = typeof h.value === "string" ? h.value.trim() : "";
      if (v.length === 0) return null;
      return v.slice(0, INBOUND_HEADER_VALUE_MAX);
    }
  }
  return null;
}

/**
 * Pure helper — extract the small allow-listed slice of RFC822 headers we
 * persist for downstream suppression / classification.
 */
export function extractSuppressionRelevantInboundHeaders(
  payload: GmailPayloadPart | undefined,
): GmailInboundHeadersV1 {
  const headers = payload?.headers;
  return {
    from: pickHeaderValue(headers, "From"),
    list_unsubscribe: pickHeaderValue(headers, "List-Unsubscribe"),
    list_id: pickHeaderValue(headers, "List-Id"),
    precedence: pickHeaderValue(headers, "Precedence"),
    auto_submitted: pickHeaderValue(headers, "Auto-Submitted"),
  };
}
