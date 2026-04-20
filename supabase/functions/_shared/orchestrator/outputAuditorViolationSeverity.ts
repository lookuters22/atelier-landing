/**
 * Severity model for post-persona output audits — supports enterprise-safe auto-repair vs hard escalation.
 *
 * - **hard_block**: cannot be safely softened by deterministic repair; operator review or policy failure.
 * - **auto_repair**: low/medium inquiry wording drift (soft_confirm claim tiers) — try deterministic downgrade first.
 * - **pass**: no violation (caller uses empty lists).
 *
 * Mixed bundles: the same sentence can yield both `inquiry_claim_permission:*` (soft_confirm) and
 * `unsupported_business_assertion:*`. Low-risk assertion IDs that match
 * {@link applyDeterministicInquirySoftConfirmRepairPasses} are also `auto_repair` so the repair loop runs.
 */
import { UNSUPPORTED_ASSERTION_VIOLATION_PREFIX } from "./auditUnsupportedBusinessAssertions.ts";
import {
  INQUIRY_CLAIM_PERMISSION_VIOLATION_PREFIX,
} from "./auditInquiryClaimPermissionViolations.ts";

export type OutputViolationSeverity = "hard_block" | "auto_repair";

/** Escalation copy + analytics — explicit families (not generic “commercial” for inquiry-fit failures). */
export type OutputAuditorEscalationKind =
  | "persona_structured_output"
  | "planner_private_leak"
  | "availability_claim_failed"
  | "commercial_grounding_failed"
  | "grounding_review_failed"
  | "inquiry_claim_permission_failed";

/** `unsupported_business_assertion:${id}:` — must match real ids from `auditUnsupportedBusinessAssertions.ts`. */
export function parseUnsupportedAssertionId(violation: string): string | null {
  const v = violation.trim();
  if (!v.startsWith(UNSUPPORTED_ASSERTION_VIOLATION_PREFIX)) return null;
  const rest = v.slice(UNSUPPORTED_ASSERTION_VIOLATION_PREFIX.length);
  const i = rest.indexOf(":");
  if (i <= 0) return null;
  return rest.slice(0, i);
}

/**
 * Narrow allowlist: assertion ids whose phrasing is softened by
 * `repairInquiryClaimSoftConfirmDrift.ts` (same low-risk families as inquiry soft_confirm repair).
 *
 * **Excluded (hard_block):** heart/core “brand positioning”, absolute triggers, availability & destination
 * families, combo heuristic, destination hype, `typically_offer` (no repair rule yet), preset/deny-list
 * proposal ids without a replacement (`dont_use_preset`, `no_preset_structure`, `usually_begin_with`).
 */
export const AUTO_REPAIR_UNSUPPORTED_ASSERTION_IDS: ReadonlySet<string> = new Set([
  // ALWAYS_UNGROUNDED_HYPE — repair replaces these (not heart/core — too broad for this gate; not always_include)
  "exactly_kind_of_work_we_love",
  "this_is_exactly_the_kind",
  "standard_for_us",
  "regularly_handle",
  "not_an_addon",
  // FAMILY_CAPABILITY_FIT
  "in_line_how_we_usually_work",
  "fit_kind_of_weddings_we_photograph",
  "celebration_we_specialize",
  "this_is_sort_we_specialize",
  "kind_of_work_we_specialize",
  "comfortable_incorporating",
  "build_into_coverage",
  "commonly_include",
  "within_our_scope_settled",
  "natural_fit_what_we_do",
  // FAMILY_PROCESS_PROPOSAL — subset with deterministic repair strings
  "natural_part_of_proposal",
  "would_be_natural_part",
  "normally_structure",
  "usually_structure_weddings",
  "proposals_always_shaped",
  "shape_proposals_this_way",
]);

export function isAutoRepairableUnsupportedAssertionViolation(violation: string): boolean {
  const id = parseUnsupportedAssertionId(violation);
  if (!id) return false;
  return AUTO_REPAIR_UNSUPPORTED_ASSERTION_IDS.has(id);
}

/**
 * True when this inquiry claim-permission line is soft_confirm tier drift that we can try to
 * deterministically soften (offering_fit / proposal_process / deliverable_inclusions).
 *
 * Not auto-repairable: availability, destination, booking_next_step, offering_fit at explore (or below) when message is “exceeds explore”.
 */
export function isAutoRepairableInquiryClaimViolation(violation: string): boolean {
  const v = violation.trim();
  if (!v.startsWith(INQUIRY_CLAIM_PERMISSION_VIOLATION_PREFIX)) return false;
  if (v.startsWith(`${INQUIRY_CLAIM_PERMISSION_VIOLATION_PREFIX}availability`)) return false;
  if (v.startsWith(`${INQUIRY_CLAIM_PERMISSION_VIOLATION_PREFIX}destination`)) return false;
  if (v.startsWith(`${INQUIRY_CLAIM_PERMISSION_VIOLATION_PREFIX}booking_next_step`)) return false;

  if (
    v.startsWith(`${INQUIRY_CLAIM_PERMISSION_VIOLATION_PREFIX}offering_fit`) &&
    v.includes("exceeds explore permission")
  ) {
    return false;
  }

  if (
    v.startsWith(`${INQUIRY_CLAIM_PERMISSION_VIOLATION_PREFIX}offering_fit`) &&
    v.includes("while permission is soft_confirm")
  ) {
    return true;
  }
  if (
    v.startsWith(`${INQUIRY_CLAIM_PERMISSION_VIOLATION_PREFIX}proposal_process`) &&
    v.includes("permission is soft_confirm")
  ) {
    return true;
  }
  if (
    v.startsWith(`${INQUIRY_CLAIM_PERMISSION_VIOLATION_PREFIX}deliverable_inclusions`) &&
    v.includes("permission is soft_confirm")
  ) {
    return true;
  }
  return false;
}

export function classifyPersonaOutputViolationSeverity(violation: string): OutputViolationSeverity {
  if (isAutoRepairableUnsupportedAssertionViolation(violation)) return "auto_repair";
  if (isAutoRepairableInquiryClaimViolation(violation)) return "auto_repair";
  return "hard_block";
}

export function partitionPersonaOutputViolations(violations: string[]): {
  hardBlock: string[];
  autoRepair: string[];
} {
  const hardBlock: string[] = [];
  const autoRepair: string[] = [];
  for (const v of violations) {
    if (classifyPersonaOutputViolationSeverity(v) === "auto_repair") autoRepair.push(v);
    else hardBlock.push(v);
  }
  return { hardBlock, autoRepair };
}

/** True when every violation is auto-repairable (safe to run deterministic inquiry softening). */
export function violationsAreEntirelyAutoRepairable(violations: string[]): boolean {
  if (violations.length === 0) return false;
  return violations.every((v) => classifyPersonaOutputViolationSeverity(v) === "auto_repair");
}

function isUnsupportedAssertionViolation(v: string): boolean {
  return v.startsWith(UNSUPPORTED_ASSERTION_VIOLATION_PREFIX);
}

function isAvailabilityBookingGuardViolation(v: string): boolean {
  return (
    v.startsWith("email_draft uses ") ||
    v.startsWith("email_draft mentions ") ||
    v.startsWith("email_draft describes ") ||
    v.startsWith("email_draft contains ") ||
    v.startsWith("email_draft pushes ")
  );
}

function isInquiryAvailabilityClaimViolation(v: string): boolean {
  return v.startsWith(`${INQUIRY_CLAIM_PERMISSION_VIOLATION_PREFIX}availability`);
}

function isCommercialTermsViolation(v: string): boolean {
  return (
    v.includes("package_name not grounded") ||
    v.includes("deposit_percentage") ||
    v.includes("travel_miles_included") ||
    v.includes("email_draft asserts deposit/booking percentage") ||
    v.includes("email_draft asserts travel/mileage") ||
    v.includes("email_draft deposit percentages do not match")
  );
}

/**
 * Pick a single escalation kind for operator-facing copy when multiple auditors fail.
 * Priority: structured output is handled separately; then leak; then availability; then numeric commercial;
 * then unsupported grounding; then inquiry claim hard failures; default commercial.
 */
export function resolveOutputAuditorEscalationKind(violations: string[]): OutputAuditorEscalationKind {
  if (violations.length === 0) return "commercial_grounding_failed";

  /**
   * Repair loop exhausted but only auto-repair-eligible drift remains — not generic “commercial”.
   * Prefer inquiry_claim when any inquiry line is present; else grounding review (unsupported-only soft bundle).
   */
  if (
    violations.length > 0 &&
    violations.every((v) => classifyPersonaOutputViolationSeverity(v) === "auto_repair")
  ) {
    if (violations.some((v) => v.startsWith(INQUIRY_CLAIM_PERMISSION_VIOLATION_PREFIX))) {
      return "inquiry_claim_permission_failed";
    }
    return "grounding_review_failed";
  }

  const hasAvail =
    violations.some(isInquiryAvailabilityClaimViolation) ||
    violations.some(isAvailabilityBookingGuardViolation);
  const hasCommercial = violations.some(isCommercialTermsViolation);
  const hasUnsupported = violations.some(isUnsupportedAssertionViolation);
  const hasInquiryHard = violations.some(
    (v) =>
      v.startsWith(INQUIRY_CLAIM_PERMISSION_VIOLATION_PREFIX) &&
      !isAutoRepairableInquiryClaimViolation(v),
  );

  if (hasAvail) return "availability_claim_failed";
  if (hasCommercial) return "commercial_grounding_failed";
  if (hasUnsupported) return "grounding_review_failed";
  if (hasInquiryHard) return "inquiry_claim_permission_failed";

  return "commercial_grounding_failed";
}
