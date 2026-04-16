/**
 * Layer-1 routing before LLM: promo/bulk/automated detection from persisted Gmail `routing_signals` + From shape.
 * Does not assign TriageIntent — disposition only.
 */
import type { GmailRoutingSignalsV1 } from "../gmail/gmailRoutingSignals.ts";
import { classifyEmailLocalPart } from "../utils/emailLocalPartClass.ts";

export type PreLlmRoutingOutcome =
  | { kind: "needs_llm" }
  | { kind: "automated_or_bulk"; reasons: string[] };

function asSignals(v: unknown): GmailRoutingSignalsV1 | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  if (o.version !== 1) return null;
  return v as GmailRoutingSignalsV1;
}

/**
 * Read `metadata.gmail_import.routing_signals` from delta ingest (see `gmailRoutingSignals.ts`).
 */
export function evaluatePreLlmInboundEmail(input: {
  messageMetadata: Record<string, unknown> | null | undefined;
  /** From line on message (redundant with signals but supports legacy rows without routing_signals). */
  senderRaw?: string;
}): PreLlmRoutingOutcome {
  const gi =
    input.messageMetadata &&
    typeof input.messageMetadata === "object" &&
    input.messageMetadata !== null &&
    "gmail_import" in input.messageMetadata
      ? (input.messageMetadata as { gmail_import?: unknown }).gmail_import
      : null;
  const routing =
    gi && typeof gi === "object" && gi !== null && "routing_signals" in gi
      ? asSignals((gi as { routing_signals?: unknown }).routing_signals)
      : null;

  const headerReasons: string[] = [];

  if (routing) {
    if (routing.precedence_bulk_or_junk) {
      headerReasons.push("precedence_bulk_or_junk");
    }
    if (routing.has_list_unsubscribe && routing.sender_localpart_class === "no_reply") {
      headerReasons.push("list_unsubscribe_and_no_reply_sender");
    }
    if (routing.has_list_unsubscribe && routing.has_feedback_id) {
      headerReasons.push("list_unsubscribe_and_feedback_id");
    }
    if (routing.auto_submitted_present && routing.sender_localpart_class === "no_reply") {
      headerReasons.push("auto_submitted_and_no_reply_sender");
    }
  }

  if (headerReasons.length > 0) {
    return { kind: "automated_or_bulk", reasons: [...new Set(headerReasons)] };
  }

  // Legacy rows or partial backfill: no persisted signals (or signals present but no header match).
  // Obvious no-reply local parts on `senderRaw` avoid LLM for bulk obvious cases only.
  if (classifyEmailLocalPart(input.senderRaw) === "no_reply") {
    return { kind: "automated_or_bulk", reasons: ["sender_local_part_automated"] };
  }

  return { kind: "needs_llm" };
}
