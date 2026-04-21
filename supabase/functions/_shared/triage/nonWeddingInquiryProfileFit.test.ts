import { describe, expect, it } from "vitest";
import { evaluateNonWeddingInquiryProfileFit } from "./nonWeddingInquiryProfileFit.ts";

/** Typical onboarding row: explicit OOS handling (required for deterministic decline when unfit). */
const leadDeclineBoth = {
  schema_version: 2,
  when_service_not_offered: "decline_politely" as const,
  when_geography_not_in_scope: "decline_politely" as const,
};

describe("evaluateNonWeddingInquiryProfileFit", () => {
  it("missing profile row → ambiguous", () => {
    const out = evaluateNonWeddingInquiryProfileFit(null, "concierge");
    expect(out.overall).toBe("ambiguous");
    expect(out.reasonCodes).toContain("PROFILE_ROW_MISSING");
  });

  it("wedding-only specializations + decline lead rules → unfit for concierge", () => {
    const out = evaluateNonWeddingInquiryProfileFit(
      {
        core_services: ["photo"],
        service_types: ["weddings", "elopements"],
        geographic_scope: { mode: "domestic", schema_version: 2 },
        travel_policy: { mode: "travels_freely", schema_version: 2 },
        lead_acceptance_rules: leadDeclineBoth,
      },
      "concierge",
    );
    expect(out.overall).toBe("unfit");
    expect(out.dimensions.service).toBe("unfit");
  });

  it("service unfit + route_to_operator → operator_review (not unfit)", () => {
    const out = evaluateNonWeddingInquiryProfileFit(
      {
        core_services: ["photo"],
        service_types: ["weddings", "elopements"],
        geographic_scope: { mode: "domestic", schema_version: 2 },
        travel_policy: { mode: "travels_freely", schema_version: 2 },
        lead_acceptance_rules: {
          schema_version: 2,
          when_service_not_offered: "route_to_operator",
          when_geography_not_in_scope: "decline_politely",
        },
      },
      "concierge",
    );
    expect(out.overall).toBe("operator_review");
    expect(out.reasonCodes).toContain("PROFILE_OOS_SERVICE_LEAD_ROUTES_OPERATOR");
  });

  it("service unfit + missing lead rule keys → ambiguous", () => {
    const out = evaluateNonWeddingInquiryProfileFit(
      {
        core_services: ["photo"],
        service_types: ["weddings", "elopements"],
        geographic_scope: { mode: "domestic", schema_version: 2 },
        travel_policy: { mode: "travels_freely", schema_version: 2 },
        lead_acceptance_rules: { schema_version: 2 },
      },
      "concierge",
    );
    expect(out.overall).toBe("ambiguous");
    expect(out.reasonCodes).toContain("PROFILE_LEAD_ACCEPTANCE_SERVICE_RULE_MISSING_OR_AMBIGUOUS");
  });

  it("portraiture alongside weddings → fit", () => {
    const out = evaluateNonWeddingInquiryProfileFit(
      {
        core_services: ["photo"],
        service_types: ["weddings", "portraiture"],
        geographic_scope: { mode: "domestic", schema_version: 2 },
        travel_policy: { mode: "travels_freely", schema_version: 2 },
        lead_acceptance_rules: leadDeclineBoth,
      },
      "concierge",
    );
    expect(out.overall).toBe("fit");
  });

  it("local_only + no_travel + geo decline → unfit (travel/geography dimension)", () => {
    const out = evaluateNonWeddingInquiryProfileFit(
      {
        core_services: ["photo"],
        service_types: ["portraiture"],
        geographic_scope: { mode: "local_only", schema_version: 2 },
        travel_policy: { mode: "no_travel", schema_version: 2 },
        lead_acceptance_rules: leadDeclineBoth,
      },
      "concierge",
    );
    expect(out.overall).toBe("unfit");
    expect(out.dimensions.travel_geography).toBe("unfit");
  });

  it("geo/travel unfit + escalate → operator_review", () => {
    const out = evaluateNonWeddingInquiryProfileFit(
      {
        core_services: ["photo"],
        service_types: ["portraiture"],
        geographic_scope: { mode: "local_only", schema_version: 2 },
        travel_policy: { mode: "no_travel", schema_version: 2 },
        lead_acceptance_rules: {
          schema_version: 2,
          when_service_not_offered: "decline_politely",
          when_geography_not_in_scope: "escalate",
        },
      },
      "concierge",
    );
    expect(out.overall).toBe("operator_review");
    expect(out.reasonCodes).toContain("PROFILE_OOS_GEO_TRAVEL_LEAD_ROUTES_OPERATOR");
  });

  it("commercial intent requires commercial specialization or content_creation core", () => {
    const unfit = evaluateNonWeddingInquiryProfileFit(
      {
        core_services: ["photo"],
        service_types: ["weddings"],
        geographic_scope: { mode: "domestic", schema_version: 2 },
        travel_policy: { mode: "travels_freely", schema_version: 2 },
        lead_acceptance_rules: leadDeclineBoth,
      },
      "commercial",
    );
    expect(unfit.overall).toBe("unfit");

    const fit = evaluateNonWeddingInquiryProfileFit(
      {
        core_services: ["photo", "content_creation"],
        service_types: ["weddings"],
        geographic_scope: { mode: "domestic", schema_version: 2 },
        travel_policy: { mode: "travels_freely", schema_version: 2 },
        lead_acceptance_rules: leadDeclineBoth,
      },
      "commercial",
    );
    expect(fit.overall).toBe("fit");
  });
});
