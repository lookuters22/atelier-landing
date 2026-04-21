/**
 * Second post-ingest gate: deterministic `classifyInboundSuppression` after Layer-1
 * `evaluatePreLlmInboundEmail` returns `needs_llm`. Does not run when Layer-1 already
 * returns `automated_or_bulk`.
 */
import { classifyInboundSuppression } from "../../../../src/lib/inboundSuppressionClassifier.ts";
import type { GmailRoutingSignalsV1 } from "../gmail/gmailRoutingSignals.ts";

function asSignals(v: unknown): GmailRoutingSignalsV1 | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  if (o.version !== 1) return null;
  return v as GmailRoutingSignalsV1;
}

/** Read `metadata.gmail_import.routing_signals` (same shape as `preLlmEmailRouting.ts`). */
export function extractRoutingSignalsV1FromMessageMetadata(
  messageMetadata: Record<string, unknown> | null | undefined,
): GmailRoutingSignalsV1 | null {
  if (!messageMetadata || typeof messageMetadata !== "object") return null;
  const gi = (messageMetadata as { gmail_import?: unknown }).gmail_import;
  if (!gi || typeof gi !== "object" || gi === null) return null;
  const routing = (gi as { routing_signals?: unknown }).routing_signals;
  return asSignals(routing);
}

/**
 * RFC-style header map for `classifyInboundSuppression`. Raw headers are not stored on
 * canonical messages; values are stubs when the persisted signal flag is true.
 */
export function synthesizeSuppressionHeadersFromRoutingSignals(
  routing: GmailRoutingSignalsV1 | null,
): Record<string, string> {
  const h: Record<string, string> = {};
  if (!routing) return h;
  if (routing.has_list_unsubscribe) {
    h["list-unsubscribe"] = "<stub>";
  }
  if (routing.precedence_bulk_or_junk) {
    h["precedence"] = "bulk";
  }
  if (routing.auto_submitted_present) {
    h["auto-submitted"] = "auto-generated";
  }
  return h;
}

export type PostIngestSuppressionPromoMetadata = {
  routing_disposition: "promo_automated";
  heuristic_reasons: string[];
  routing_layer: "suppression_classifier_v1";
};

export type PostIngestSuppressionGateResult =
  | { kind: "continue" }
  | { kind: "heuristic_filtered"; metadata: PostIngestSuppressionPromoMetadata };

export type PostIngestSuppressionGateInput = {
  messageMetadata: Record<string, unknown> | null | undefined;
  senderRaw: string;
  subject: string | null | undefined;
  body: string;
};

/**
 * Run suppression classifier with synthesized headers from persisted routing_signals.
 * Caller must only invoke when Layer-1 pre-LLM check already returned `needs_llm`.
 */
export function evaluatePostIngestSuppressionAfterPreLlm(
  input: PostIngestSuppressionGateInput,
): PostIngestSuppressionGateResult {
  const routing = extractRoutingSignalsV1FromMessageMetadata(input.messageMetadata);
  const headers = synthesizeSuppressionHeadersFromRoutingSignals(routing);
  const classification = classifyInboundSuppression({
    senderRaw: input.senderRaw,
    subject: input.subject,
    body: input.body,
    headers,
  });
  if (!classification.suppressed) {
    return { kind: "continue" };
  }
  return {
    kind: "heuristic_filtered",
    metadata: {
      routing_disposition: "promo_automated",
      heuristic_reasons: [...classification.reasons],
      routing_layer: "suppression_classifier_v1",
    },
  };
}
