/**
 * Bounded unresolved-email near-match → photographer approval via `escalation_requests` + Step 8E delivery fan-out.
 * Does not set `threads.wedding_id`; does not dispatch client specialists/orchestrator.
 */
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { formatOperatorEscalationQuestion } from "../formatOperatorEscalation.ts";
import {
  inngest,
  OPERATOR_ESCALATION_PENDING_DELIVERY_V1_EVENT,
  OPERATOR_ESCALATION_PENDING_DELIVERY_V1_SCHEMA_VERSION,
} from "../inngest.ts";

export async function insertBoundedUnresolvedMatchApprovalEscalation(
  supabase: SupabaseClient,
  input: {
    photographerId: string;
    threadId: string;
    candidateWeddingId: string;
    confidenceScore: number;
    matchmakerReasoning: string;
    llmIntent: string;
    senderEmail: string;
  },
): Promise<string> {
  const shortWid = input.candidateWeddingId.slice(0, 8);
  const question_body = formatOperatorEscalationQuestion(
    `Email thread may belong to existing wedding (${shortWid}…). Match confidence ${input.confidenceScore}/100 — approve filing this thread to that wedding in the dashboard, or choose another.`,
  );

  const decision_justification = {
    why_blocked: "bounded_matchmaker_near_match_not_auto_file",
    missing_capability_or_fact: "photographer_approval_required_for_wedding_link",
    risk_class: "identity_filing",
    evidence_refs: [
      `candidate_wedding_id:${input.candidateWeddingId}`,
      `confidence_score:${input.confidenceScore}`,
      `llm_intent:${input.llmIntent}`,
      `sender:${input.senderEmail}`,
    ],
    recommended_next_step: "confirm_or_reject_candidate_wedding_for_thread",
    candidate_wedding_id: input.candidateWeddingId,
    confidence_score: input.confidenceScore,
    matchmaker_reasoning: String(input.matchmakerReasoning ?? "").slice(0, 2000),
  };

  const { data, error } = await supabase
    .from("escalation_requests")
    .insert({
      photographer_id: input.photographerId,
      thread_id: input.threadId,
      wedding_id: null,
      action_key: "request_thread_wedding_link",
      reason_code: "bounded_matchmaker_near_match",
      decision_justification,
      question_body,
      recommended_resolution: `If correct, link this thread to wedding ${input.candidateWeddingId}.`,
      status: "open",
      operator_delivery: "dashboard_only",
    })
    .select("id")
    .single();

  if (error || !data?.id) {
    throw new Error(`escalation_requests insert (near-match approval): ${error?.message ?? "no id"}`);
  }

  const escalationId = data.id as string;

  try {
    await inngest.send({
      name: OPERATOR_ESCALATION_PENDING_DELIVERY_V1_EVENT,
      data: {
        schemaVersion: OPERATOR_ESCALATION_PENDING_DELIVERY_V1_SCHEMA_VERSION,
        photographerId: input.photographerId,
        escalationId,
        operatorDelivery: "dashboard_only" as const,
        questionBody: question_body,
        threadId: input.threadId,
      },
    });
  } catch (e) {
    console.error("[triage] operator escalation delivery fan-out failed (non-fatal):", e);
  }

  return escalationId;
}
