/**
 * V3 — persist operator escalation when the commercial output auditor rejects a persona draft, or when
 * structured persona output fails before a safe client reply exists.
 */
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { formatOperatorEscalationQuestion } from "../formatOperatorEscalation.ts";
import {
  inngest,
  OPERATOR_ESCALATION_PENDING_DELIVERY_V1_EVENT,
  OPERATOR_ESCALATION_PENDING_DELIVERY_V1_SCHEMA_VERSION,
} from "../inngest.ts";

const MAX_VIOLATION_SNIPPET_CHARS = 400;

function capViolationDetail(v: string): string {
  const t = v.trim();
  if (t.length <= MAX_VIOLATION_SNIPPET_CHARS) return t;
  return t.slice(0, MAX_VIOLATION_SNIPPET_CHARS - 1).trimEnd() + "…";
}

export async function recordV3OutputAuditorEscalation(
  supabase: SupabaseClient,
  params: {
    photographerId: string;
    threadId: string;
    weddingId: string | null;
    violations: string[];
    draftId: string;
    /** Default: commercial grounding. `planner_private_leak` = audience-safe prose backstop. `persona_structured_output` = JSON/model failure before safe client prose. */
    variant?: "commercial" | "planner_private_leak" | "persona_structured_output";
  },
): Promise<{ id: string } | null> {
  const variant = params.variant ?? "commercial";
  const isLeak = variant === "planner_private_leak";
  const isPersonaStructured = variant === "persona_structured_output";

  const cappedViolations = params.violations.map((v) => capViolationDetail(v));
  const question_body = formatOperatorEscalationQuestion(
    isPersonaStructured
      ? `V3 persona writer: structured output failed — no safe client draft (${params.draftId.slice(0, 8)}…). ${cappedViolations.join(" | ")}`
      : isLeak
        ? `V3 output auditor: planner-private leak in client-visible draft (${params.draftId.slice(0, 8)}…). ${cappedViolations.join(" | ")}`
        : `V3 output auditor: ungrounded commercial draft (${params.draftId.slice(0, 8)}…). ${cappedViolations.join(" | ")}`,
  );
  if (!question_body) return null;

  const action_key = isPersonaStructured
    ? "orchestrator.client.v1.persona_structured_output.v1"
    : isLeak
      ? "orchestrator.client.v1.output_auditor.planner_private.v1"
      : "orchestrator.client.v1.output_auditor.v1";
  const reason_code = isPersonaStructured
    ? "persona_structured_output_failed"
    : isLeak
      ? "v3_output_auditor_planner_private_leak"
      : "v3_output_auditor_ungrounded_commercial";

  const { data, error } = await supabase
    .from("escalation_requests")
    .insert({
      photographer_id: params.photographerId,
      thread_id: params.threadId,
      wedding_id: params.weddingId,
      action_key,
      reason_code,
      question_body,
      decision_justification: {
        why_blocked: isPersonaStructured
          ? "V3 persona writer could not produce structured output (JSON parse or model path): automated client-facing rewrite did not complete; the draft is not sendable as final copy."
          : isLeak
            ? "V3 planner-private leakage auditor rejected the persona draft: commission/agency fee/markup or internal deal language in a client-visible audience."
            : "V3 deterministic output auditor rejected the persona draft: committed commercial terms or email prose not grounded in CRM/playbook/case memory.",
        missing_capability_or_fact: cappedViolations.join("; ").slice(0, 2000),
        risk_class: isPersonaStructured
          ? "persona_structured_output_integrity"
          : isLeak
            ? "audience_rbac_planner_private"
            : "commercial_policy_integrity",
        evidence_refs: isPersonaStructured
          ? [`draft:${params.draftId}`, "persona:draftPersonaStructuredResponse"]
          : isLeak
            ? [`draft:${params.draftId}`, "auditor:v3_planner_private_leakage"]
            : [`draft:${params.draftId}`, "auditor:v3_commercial_terms"],
        recommended_next_step: isPersonaStructured
          ? "Draft shows orchestrator stub plus operator failure marker; compose verified client reply from playbook/contract or fix persona output — do not send automated text as final."
          : "Draft was reverted to orchestrator stub; compose a verified reply from contract/playbook or edit before approval.",
      },
      status: "open",
      operator_delivery: "urgent_now",
    })
    .select("id")
    .single();

  if (error || !data?.id) {
    console.error("[recordV3OutputAuditorEscalation] insert failed:", error?.message);
    return null;
  }

  const escalationId = data.id as string;

  const questionBodyWithIds =
    `${question_body}\nEscalation ID: ${escalationId}\nClient thread: ${params.threadId}`;

  const { error: qErr } = await supabase
    .from("escalation_requests")
    .update({ question_body: questionBodyWithIds })
    .eq("id", escalationId)
    .eq("photographer_id", params.photographerId);

  if (qErr) {
    console.error("[recordV3OutputAuditorEscalation] question_body update failed:", qErr.message);
  }

  const { error: holdErr } = await supabase
    .from("threads")
    .update({
      v3_operator_automation_hold: true,
      v3_operator_hold_escalation_id: escalationId,
    })
    .eq("id", params.threadId)
    .eq("photographer_id", params.photographerId);

  if (holdErr) {
    console.error("[recordV3OutputAuditorEscalation] thread hold update failed:", holdErr.message);
  }

  try {
    await inngest.send({
      name: OPERATOR_ESCALATION_PENDING_DELIVERY_V1_EVENT,
      data: {
        schemaVersion: OPERATOR_ESCALATION_PENDING_DELIVERY_V1_SCHEMA_VERSION,
        photographerId: params.photographerId,
        escalationId,
        operatorDelivery: "urgent_now" as const,
        questionBody: questionBodyWithIds,
        threadId: params.threadId,
      },
    });
  } catch (e) {
    console.error("[recordV3OutputAuditorEscalation] inngest.send failed:", e);
  }

  return { id: escalationId };
}
