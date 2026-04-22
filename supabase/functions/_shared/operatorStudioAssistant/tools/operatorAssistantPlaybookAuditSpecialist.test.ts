import { describe, expect, it } from "vitest";
import { playbookAuditSpecialistToolPayload } from "./operatorAssistantPlaybookAuditSpecialist.ts";

describe("playbookAuditSpecialistToolPayload (S5)", () => {
  it("names audit mode and candidate-only proposal policy", () => {
    const p = playbookAuditSpecialistToolPayload();
    expect(p.mode).toBe("rule_authoring_audit_v1");
    expect(p.didRun).toBe(true);
    const pol = p.proposedActionsPolicy as { allowedKinds?: string[] };
    expect(pol.allowedKinds).toEqual(["playbook_rule_candidate"]);
    expect(p.reviewFirstWorkflow).toBeDefined();
  });
});
