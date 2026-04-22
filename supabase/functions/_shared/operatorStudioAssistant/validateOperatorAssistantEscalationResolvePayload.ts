/**
 * S1 — LLM JSON proposal for queuing `dashboard-resolve-escalation` (operator confirm only).
 */
import type { OperatorAssistantProposedActionEscalationResolve } from "../../../../src/types/operatorAssistantProposedAction.types.ts";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_SUMMARY = 2000;
const MAX_REPLY = 8000;

export function tryParseLlmProposedEscalationResolve(
  item: unknown,
): { ok: true; value: OperatorAssistantProposedActionEscalationResolve } | { ok: false; reason: string } {
  if (!item || typeof item !== "object" || Array.isArray(item)) {
    return { ok: false, reason: "not_object" };
  }
  const o = item as Record<string, unknown>;
  if (o.kind !== "escalation_resolve") {
    return { ok: false, reason: "kind" };
  }
  const escalationId = typeof o.escalationId === "string" ? o.escalationId.trim() : "";
  if (!UUID_RE.test(escalationId)) {
    return { ok: false, reason: "escalation_id" };
  }
  const resolutionSummary = typeof o.resolutionSummary === "string" ? o.resolutionSummary.trim() : "";
  if (!resolutionSummary) {
    return { ok: false, reason: "summary_empty" };
  }
  if (resolutionSummary.length > MAX_SUMMARY) {
    return { ok: false, reason: "summary_long" };
  }
  let photographerReplyRaw: string | null = null;
  if (typeof o.photographerReplyRaw === "string" && o.photographerReplyRaw.trim().length > 0) {
    const raw = o.photographerReplyRaw.trim();
    if (raw.length > MAX_REPLY) {
      return { ok: false, reason: "reply_long" };
    }
    photographerReplyRaw = raw;
  }
  return {
    ok: true,
    value: {
      kind: "escalation_resolve",
      escalationId,
      resolutionSummary,
      photographerReplyRaw,
    },
  };
}
