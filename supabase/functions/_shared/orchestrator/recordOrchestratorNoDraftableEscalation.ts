/**
 * When the orchestrator run is eligible for a client reply draft (`draft` / `ask` outcomes) but
 * {@link attemptOrchestratorDraft} finds no non-blocked `send_message` proposal, operators otherwise see
 * nothing on Today — `toolEscalate` here is validation-only and does not insert `escalation_requests`.
 *
 * This path persists a normal open escalation + operator delivery signal (same family as STR / V3 auditor).
 */
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { OrchestratorProposalCandidate } from "../../../../src/types/decisionContext.types.ts";
import { formatOperatorEscalationQuestion } from "../formatOperatorEscalation.ts";
import {
  inngest,
  OPERATOR_ESCALATION_PENDING_DELIVERY_V1_EVENT,
  OPERATOR_ESCALATION_PENDING_DELIVERY_V1_SCHEMA_VERSION,
} from "../inngest.ts";
import { ORCHESTRATOR_DRAFT_SKIP_NO_DRAFTABLE_CANDIDATE } from "./attemptOrchestratorDraft.ts";

const ACTION_KEY = "orchestrator.client.v1.no_draftable_send_message_candidate.v1" as const;
export const ORCHESTRATOR_NO_DRAFTABLE_REASON_CODE =
  "orchestrator_no_draftable_send_message_candidate" as const;

const MAX_INBOUND_SNIPPET = 400;

function capSnippet(s: string): string {
  const t = s.trim();
  if (t.length <= MAX_INBOUND_SNIPPET) return t;
  return t.slice(0, MAX_INBOUND_SNIPPET - 1).trimEnd() + "…";
}

/** Bounded operator-facing summary of what the orchestrator proposed instead of a sendable email. */
export function summarizeProposalsForNoDraftableEscalation(
  proposals: OrchestratorProposalCandidate[],
): string {
  if (proposals.length === 0) {
    return "No structured proposals were emitted for this turn.";
  }
  const parts = proposals.slice(0, 12).map((p) => {
    const block = p.likely_outcome === "block" ? " (blocked)" : "";
    return `${p.action_family}:${p.action_key}${block}`;
  });
  const tail = proposals.length > 12 ? ` … +${proposals.length - 12} more` : "";
  return parts.join("; ") + tail;
}

export type MaybeRecordOrchestratorNoDraftableEscalationParams = {
  photographerId: string;
  threadId: string | null;
  weddingId: string | null;
  verifierSuccess: boolean;
  orchestratorOutcome: "auto" | "draft" | "ask" | "block";
  draftSkipReason: string | null;
  draftCreated: boolean;
  proposedActions: OrchestratorProposalCandidate[];
  rawMessage: string;
};

export type MaybeRecordOrchestratorNoDraftableEscalationResult =
  | { recorded: false; reason: string }
  | { recorded: true; escalationId: string };

/**
 * Inserts `escalation_requests` when the draft step stopped with {@link ORCHESTRATOR_DRAFT_SKIP_NO_DRAFTABLE_CANDIDATE}.
 * Dedupes: one open row per thread + {@link ORCHESTRATOR_NO_DRAFTABLE_REASON_CODE}.
 */
export async function maybeRecordOrchestratorNoDraftableEscalation(
  supabase: SupabaseClient,
  params: MaybeRecordOrchestratorNoDraftableEscalationParams,
): Promise<MaybeRecordOrchestratorNoDraftableEscalationResult> {
  const {
    photographerId,
    threadId,
    weddingId,
    verifierSuccess,
    orchestratorOutcome,
    draftSkipReason,
    draftCreated,
    proposedActions,
    rawMessage,
  } = params;

  if (!threadId) {
    return { recorded: false, reason: "no_thread" };
  }
  if (draftCreated) {
    return { recorded: false, reason: "draft_exists" };
  }
  if (!verifierSuccess) {
    return { recorded: false, reason: "verifier_failed" };
  }
  if (orchestratorOutcome !== "draft" && orchestratorOutcome !== "ask") {
    return { recorded: false, reason: "outcome_not_draft_or_ask" };
  }
  if (draftSkipReason !== ORCHESTRATOR_DRAFT_SKIP_NO_DRAFTABLE_CANDIDATE) {
    return { recorded: false, reason: "skip_reason_not_no_draftable" };
  }

  const { data: existingOpen, error: dedupeErr } = await supabase
    .from("escalation_requests")
    .select("id")
    .eq("photographer_id", photographerId)
    .eq("thread_id", threadId)
    .eq("reason_code", ORCHESTRATOR_NO_DRAFTABLE_REASON_CODE)
    .eq("status", "open")
    .maybeSingle();

  if (dedupeErr) {
    console.error("[maybeRecordOrchestratorNoDraftableEscalation] dedupe select failed:", dedupeErr.message);
    return { recorded: false, reason: "dedupe_query_failed" };
  }
  if (existingOpen?.id) {
    return { recorded: false, reason: "open_escalation_already_exists" };
  }

  const proposalSummary = summarizeProposalsForNoDraftableEscalation(proposedActions);
  const inbound = capSnippet(rawMessage);

  const question_body = formatOperatorEscalationQuestion(
    "Ana did not create a reply draft: no sendable send_message candidate (routing/compliance/authority — review required).",
  );
  if (!question_body) {
    return { recorded: false, reason: "empty_question" };
  }

  const { data, error } = await supabase
    .from("escalation_requests")
    .insert({
      photographer_id: photographerId,
      thread_id: threadId,
      wedding_id: weddingId,
      action_key: ACTION_KEY,
      reason_code: ORCHESTRATOR_NO_DRAFTABLE_REASON_CODE,
      question_body,
      decision_justification: {
        why_blocked:
          "The client orchestrator would normally produce a pending-approval email draft, but every `send_message` candidate was blocked or absent. Typical causes: compliance / NDA or rights language, operator-only routing, identity or authority ambiguity, or workflow gates — so automation must not fabricate a client-visible stub.",
        missing_capability_or_fact: `Proposal summary: ${proposalSummary}. Inbound excerpt: ${inbound}`,
        risk_class: "orchestrator_no_draftable_candidate",
        evidence_refs: [`thread:${threadId}`, "orchestrator:client:v1", `draft_skip:${draftSkipReason}`],
        recommended_next_step:
          "Open Pipeline for this thread: read inbound + proposal list, then compose an operator-approved reply (or adjust policy/proposals) — do not assume Ana drafted a reply.",
      },
      status: "open",
      operator_delivery: "urgent_now",
    })
    .select("id")
    .single();

  if (error || !data?.id) {
    console.error("[maybeRecordOrchestratorNoDraftableEscalation] insert failed:", error?.message);
    return { recorded: false, reason: `insert_failed:${error?.message ?? "unknown"}` };
  }

  const escalationId = data.id as string;

  const questionBodyWithIds =
    `${question_body}\nEscalation ID: ${escalationId}\nClient thread: ${threadId}`;

  const { error: qErr } = await supabase
    .from("escalation_requests")
    .update({ question_body: questionBodyWithIds })
    .eq("id", escalationId)
    .eq("photographer_id", photographerId);

  if (qErr) {
    console.error("[maybeRecordOrchestratorNoDraftableEscalation] question_body update failed:", qErr.message);
  }

  const { error: holdErr } = await supabase
    .from("threads")
    .update({
      v3_operator_automation_hold: true,
      v3_operator_hold_escalation_id: escalationId,
    })
    .eq("id", threadId)
    .eq("photographer_id", photographerId);

  if (holdErr) {
    console.error("[maybeRecordOrchestratorNoDraftableEscalation] thread hold update failed:", holdErr.message);
  }

  try {
    await inngest.send({
      name: OPERATOR_ESCALATION_PENDING_DELIVERY_V1_EVENT,
      data: {
        schemaVersion: OPERATOR_ESCALATION_PENDING_DELIVERY_V1_SCHEMA_VERSION,
        photographerId,
        escalationId,
        operatorDelivery: "urgent_now" as const,
        questionBody: questionBodyWithIds,
        threadId,
      },
    });
  } catch (e) {
    console.error("[maybeRecordOrchestratorNoDraftableEscalation] inngest.send failed:", e);
  }

  return { recorded: true, escalationId };
}
