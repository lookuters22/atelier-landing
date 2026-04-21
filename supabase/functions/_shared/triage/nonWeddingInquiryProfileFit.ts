/**
 * Deterministic studio **fit** for unlinked non-wedding business inquiries using
 * `studio_business_profiles` JSON only (no LLM). Combines service/travel **capacity**
 * with `lead_acceptance_rules` (`when_service_not_offered`, `when_geography_not_in_scope`)
 * before/with `playbook_rules` automation posture.
 */
import type { TriageIntent } from "../agents/triage.ts";

/** Overall routing posture after capacity + `lead_acceptance_rules` (onboarding). */
export type NonWeddingProfileFit = "fit" | "unfit" | "ambiguous" | "operator_review";

/** Raw service / travel capacity before lead-acceptance routing (unchanged). */
export type NonWeddingProfileFitDimension = "fit" | "unfit" | "ambiguous";

export type NonWeddingInquiryProfileFitResult = {
  overall: NonWeddingProfileFit;
  dimensions: {
    service: NonWeddingProfileFitDimension;
    travel_geography: NonWeddingProfileFitDimension;
  };
  /** Stable machine-readable tags for metadata / observability. */
  reasonCodes: string[];
};

type CapacityAxisOutcome =
  | "fit"
  | "ambiguous"
  | "oos_decline"
  | "oos_operator_review"
  | "oos_lead_ambiguous";

function readLeadAcceptanceRules(profile: {
  lead_acceptance_rules?: unknown;
}): Record<string, unknown> | null {
  const raw = profile.lead_acceptance_rules;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  return raw as Record<string, unknown>;
}

function parseOosLeadAction(raw: unknown): "decline_politely" | "route_to_operator" | "escalate" | null {
  if (raw === "decline_politely" || raw === "route_to_operator" || raw === "escalate") {
    return raw;
  }
  return null;
}

/**
 * When capacity says out-of-scope (`unfit`), map onboarding lead acceptance to a routing posture.
 * Missing / malformed values → `oos_lead_ambiguous` (safe escalation path upstream).
 */
function capacityUnfitToAxisOutcome(whenRule: unknown, rulesBlobPresent: boolean): CapacityAxisOutcome {
  if (!rulesBlobPresent) {
    return "oos_lead_ambiguous";
  }
  const parsed = parseOosLeadAction(whenRule);
  if (parsed === "decline_politely") return "oos_decline";
  if (parsed === "route_to_operator" || parsed === "escalate") return "oos_operator_review";
  return "oos_lead_ambiguous";
}

/** Specializations that support general non-wedding business inquiries. */
const NON_WEDDING_BUSINESS_SPECIALIZATIONS = new Set([
  "portraiture",
  "commercial",
  "general_events",
  "family_maternity",
  "boudoir",
]);

/** Wedding-centric domains — studio offering only these is treated as not serving general non-wedding business. */
const WEDDING_CENTRIC_SPECIALIZATIONS = new Set([
  "weddings",
  "elopements",
  "engagement",
  "engagements",
]);

function parseStringArray(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((x): x is string => typeof x === "string")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

function readMode(obj: unknown): string | null {
  if (!obj || typeof obj !== "object") return null;
  const m = (obj as Record<string, unknown>).mode;
  return typeof m === "string" ? m.trim().toLowerCase() : null;
}

function evaluateServiceDimension(
  specializations: string[],
  coreServices: string[],
  dispatchIntent: TriageIntent,
): { fit: NonWeddingProfileFitDimension; reasons: string[] } {
  const reasons: string[] = [];
  if (specializations.length === 0) {
    reasons.push("PROFILE_SERVICE_TYPES_MISSING_OR_EMPTY");
    return { fit: "ambiguous", reasons };
  }

  const hasNonWeddingBusiness = specializations.some((s) =>
    NON_WEDDING_BUSINESS_SPECIALIZATIONS.has(s),
  );
  const onlyWeddingCentric =
    specializations.length > 0 &&
    specializations.every((s) => WEDDING_CENTRIC_SPECIALIZATIONS.has(s));

  if (dispatchIntent === "commercial") {
    const hasCommercialCore = coreServices.includes("content_creation");
    if (specializations.includes("commercial") || hasCommercialCore) {
      return { fit: "fit", reasons: ["PROFILE_SERVICE_COMMERCIAL_OR_CONTENT_CREATION"] };
    }
    if (onlyWeddingCentric && !hasNonWeddingBusiness) {
      reasons.push("PROFILE_SERVICE_WEDDING_ONLY_STUDIO");
      return { fit: "unfit", reasons };
    }
    if (hasNonWeddingBusiness) {
      reasons.push("PROFILE_SERVICE_NON_WEDDING_SPECS_BUT_NOT_COMMERCIAL");
      return { fit: "ambiguous", reasons };
    }
    reasons.push("PROFILE_SERVICE_COMMERCIAL_UNCLEAR");
    return { fit: "ambiguous", reasons };
  }

  if (hasNonWeddingBusiness) {
    return { fit: "fit", reasons: ["PROFILE_SERVICE_HAS_NON_WEDDING_SPECIALIZATION"] };
  }
  if (onlyWeddingCentric) {
    reasons.push("PROFILE_SERVICE_WEDDING_ONLY_STUDIO");
    return { fit: "unfit", reasons };
  }

  reasons.push("PROFILE_SERVICE_SPECIALIZATION_MIX_UNCLEAR");
  return { fit: "ambiguous", reasons };
}

function evaluateTravelGeographyDimension(
  geographicScope: unknown,
  travelPolicy: unknown,
): { fit: NonWeddingProfileFitDimension; reasons: string[] } {
  const geoMode = readMode(geographicScope);
  const travelMode = readMode(travelPolicy);
  const reasons: string[] = [];

  if (!geoMode || !travelMode) {
    reasons.push("PROFILE_TRAVEL_OR_GEO_SCOPE_MISSING");
    return { fit: "ambiguous", reasons };
  }

  if (geoMode === "local_only" && travelMode === "no_travel") {
    reasons.push("PROFILE_TRAVEL_LOCAL_ONLY_NO_TRAVEL");
    return { fit: "unfit", reasons };
  }

  return { fit: "fit", reasons: ["PROFILE_TRAVEL_GEO_OK"] };
}

/**
 * @param profile — `studio_business_profiles` row fragment or null when no row exists.
 */
export function evaluateNonWeddingInquiryProfileFit(
  profile: {
    core_services?: unknown;
    service_types?: unknown;
    geographic_scope?: unknown;
    travel_policy?: unknown;
    lead_acceptance_rules?: unknown;
  } | null,
  dispatchIntent: TriageIntent,
): NonWeddingInquiryProfileFitResult {
  if (!profile) {
    return {
      overall: "ambiguous",
      dimensions: {
        service: "ambiguous",
        travel_geography: "ambiguous",
      },
      reasonCodes: ["PROFILE_ROW_MISSING"],
    };
  }

  const specializations = parseStringArray(profile.service_types);
  const coreServices = parseStringArray(profile.core_services);

  const service = evaluateServiceDimension(specializations, coreServices, dispatchIntent);
  const travelGeography = evaluateTravelGeographyDimension(
    profile.geographic_scope,
    profile.travel_policy,
  );

  const leadBlob = readLeadAcceptanceRules(profile);
  const rulesBlobPresent = leadBlob !== null;

  const serviceAxis: CapacityAxisOutcome =
    service.fit === "fit"
      ? "fit"
      : service.fit === "ambiguous"
        ? "ambiguous"
        : capacityUnfitToAxisOutcome(leadBlob?.when_service_not_offered, rulesBlobPresent);

  const travelAxis: CapacityAxisOutcome =
    travelGeography.fit === "fit"
      ? "fit"
      : travelGeography.fit === "ambiguous"
        ? "ambiguous"
        : capacityUnfitToAxisOutcome(leadBlob?.when_geography_not_in_scope, rulesBlobPresent);

  const reasonCodes = [...service.reasons, ...travelGeography.reasons];
  if (serviceAxis === "oos_operator_review") {
    reasonCodes.push("PROFILE_OOS_SERVICE_LEAD_ROUTES_OPERATOR");
  } else if (service.fit === "unfit" && serviceAxis === "oos_lead_ambiguous") {
    reasonCodes.push("PROFILE_LEAD_ACCEPTANCE_SERVICE_RULE_MISSING_OR_AMBIGUOUS");
  }
  if (travelAxis === "oos_operator_review") {
    reasonCodes.push("PROFILE_OOS_GEO_TRAVEL_LEAD_ROUTES_OPERATOR");
  } else if (travelGeography.fit === "unfit" && travelAxis === "oos_lead_ambiguous") {
    reasonCodes.push("PROFILE_LEAD_ACCEPTANCE_GEO_RULE_MISSING_OR_AMBIGUOUS");
  }

  const dims = {
    service: service.fit,
    travel_geography: travelGeography.fit,
  };

  if (serviceAxis === "oos_operator_review" || travelAxis === "oos_operator_review") {
    return { overall: "operator_review", dimensions: dims, reasonCodes };
  }
  if (serviceAxis === "oos_lead_ambiguous" || travelAxis === "oos_lead_ambiguous") {
    return { overall: "ambiguous", dimensions: dims, reasonCodes };
  }
  if (serviceAxis === "ambiguous" || travelAxis === "ambiguous") {
    return { overall: "ambiguous", dimensions: dims, reasonCodes };
  }
  if (serviceAxis === "oos_decline" || travelAxis === "oos_decline") {
    return { overall: "unfit", dimensions: dims, reasonCodes };
  }

  return {
    overall: "fit",
    dimensions: { service: "fit", travel_geography: "fit" },
    reasonCodes,
  };
}

/** Decline rationale fragment when profile is unfit (combined with standard decline template in router). */
export const PROFILE_UNFIT_DECLINE_INSTRUCTION =
  "Studio business profile: inquiry appears outside offered services, geography, or travel scope.";

/**
 * Internal routing note when profile fits but no `non_wedding_inquiry_*` playbook rule exists.
 * Stored on the draft's `instruction_history` as `profile_fallback_operator_hint`; the customer-facing
 * draft body is built separately in `nonWeddingBusinessInquiryRouter` (not this string).
 */
export const PROFILE_FIT_FALLBACK_DRAFT_INSTRUCTION =
  "Non-wedding business inquiry — studio profile indicates scope may fit, but there is no explicit playbook rule. Review/edit the seeded reply or replace with a polite decline before approval.";
