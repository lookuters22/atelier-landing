/**
 * S5 — rule authoring / audit specialist: static context contract (review-first candidates only; no direct playbook writes).
 */
export function playbookAuditSpecialistToolPayload(): Record<string, unknown> {
  return {
    didRun: true,
    mode: "rule_authoring_audit_v1",
    reviewFirstWorkflow: {
      stagingTable: "playbook_rule_candidates",
      assistantSource: "operator_studio_assistant / insert-operator-assistant-playbook-rule-candidate",
      humanReview: "Workspace → Rule candidates (review) (`/workspace/playbook-rule-candidates`) → Approve / Reject",
      promotionRpc: "review_playbook_rule_candidate (edge)",
      neverFromAssistant: "Direct INSERT/UPDATE on playbook_rules; silent live rule promotion",
    },
    groundedInContext: [
      "Playbook block: effective rules + **playbook coverage summary** (topics, action keys)",
      "**Authorized case exceptions** when present (case narrowing — not a substitute for reusable global rules)",
    ],
    proposedActionsPolicy: {
      allowedKinds: ["playbook_rule_candidate"],
      serverNote:
        "In S5 the API strips any other proposal kinds — exit rule-audit mode for tasks, memories, case exceptions, calendar, profile, offer, invoice, etc.",
    },
    auditAnswerStyle:
      "Ground gaps/overlaps/conflicts only in Context evidence. Separate **effective rule text** from **inference**. If coverage or exceptions were not loaded, say so.",
    notInScope: ["Bulk triage", "Live playbook editing", "Autonomous approval of candidates"],
  };
}
