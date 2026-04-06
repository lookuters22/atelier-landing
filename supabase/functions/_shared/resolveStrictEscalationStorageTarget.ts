/**
 * Phase 9 Step 9B.1 — strict resolution: exactly one storage target per approved answer (`execute_v3.md`).
 *
 * Precedence:
 * 1. Sensitive / compliance / high-risk asset handling → `documents` (audit metadata + escalation link)
 * 2. Else `learning_outcome` reusable → `playbook_rules`
 * 3. Else → `memories` (case-specific)
 *
 * "Unresolved open" is not returned here: when the reply does not resolve the ask, the orchestrator
 * skips writeback and leaves `escalation_requests.status` open (no `apply-escalation-resolution`).
 */
import type { EscalationLearningOutcome } from "./classifyEscalationLearningOutcome.ts";

export type StrictEscalationStorageTarget = "playbook_rules" | "memories" | "documents";

function asRecord(j: unknown): Record<string, unknown> {
  return j && typeof j === "object" && !Array.isArray(j) ? (j as Record<string, unknown>) : {};
}

function isSensitiveOrCompliance(input: {
  reasonCode: string;
  actionKey: string;
  decisionJustification: Record<string, unknown>;
}): boolean {
  const rc = input.reasonCode.toLowerCase();
  const ak = input.actionKey.toLowerCase();
  const needles = [
    "sensitive",
    "compliance",
    "banking",
    "passport",
    "identity",
    "pii",
    "tax",
    "insurance",
    "legal",
    "contract",
    "asset",
  ];
  if (needles.some((n) => rc.includes(n) || ak.includes(n))) return true;
  if (ak.startsWith("sensitive_") || ak.startsWith("compliance_")) return true;

  const risk = String(input.decisionJustification.risk_class ?? "").toLowerCase();
  if (
    ["sensitive_data", "banking", "files", "compliance", "visual_assets", "publication"].some((x) =>
      risk.includes(x),
    )
  ) {
    return true;
  }

  const why = String(input.decisionJustification.why_blocked ?? "").toLowerCase();
  if (why.includes("passport") || why.includes("bank") || why.includes("compliance")) return true;

  return false;
}

export type ResolveStrictEscalationStorageInput = {
  learningOutcome: EscalationLearningOutcome;
  reasonCode: string;
  actionKey: string;
  decisionJustification: unknown;
};

/**
 * Pick exactly one writeback target. Caller must only invoke after a resolution is accepted
 * (`resolves` + summary + `learning_outcome` classified).
 */
export function resolveStrictEscalationStorageTarget(
  input: ResolveStrictEscalationStorageInput,
): StrictEscalationStorageTarget {
  const dj = asRecord(input.decisionJustification);
  if (
    isSensitiveOrCompliance({
      reasonCode: input.reasonCode,
      actionKey: input.actionKey,
      decisionJustification: dj,
    })
  ) {
    return "documents";
  }
  if (input.learningOutcome === "reusable_playbook") return "playbook_rules";
  return "memories";
}
