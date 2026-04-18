/**
 * Pulls the newest inbound message on a thread (by `sent_at`) and runs
 * `classifyInboundSuppression`.
 *
 * Extracted from `buildDecisionContext.ts` so the (`messages.direction = 'in'`)
 * filter and metadata-shape extraction can be unit-tested without dragging in
 * the full decision-context module graph.
 *
 * Critical correctness contract:
 *   - The `message_direction` enum values in this DB are exactly
 *     `'in' | 'out' | 'internal'` (NOT `'inbound'` / `'outbound'`).
 *     If this filter ever drifts, suppression silently regresses for already-
 *     materialized promo threads (orchestrator never sees `inboundSuppression`).
 *   - The function MUST swallow DB errors and return `null`. Building the
 *     decision context must never fail because suppression lookup hiccupped.
 */
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import {
  classifyInboundSuppression,
  type InboundSuppressionClassification,
} from "../../../../src/lib/inboundSuppressionClassifier.ts";

export async function fetchLatestInboundSuppressionVerdict(
  supabase: SupabaseClient,
  photographerId: string,
  threadId: string,
  recipientCount: number,
): Promise<InboundSuppressionClassification | null> {
  try {
    const [msgRes, threadRes] = await Promise.all([
      supabase
        .from("messages")
        .select("sender, body, metadata")
        .eq("photographer_id", photographerId)
        .eq("thread_id", threadId)
        /** `message_direction` enum values are `in | out | internal` — NOT `inbound`. */
        .eq("direction", "in")
        .order("sent_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("threads")
        .select("title")
        .eq("photographer_id", photographerId)
        .eq("id", threadId)
        .maybeSingle(),
    ]);

    if (msgRes.error || !msgRes.data) return null;

    const sender = typeof msgRes.data.sender === "string" ? msgRes.data.sender : null;
    const body = typeof msgRes.data.body === "string" ? msgRes.data.body : null;
    const subject =
      threadRes.data && typeof threadRes.data.title === "string"
        ? threadRes.data.title
        : null;

    const headers = extractOpportunisticHeaders(msgRes.data.metadata);

    return classifyInboundSuppression({
      senderRaw: sender,
      subject,
      body,
      headers,
      recipientCount,
    });
  } catch (_err) {
    return null;
  }
}

/**
 * Read the small allow-listed header slice from `messages.metadata`.
 *
 * Two known shapes are supported:
 *   - flat `metadata.headers: { ... }` (generic ingestion path)
 *   - Gmail import `metadata.gmail_import.headers: [{name,value}, ...]` (Gmail RFC822 array)
 *   - Gmail import `metadata.gmail_import.inbound_headers: { from, list_unsubscribe, list_id, precedence, auto_submitted }`
 *     (preferred — added by `extractSuppressionRelevantInboundHeaders`).
 *
 * Anything missing is ignored. Returns `null` when no recognised headers were
 * found so callers can pass `undefined` straight through to the classifier.
 */
export function extractOpportunisticHeaders(
  metadata: unknown,
): Record<string, string | null | undefined> | null {
  if (!metadata || typeof metadata !== "object") return null;
  const meta = metadata as Record<string, unknown>;
  const headerKeys = ["auto-submitted", "precedence", "list-id", "list-unsubscribe"] as const;
  const out: Record<string, string | null | undefined> = {};

  const flatHeaders =
    meta.headers && typeof meta.headers === "object" && !Array.isArray(meta.headers)
      ? (meta.headers as Record<string, unknown>)
      : null;
  if (flatHeaders) {
    for (const k of headerKeys) {
      const v = flatHeaders[k] ?? flatHeaders[k.toUpperCase()];
      if (typeof v === "string") out[k] = v;
    }
  }

  const gmailImport =
    meta.gmail_import && typeof meta.gmail_import === "object"
      ? (meta.gmail_import as Record<string, unknown>)
      : null;

  /**
   * `inbound_headers` is the canonical structured slice persisted by
   * `extractSuppressionRelevantInboundHeaders` at materialize time. Read it
   * BEFORE the legacy header-array shape so a malformed array doesn't shadow
   * the structured form.
   */
  if (gmailImport && gmailImport.inbound_headers && typeof gmailImport.inbound_headers === "object") {
    const ih = gmailImport.inbound_headers as Record<string, unknown>;
    if (typeof ih.auto_submitted === "string") out["auto-submitted"] = ih.auto_submitted;
    if (typeof ih.precedence === "string") out["precedence"] = ih.precedence;
    if (typeof ih.list_id === "string") out["list-id"] = ih.list_id;
    if (typeof ih.list_unsubscribe === "string") out["list-unsubscribe"] = ih.list_unsubscribe;
  }

  const gmailHeaders =
    gmailImport && Array.isArray(gmailImport.headers)
      ? (gmailImport.headers as unknown[])
      : null;
  if (gmailHeaders) {
    for (const h of gmailHeaders) {
      if (h && typeof h === "object") {
        const entry = h as Record<string, unknown>;
        const name = typeof entry.name === "string" ? entry.name.toLowerCase() : null;
        const value = typeof entry.value === "string" ? entry.value : null;
        if (name && value && (headerKeys as readonly string[]).includes(name)) {
          out[name] = value;
        }
      }
    }
  }

  return Object.keys(out).length > 0 ? out : null;
}
