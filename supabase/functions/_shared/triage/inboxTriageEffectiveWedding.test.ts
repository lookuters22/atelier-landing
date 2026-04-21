import { describe, expect, it } from "vitest";
import {
  computeEffectiveWeddingAfterInboxTriage,
  nonWeddingPromotionYieldedLinkedProject,
  type NonWeddingBusinessInquiryRouteOutcome,
} from "./nonWeddingBusinessInquiryRouter.ts";

function baseOutcome(
  over: Partial<NonWeddingBusinessInquiryRouteOutcome>,
): NonWeddingBusinessInquiryRouteOutcome {
  return {
    decision: "unclear_operator_review",
    reasonCode: "PROFILE_AMBIGUOUS_NO_PLAYBOOK_ESCALATE",
    matchedPlaybookRuleId: null,
    matchedPlaybookActionKey: null,
    draftId: null,
    escalationId: null,
    decisionSource: "profile_ambiguous_escalate",
    profileFit: "ambiguous",
    profileFitReasonCodes: [],
    alreadyRouted: false,
    promotedProjectId: null,
    promotedProjectType: null,
    ...over,
  };
}

describe("nonWeddingPromotionYieldedLinkedProject", () => {
  it("is true only for allowed_promote_to_project with promoted id", () => {
    expect(
      nonWeddingPromotionYieldedLinkedProject(
        baseOutcome({
          decision: "allowed_promote_to_project",
          reasonCode: "CUSTOMER_LEAD_PROMOTE_TO_PROJECT",
          promotedProjectId: "wid-1",
          promotedProjectType: "commercial",
        }),
      ),
    ).toBe(true);
    expect(nonWeddingPromotionYieldedLinkedProject(null)).toBe(false);
    expect(
      nonWeddingPromotionYieldedLinkedProject(
        baseOutcome({ decision: "allowed_draft", promotedProjectId: null }),
      ),
    ).toBe(false);
    expect(
      nonWeddingPromotionYieldedLinkedProject(
        baseOutcome({
          decision: "allowed_promote_to_project",
          promotedProjectId: "",
        }),
      ),
    ).toBe(false);
  });

  it("vendor / escalation outcomes are not linked promotion", () => {
    expect(
      nonWeddingPromotionYieldedLinkedProject(
        baseOutcome({
          decision: "unclear_operator_review",
          reasonCode: "SENDER_ROLE_VENDOR_SOLICITATION_OPERATOR_REVIEW",
        }),
      ),
    ).toBe(false);
  });
});

describe("computeEffectiveWeddingAfterInboxTriage (Slice 4)", () => {
  it("prefers wedding-intake bootstrap over final routing ids", () => {
    const r = computeEffectiveWeddingAfterInboxTriage({
      finalWeddingId: null,
      finalPhotographerId: "photo-derived",
      tenantPhotographerId: "photo-event",
      bootstrapWeddingId: "wed-bootstrap",
      nonWeddingOutcome: baseOutcome({
        decision: "allowed_promote_to_project",
        promotedProjectId: "wed-promo",
      }),
    });
    expect(r).toEqual({
      effectiveWeddingId: "wed-bootstrap",
      effectivePhotographerId: "photo-event",
    });
  });

  it("uses promoted project when no bootstrap", () => {
    const r = computeEffectiveWeddingAfterInboxTriage({
      finalWeddingId: null,
      finalPhotographerId: "photo-derived",
      tenantPhotographerId: "photo-event",
      bootstrapWeddingId: null,
      nonWeddingOutcome: baseOutcome({
        decision: "allowed_promote_to_project",
        reasonCode: "CUSTOMER_LEAD_PROMOTE_TO_PROJECT",
        promotedProjectId: "wed-promo",
        promotedProjectType: "family",
      }),
    });
    expect(r).toEqual({
      effectiveWeddingId: "wed-promo",
      effectivePhotographerId: "photo-derived",
    });
  });

  it("falls back to tenant photographer when derived id is missing", () => {
    const r = computeEffectiveWeddingAfterInboxTriage({
      finalWeddingId: null,
      finalPhotographerId: null,
      tenantPhotographerId: "photo-event",
      bootstrapWeddingId: null,
      nonWeddingOutcome: baseOutcome({
        decision: "allowed_promote_to_project",
        promotedProjectId: "wed-promo",
      }),
    });
    expect(r.effectivePhotographerId).toBe("photo-event");
  });

  it("does not apply promotion for draft-only non-wedding outcomes", () => {
    const r = computeEffectiveWeddingAfterInboxTriage({
      finalWeddingId: null,
      finalPhotographerId: "p",
      tenantPhotographerId: "p",
      bootstrapWeddingId: null,
      nonWeddingOutcome: baseOutcome({
        decision: "allowed_draft",
        draftId: "d1",
      }),
    });
    expect(r).toEqual({ effectiveWeddingId: null, effectivePhotographerId: "p" });
  });

  it("passes through matchmaker-linked final ids when no bootstrap or promotion", () => {
    const r = computeEffectiveWeddingAfterInboxTriage({
      finalWeddingId: "wed-mm",
      finalPhotographerId: "p2",
      tenantPhotographerId: "p1",
      bootstrapWeddingId: null,
      nonWeddingOutcome: null,
    });
    expect(r).toEqual({ effectiveWeddingId: "wed-mm", effectivePhotographerId: "p2" });
  });
});
