/**
 * V3 — persist operator escalation when deterministic commercial output auditor rejects a persona draft.
 */
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { formatOperatorEscalationQuestion } from "../formatOperatorEscalation.ts";
import {
  inngest,
  OPERATOR_ESCALATION_PENDING_DELIVERY_V1_EVENT,
  OPERATOR_ESCALATION_PENDING_DELIVERY_V1_SCHEMA_VERSION,
} from "../inngest.ts";

export async function recordV3OutputAuditorEscalation(
  supabase: SupabaseClient,
  params: {
    photographerId: string;
    threadId: string;
    weddingId: string | null;
    violations: string[];
    draftId: string;
  },
): Promise<{ id: string } | null> {
  const question_body = formatOperatorEscalationQuestion(
    `V3 output auditor: ungrounded commercial draft (${params.draftId.slice(0, 8)}…). ${params.violations.join(" | ")}`,
  );
  if (!question_body) return null;

  const { data, error } = await supabase
    .from("escalation_requests")
    .insert({
      photographer_id: params.photographerId,
      thread_id: params.threadId,
      wedding_id: params.weddingId,
      action_key: "orchestrator.client.v1.output_auditor.v1",
      reason_code: "v3_output_auditor_ungrounded_commercial",
      question_body,
      decision_justification: {
        why_blocked:
          "V3 deterministic output auditor rejected the persona draft: committed commercial terms or email prose not grounded in CRM/playbook/case memory.",
        missing_capability_or_fact: params.violations.join("; ").slice(0, 2000),
        risk_class: "commercial_policy_integrity",
        evidence_refs: [`draft:${params.draftId}`, "auditor:v3_commercial_terms"],
        recommended_next_step:
          "Draft was reverted to orchestrator stub; compose a verified reply from contract/playbook or edit before approval.",
      },
      status: "open",
      operator_delivery: "batch_later",
    })
    .select("id")
    .single();

  if (error || !data?.id) {
    console.error("[recordV3OutputAuditorEscalation] insert failed:", error?.message);
    return null;
  }

  const escalationId = data.id as string;

  try {
    await inngest.send({
      name: OPERATOR_ESCALATION_PENDING_DELIVERY_V1_EVENT,
      data: {
        schemaVersion: OPERATOR_ESCALATION_PENDING_DELIVERY_V1_SCHEMA_VERSION,
        photographerId: params.photographerId,
        escalationId,
        operatorDelivery: "batch_later" as const,
        questionBody: question_body,
        threadId: params.threadId,
      },
    });
  } catch (e) {
    console.error("[recordV3OutputAuditorEscalation] inngest.send failed:", e);
  }

  return { id: escalationId };
}
