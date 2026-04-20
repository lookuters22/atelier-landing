/**
 * Regression: soft_confirm inquiry fit drift → deterministic repair → re-audit passes (no false escalation).
 */
import { describe, expect, it } from "vitest";
import type { DecisionContext } from "../../../../src/types/decisionContext.types.ts";
import type { InquiryClaimPermissionMap } from "../../../../src/types/inquiryClaimPermissions.types.ts";
import { emptyCrmSnapshot } from "../../../../src/types/crmSnapshot.types.ts";
import {
  auditInquiryClaimPermissionViolations,
} from "./auditInquiryClaimPermissionViolations.ts";
import {
  auditUnsupportedBusinessAssertions,
  buildPersonaVerifiedGroundingBlob,
  UNSUPPORTED_ASSERTION_VIOLATION_PREFIX,
} from "./auditUnsupportedBusinessAssertions.ts";
import {
  isAutoRepairableInquiryClaimViolation,
  isAutoRepairableUnsupportedAssertionViolation,
  partitionPersonaOutputViolations,
  resolveOutputAuditorEscalationKind,
  violationsAreEntirelyAutoRepairable,
} from "./outputAuditorViolationSeverity.ts";
import { applyDeterministicInquirySoftConfirmRepairPasses } from "./repairInquiryClaimSoftConfirmDrift.ts";

function baseDc(): DecisionContext {
  return {
    crmSnapshot: emptyCrmSnapshot(),
    recentMessages: [],
    rawPlaybookRules: [],
    authorizedCaseExceptions: [],
    playbookRules: [],
  } as DecisionContext;
}

function softConfirmPermissions(over: Partial<InquiryClaimPermissionMap> = {}): InquiryClaimPermissionMap {
  return {
    schemaVersion: 1,
    availability: "confirm",
    destination_fit: "confirm",
    destination_logistics: "confirm",
    offering_fit: "soft_confirm",
    proposal_process: "soft_confirm",
    booking_next_step: "confirm",
    deliverable_inclusions: "soft_confirm",
    ...over,
  };
}

describe("inquiry soft_confirm — severity + repair", () => {
  it("classifies soft_confirm offering_fit brochure drift as auto_repair", () => {
    const v =
      "inquiry_claim_permission:offering_fit: draft uses confirm-tier / brochure certainty while permission is soft_confirm.";
    expect(isAutoRepairableInquiryClaimViolation(v)).toBe(true);
    expect(violationsAreEntirelyAutoRepairable([v])).toBe(true);
  });

  it("does not auto_repair explore-tier offering_fit or hard inquiry domains", () => {
    const explore =
      "inquiry_claim_permission:offering_fit: draft exceeds explore permission for offering/fit/specialty (permission=explore).";
    expect(isAutoRepairableInquiryClaimViolation(explore)).toBe(false);

    const dest =
      "inquiry_claim_permission:destination: draft asserts destination or logistics capability as settled practice (fit=soft_confirm, logistics=soft_confirm).";
    expect(isAutoRepairableInquiryClaimViolation(dest)).toBe(false);

    const avail =
      "inquiry_claim_permission:availability: draft exceeds permission defer for calendar/date availability.";
    expect(isAutoRepairableInquiryClaimViolation(avail)).toBe(false);
  });

  it("partition splits auto_repair vs hard_block", () => {
    const { hardBlock, autoRepair } = partitionPersonaOutputViolations([
      "inquiry_claim_permission:offering_fit: draft uses confirm-tier / brochure certainty while permission is soft_confirm.",
      "email_draft asserts deposit/booking percentage 50% in prose without matching verified playbook_rules text.",
    ]);
    expect(autoRepair).toHaveLength(1);
    expect(hardBlock).toHaveLength(1);
  });

  it("resolveOutputAuditorEscalationKind prefers availability over inquiry claim", () => {
    expect(
      resolveOutputAuditorEscalationKind([
        "inquiry_claim_permission:availability: draft exceeds permission soft_confirm for calendar/date availability.",
        "inquiry_claim_permission:offering_fit: draft exceeds explore permission for offering/fit/specialty (permission=explore).",
      ]),
    ).toBe("availability_claim_failed");
  });

  it("resolveOutputAuditorEscalationKind maps unsupported assertions to grounding_review_failed", () => {
    expect(
      resolveOutputAuditorEscalationKind([
        `${UNSUPPORTED_ASSERTION_VIOLATION_PREFIX}heart_of_what_we_do`,
      ]),
    ).toBe("grounding_review_failed");
  });

  it("resolveOutputAuditorEscalationKind maps commercial terms to commercial_grounding_failed", () => {
    expect(
      resolveOutputAuditorEscalationKind([
        `deposit_percentage 50% is not present in verified playbook_rules text (CRM does not carry deposit %).`,
      ]),
    ).toBe("commercial_grounding_failed");
  });

  it("resolveOutputAuditorEscalationKind labels stuck soft_confirm-only violations as inquiry_claim (not commercial)", () => {
    expect(
      resolveOutputAuditorEscalationKind([
        "inquiry_claim_permission:offering_fit: draft uses confirm-tier / brochure certainty while permission is soft_confirm.",
      ]),
    ).toBe("inquiry_claim_permission_failed");
  });

  it("mixed inquiry soft_confirm + matching unsupported assertion is entirely auto_repairable (repair gate)", () => {
    const inquiryV =
      "inquiry_claim_permission:offering_fit: draft uses confirm-tier / brochure certainty while permission is soft_confirm.";
    const unsupportedV = `${UNSUPPORTED_ASSERTION_VIOLATION_PREFIX}within_our_scope_settled: settled capability/fit claim — use exploratory language unless playbook/CRM supports it.`;
    expect(isAutoRepairableUnsupportedAssertionViolation(unsupportedV)).toBe(true);
    expect(violationsAreEntirelyAutoRepairable([inquiryV, unsupportedV])).toBe(true);
  });

  it("heart_of_what_we_do unsupported assertion stays hard_block (not auto_repair)", () => {
    const v = `${UNSUPPORTED_ASSERTION_VIOLATION_PREFIX}heart_of_what_we_do: phrasing is strong studio-positioning not grounded in verified playbook/CRM — soften or remove.`;
    expect(isAutoRepairableUnsupportedAssertionViolation(v)).toBe(false);
    expect(violationsAreEntirelyAutoRepairable([v])).toBe(false);
  });

  it("mixed real draft: offering_fit soft_confirm + unsupported families → repair clears both auditors", () => {
    const emptyGrounding = buildPersonaVerifiedGroundingBlob(baseDc(), [], null);
    const draft = "Hi Mary,\n\nThis is exactly the kind of work we love.\n\nAna";
    const perms = softConfirmPermissions();
    const beforeClaim = auditInquiryClaimPermissionViolations(draft, perms);
    const beforeUnsup = auditUnsupportedBusinessAssertions(draft, emptyGrounding);
    expect(beforeClaim.some((x) => x.includes("offering_fit"))).toBe(true);
    expect(beforeUnsup.some((x) => x.includes("exactly_kind_of_work_we_love"))).toBe(true);

    const merged = [...new Set([...beforeClaim, ...beforeUnsup])];
    expect(violationsAreEntirelyAutoRepairable(merged)).toBe(true);

    const { text } = applyDeterministicInquirySoftConfirmRepairPasses(draft, 2);
    expect(auditInquiryClaimPermissionViolations(text, perms).filter((x) => x.includes("offering_fit"))).toEqual([]);
    expect(auditUnsupportedBusinessAssertions(text, emptyGrounding)).toEqual([]);
  });

  it("mixed real draft: proposal_process soft_confirm + normally_structure unsupported → repair clears", () => {
    const emptyGrounding = buildPersonaVerifiedGroundingBlob(baseDc(), [], null);
    const draft =
      "Hi Sam,\n\nWe would normally structure coverage around your timeline — happy to explain more.\n\nAna";
    const perms = softConfirmPermissions();
    const beforeClaim = auditInquiryClaimPermissionViolations(draft, perms);
    const beforeUnsup = auditUnsupportedBusinessAssertions(draft, emptyGrounding);
    expect(beforeClaim.some((x) => x.includes("proposal_process"))).toBe(true);
    expect(beforeUnsup.some((x) => x.includes("normally_structure"))).toBe(true);

    const merged = [...new Set([...beforeClaim, ...beforeUnsup])];
    expect(violationsAreEntirelyAutoRepairable(merged)).toBe(true);

    const { text } = applyDeterministicInquirySoftConfirmRepairPasses(draft, 2);
    expect(auditInquiryClaimPermissionViolations(text, perms).filter((x) => x.includes("proposal_process"))).toEqual(
      [],
    );
    expect(auditUnsupportedBusinessAssertions(text, emptyGrounding).some((x) => x.includes("normally_structure"))).toBe(
      false,
    );
  });

  it("mixed real draft: deliverable soft_confirm + commonly_include / within scope unsupported → repair clears", () => {
    const emptyGrounding = buildPersonaVerifiedGroundingBlob(baseDc(), [], null);
    const draft =
      "Hi Jo,\n\nSomething we commonly include is a careful edit pass, and previews are very much within our scope.\n\nAna";
    const perms = softConfirmPermissions();
    const beforeClaim = auditInquiryClaimPermissionViolations(draft, perms);
    const beforeUnsup = auditUnsupportedBusinessAssertions(draft, emptyGrounding);
    expect(beforeClaim.some((x) => x.includes("deliverable_inclusions"))).toBe(true);
    expect(beforeUnsup.some((x) => x.includes("commonly_include"))).toBe(true);
    expect(beforeUnsup.some((x) => x.includes("within_our_scope_settled"))).toBe(true);

    const merged = [...new Set([...beforeClaim, ...beforeUnsup])];
    expect(violationsAreEntirelyAutoRepairable(merged)).toBe(true);

    const { text } = applyDeterministicInquirySoftConfirmRepairPasses(draft, 2);
    expect(auditInquiryClaimPermissionViolations(text, perms).filter((x) => x.includes("deliverable_inclusions"))).toEqual(
      [],
    );
    expect(auditUnsupportedBusinessAssertions(text, emptyGrounding)).toEqual([]);
  });

  it("deterministic repair clears typical soft_confirm offering_fit violation (Lake Como–style)", () => {
    const draft =
      "Hi Elena,\n\nThat sounds like exactly the kind of celebration we love to photograph.\n\nAna";
    const before = auditInquiryClaimPermissionViolations(draft, softConfirmPermissions());
    expect(before.some((x) => x.includes("offering_fit"))).toBe(true);

    const { text } = applyDeterministicInquirySoftConfirmRepairPasses(draft, 2);
    const after = auditInquiryClaimPermissionViolations(text, softConfirmPermissions());
    expect(after.filter((x) => x.includes("offering_fit"))).toEqual([]);
  });

  it("repair preserves paragraph breaks and greeting line", () => {
    const draft = "Hi Elena & Marco,\n\nThat's exactly the kind of celebration we love to photograph.\n\nAna";
    const { text } = applyDeterministicInquirySoftConfirmRepairPasses(draft, 2);
    expect(text.startsWith("Hi Elena & Marco,")).toBe(true);
    expect(text.split("\n\n").length).toBeGreaterThanOrEqual(2);
  });
});
