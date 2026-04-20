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
import type { OutputAuditorEscalationKind } from "./outputAuditorViolationSeverity.ts";

const MAX_VIOLATION_SNIPPET_CHARS = 400;

function capViolationDetail(v: string): string {
  const t = v.trim();
  if (t.length <= MAX_VIOLATION_SNIPPET_CHARS) return t;
  return t.slice(0, MAX_VIOLATION_SNIPPET_CHARS - 1).trimEnd() + "…";
}

function resolveCommercialFamilyEscalation(params: {
  draftId: string;
  violations: string[];
  kind: OutputAuditorEscalationKind;
}): {
  questionLead: string;
  whyBlocked: string;
  riskClass: string;
  evidenceRefs: string[];
  reasonCode: string;
} {
  const shortId = params.draftId.slice(0, 8);
  const vj = params.violations.map(capViolationDetail).join(" | ");
  switch (params.kind) {
    case "grounding_review_failed":
      return {
        questionLead: `V3 output auditor: unverified business claims / grounding review failed (${shortId}…). ${vj}`,
        whyBlocked:
          "Deterministic grounding review: email prose contained business assertions not supported by verified playbook + CRM + case memory (or flagged by the unsupported-assertion belt).",
        riskClass: "business_assertion_grounding",
        evidenceRefs: [`draft:${params.draftId}`, "auditor:v3_unsupported_business_assertions"],
        reasonCode: "v3_output_auditor_grounding_review_failed",
      };
    case "availability_claim_failed":
      return {
        questionLead: `V3 output auditor: availability / booking-process claim failed (${shortId}…). ${vj}`,
        whyBlocked:
          "Draft asserted calendar availability, booking-process language, or date mechanics inconsistent with the inquiry reply plan and verified policy for this turn.",
        riskClass: "availability_claim_integrity",
        evidenceRefs: [`draft:${params.draftId}`, "auditor:v3_availability_inquiry_booking_guard"],
        reasonCode: "v3_output_auditor_availability_claim_failed",
      };
    case "inquiry_claim_permission_failed":
      return {
        questionLead: `V3 output auditor: inquiry claim-permission failed (${shortId}…). ${vj}`,
        whyBlocked:
          "Draft exceeded hard inquiry claim-permission boundaries (destination, availability, booking next-step, or explore-tier fit) after deterministic soft-repair attempts where applicable.",
        riskClass: "inquiry_claim_permission_integrity",
        evidenceRefs: [`draft:${params.draftId}`, "auditor:v3_inquiry_claim_permissions"],
        reasonCode: "v3_output_auditor_inquiry_claim_permission_failed",
      };
    default:
      return {
        questionLead: `V3 output auditor: commercial / terms grounding failed (${shortId}…). ${vj}`,
        whyBlocked:
          "V3 deterministic output auditor rejected the persona draft: committed commercial terms or email prose not grounded in CRM/playbook/case memory.",
        riskClass: "commercial_policy_integrity",
        evidenceRefs: [`draft:${params.draftId}`, "auditor:v3_commercial_terms"],
        reasonCode: "v3_output_auditor_commercial_grounding_failed",
      };
  }
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
    /**
     * When `variant` is commercial (default), refines operator copy — avoids labeling inquiry-permission drift as “ungrounded commercial”.
     */
    escalationKind?: OutputAuditorEscalationKind;
  },
): Promise<{ id: string } | null> {
  const variant = params.variant ?? "commercial";
  const isLeak = variant === "planner_private_leak";
  const isPersonaStructured = variant === "persona_structured_output";

  const cappedViolations = params.violations.map((v) => capViolationDetail(v));
  const commercialKind: OutputAuditorEscalationKind =
    !isLeak && !isPersonaStructured
      ? (params.escalationKind ?? "commercial_grounding_failed")
      : "commercial_grounding_failed";

  const commercial = !isLeak && !isPersonaStructured
    ? resolveCommercialFamilyEscalation({
        draftId: params.draftId,
        violations: params.violations,
        kind: commercialKind,
      })
    : null;

  const question_body = formatOperatorEscalationQuestion(
    isPersonaStructured
      ? `V3 persona writer: structured output failed — no safe client draft (${params.draftId.slice(0, 8)}…). ${cappedViolations.join(" | ")}`
      : isLeak
        ? `V3 output auditor: planner-private leak in client-visible draft (${params.draftId.slice(0, 8)}…). ${cappedViolations.join(" | ")}`
        : commercial!.questionLead,
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
      : commercial!.reasonCode;

  const whyBlockedResolved = isPersonaStructured
    ? "V3 persona writer could not produce structured output (JSON parse or model path): automated client-facing rewrite did not complete; the draft is not sendable as final copy."
    : isLeak
      ? "V3 planner-private leakage auditor rejected the persona draft: commission/agency fee/markup or internal deal language in a client-visible audience."
      : commercial!.whyBlocked;

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
        why_blocked: whyBlockedResolved,
        missing_capability_or_fact: cappedViolations.join("; ").slice(0, 2000),
        risk_class: isPersonaStructured
          ? "persona_structured_output_integrity"
          : isLeak
            ? "audience_rbac_planner_private"
            : commercial!.riskClass,
        evidence_refs: isPersonaStructured
          ? [`draft:${params.draftId}`, "persona:draftPersonaStructuredResponse"]
          : isLeak
            ? [`draft:${params.draftId}`, "auditor:v3_planner_private_leakage"]
            : commercial!.evidenceRefs,
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
