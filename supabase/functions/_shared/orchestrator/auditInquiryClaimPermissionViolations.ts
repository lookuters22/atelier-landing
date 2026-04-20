/**
 * **Contract-first** post-generation audit: compares draft prose to {@link InquiryClaimPermissionMap}.
 * Complements `auditUnsupportedBusinessAssertions` (phrase belt-and-suspenders) with permission-aware checks.
 */
import type {
  InquiryClaimPermissionMap,
  InquiryClaimPermissionLevel,
} from "../../../../src/types/inquiryClaimPermissions.types.ts";
import {
  detectConcreteAvailabilityAssertionText,
  splitDraftIntoAuditUnits,
} from "./auditUnsupportedBusinessAssertions.ts";

export const INQUIRY_CLAIM_PERMISSION_VIOLATION_PREFIX = "inquiry_claim_permission:";

const RANK: Record<InquiryClaimPermissionLevel, number> = {
  defer: 0,
  explore: 1,
  soft_confirm: 2,
  confirm: 3,
};

/** Mirrors exploratory handling in `auditUnsupportedBusinessAssertions` for per-unit scans. */
function hasExploratoryHedge(unit: string): boolean {
  return /\b(?:talk through|walk through|happy to (?:discuss|talk|shape|explore)|glad to (?:discuss|talk)|shape (?:that )?with you|with you in a proposal|in a proposal\b|discuss how (?:that|it) could fit|could fit the day|might fit|if the date (?:is )?still open on our side|whether the date (?:is )?still open on our side|based on (?:the )?(?:scope|location)|scope and location|relation to scope|we can explore|we'd love to (?:discuss|hear|learn))\b/i.test(
    unit,
  );
}

function isPrimarilyExploratoryAllowlist(unit: string): boolean {
  const u = unit.trim();
  if (!u) return true;
  if (/^that sounds aligned with what you described\b/i.test(u)) return true;
  if (/^we can talk through\b/i.test(u)) return true;
  if (
    /\bwe'd be happy to (?:discuss|shape|talk)\b/i.test(u) &&
    !/\b(?:usually|typically|always|specialize|include)\b/i.test(u)
  ) {
    return true;
  }
  if (/\bfor destination work, we'd normally (?:talk through|discuss)\b/i.test(u)) return true;
  if (/\bif the date (?:is )?still open on our side\b/i.test(u)) return true;
  return false;
}

function skipUnitForClaimScan(unit: string): boolean {
  return (
    isPrimarilyExploratoryAllowlist(unit) ||
    (hasExploratoryHedge(unit) &&
      !/\b(?:specialize|specialise|usually structure|commonly include|within our scope)\b/i.test(unit))
  );
}

const RE_STUDIO = /\b(?:we|we're|we are|our team|I|I'm|I am)\b/i;
const RE_CERTAINTY =
  /\b(?:very much|usually|typically|always|regularly|naturally|fully|definitely|commonly|frequently|often|standard|part of our|built into our)\b/i;
const RE_ACTION =
  /\b(?:specialize|specialise|offer|handle|structure|photograph|shoot|cover|accommodate|incorporat|include|deliver)\b/i;
const RE_SCOPE =
  /\b(?:destination|international|abroad|logistics|travel|proposal|proposals|coverage|analog|gallery|preview|wedding|celebration|serbia|availability|calendar|smaller weddings)\b/i;

function comboSettledTruthUnit(unit: string): boolean {
  if (skipUnitForClaimScan(unit)) return false;
  if (!RE_STUDIO.test(unit)) return false;
  if (!RE_CERTAINTY.test(unit)) return false;
  if (!RE_ACTION.test(unit)) return false;
  if (!RE_SCOPE.test(unit)) return false;
  if (unit.length < 40) return false;
  return true;
}

const HYPE_TRIGGERS: RegExp[] = [
  /\bat the heart of what we do\b/i,
  /\bcore to how we work\b/i,
  /\bexactly the kind of work we love\b/i,
  /\bthis is exactly the kind of\b[^.!?]{0,80}\b(we love|work)\b/i,
  /\bstandard for us\b/i,
  /\bwe regularly (?:handle|do|photograph|shoot|cover)\b/i,
  /\b(?:something |)we always (?:include|offer|provide|deliver)\b/i,
  /\bnot an add-on\b/i,
];

const ABSOLUTE_TRIGGERS: RegExp[] = [
  /\bwe\s+absolutely\b/i,
  /\bwe're absolutely\b|\bwe are absolutely\b/i,
  /\bI\s+absolutely\b/i,
  /\b(?:can|could)\s+absolutely\s+accommodate\b/i,
  /\bwe always\b[^.!?]{0,80}\b(?:photograph|shoot|cover|include|offer|deliver|structure|shape)\b/i,
];

/** Paraphrase: “exactly the kind … we love to photograph”. */
const EXACTLY_KIND_LOVE: RegExp[] = [
  /\bexactly the kind of\b[^.!?]{0,100}\b(?:we )?love to photograph\b/i,
  /\bsounds like exactly the kind\b/i,
  /\bexactly the kind of celebration\b[^.!?]{0,80}\b(?:we )?love\b/i,
];

const CAPABILITY_SOFT: RegExp[] = [
  /\b(?:very much )?in line with how we (?:usually|typically|often) work\b/i,
  /\b(?:beautiful |great |perfect )?fit for the kind of weddings we (?:photograph|shoot|cover)\b/i,
  /\b(?:the )?sort of celebration we (?:specialize|specialise)\b/i,
  /\bthis is (?:very much )?the sort of\b[^.!?]{0,60}\bwe (?:specialize|specialise)\b/i,
  /\bkind of (?:celebration|wedding|work) we (?:specialize|specialise)\b/i,
  /\bwe(?:'re| are) (?:fully )?comfortable (?:building|incorporating|including)\b/i,
  /\bbuild (?:this |that )?into (?:coverage|our coverage|the coverage)\b/i,
  /\bsomething we commonly include\b/i,
  /\bsomething we (?:typically|usually) offer\b/i,
  /\b(?:very much )?within our scope\b/i,
  /\bnatural fit (?:for )?what we (?:do|offer)\b/i,
];

const CAPABILITY_HARD_EXTRA: RegExp[] = [
  /\blove to photograph\b/i,
  /\bthe kind of\b[^.!?]{0,60}\bwe (?:photograph|shoot|cover)\b/i,
];

const PROCESS_SETTLED: RegExp[] = [
  /\b(?:a )?natural part of (?:the )?proposal\b/i,
  /\bwould be a natural part\b/i,
  /\bwe(?:'d| would) normally structure\b/i,
  /\bwe usually structure\b[^.!?]{0,50}\bweddings?\b/i,
  /\bwe don't use preset\b/i,
  /\bno preset structure\b/i,
  /\bwe usually begin with\b/i,
  /\bour proposals are always\b/i,
  /\bshape proposals (?:this|that) way\b/i,
  /\bnaturally build\b[^.!?]{0,40}\b(?:the )?proposal\b/i,
  /\bwe'd naturally\b[^.!?]{0,50}\bproposal\b/i,
];

const LOGISTICS_SETTLED: RegExp[] = [
  /\bhandle destination logistics (?:regularly|often|frequently)\b/i,
  /\bwe (?:often|frequently|regularly) photograph\b[^.!?]{0,40}\bdestination\b/i,
  /\bdestination weddings outside\b/i,
  /\binternational work is something we do (?:frequently|often|regularly)\b/i,
  /\bphotograph\b[^.!?]{0,50}\boutside serbia\b/i,
  /\bwe(?:'ll| will|'d| would) structure (?:travel|logistics) around\b/i,
];

const DELIVERABLE_SETTLED: RegExp[] = [
  /\bsomething we commonly include\b/i,
  /\bwe always\b[^.!?]{0,60}\b(?:include|deliver|provide)\b/i,
];

/**
 * `booking_next_step` — operational funnel / CTA strength (call, book, packages, consultation).
 *
 * - **confirm (`rank === 3`)**: definitive next-step and booking CTAs allowed.
 * - **soft_confirm (`2`)**: cautious invitations OK; block definitive “the next step is…” and settled studio funnel habits.
 * - **explore (`1`)**: discuss possibilities only; block concrete CTAs and settled habits.
 * - **defer (`0`)**: same enforcement as explore in v1 (no concrete operational next-step steering).
 *
 * Avoid `(?<!\bwhat )\bthe next step is\b` false positives on “what the next step is…”. */
const BOOKING_NEXT_STEP_CONCRETE: RegExp[] = [
  /(?<!\bwhat )\bthe next step is\b/i,
  /(?<!\bwhat )\bthe best next step is\b/i,
  /\bas a next step,\s*(?:we |I )?(?:can |will )?(?:schedule|book|set up|send)\b/i,
  /\byou can book (?:a |your )?(?:time|call|slot)\b/i,
  /\bbook a (?:time|call|slot)\b/i,
  /\bbook (?:using |with )(?:the )?link\b/i,
  /\bI(?:'d| would) love to set up a time (?:for you )?to connect\b/i,
  /\bthe next step would be (?:for me )?to send\b/i,
  /\bI can send over (?:the )?(?:collections|package(?: options)?)\b/i,
  /\bwe(?:'ll| will) start with a consultation\b/i,
  /\blet(?:'s| us) schedule a consultation\b/i,
  /\bschedule a consultation as (?:the |our )?next step\b/i,
  /\bwe can send (?:you )?(?:the )?(?:packages|collections)\s+next\b/i,
  /\b(?:the )?next step would be (?:a |to )?(?:brief )?call\b/i,
  /\bset up a time for you to connect with us\b/i,
];

/** Settled studio habit / funnel — not allowed below `soft_confirm` (rank < 3). */
const BOOKING_NEXT_STEP_SETTLED_HABIT: RegExp[] = [
  /\bwe usually begin with (?:a )?(?:brief )?(?:call|consultation)\b/i,
  /\bwe (?:typically|generally) begin with (?:a )?(?:brief )?(?:call|consultation)\b/i,
  /\bwe start with (?:a )?(?:call|consultation)\b/i,
];

/**
 * Soft operational invite (not framed as “discuss next steps”) — blocked for `explore` and `defer` (`rank <= 1`),
 * allowed for `soft_confirm` so cautious scheduling language can still pass.
 */
const BOOKING_NEXT_STEP_SOFT_CTA: RegExp[] = [
  /\bhappy to (?:set up|schedule|line up) (?:a )?(?:brief )?(?:call|time)\b/i,
  /\bI(?:'d| would) love to (?:set up|schedule|line up) (?:a )?(?:brief )?(?:call|time)\b/i,
  /\bwe can schedule (?:a )?(?:brief )?call\b/i,
  /\blet me (?:know|get) (?:a )?time (?:on|for) your calendar\b/i,
];

/**
 * Soft proactive steer toward a live call or “conversation” as the next move — blocked for `explore` and `defer`
 * (`rank <= 1`). Distinct from {@link BOOKING_NEXT_STEP_SOFT_CTA}: phrasing like “Would a call work…” or
 * “best way forward would be a conversation” previously slipped past auditors.
 */
const BOOKING_NEXT_STEP_PROACTIVE_LIVE_STEER_EXPLORE: RegExp[] = [
  /\bwould a call work\b/i,
  /\bwould you be open to (?:a )?call\b/i,
  /\b(?:the )?best way forward would be (?:a )?conversation\b/i,
  /\b(?:the )?best way forward would be (?:a )?call\b/i,
  /\bwe can talk through this on a call\b/i,
  /\blet(?:'s| us) connect over a call\b/i,
  /\bhave a conversation about your (?:day|wedding)\b/i,
  /\b(?:I(?:'d| would) )?love to learn more over a conversation\b/i,
  /\bhop on (?:a )?(?:quick |brief )?call\b/i,
];

function unitMatchesAny(unit: string, patterns: RegExp[]): boolean {
  return patterns.some((re) => re.test(unit));
}

/** Exploratory / discussive next-step framing — does not realize a concrete operational CTA. */
function bookingNextStepExploreFriendlyUnit(unit: string): boolean {
  if (skipUnitForClaimScan(unit)) return true;
  if (
    /\bdiscuss what (?:the )?next step could look like\b/i.test(unit) ||
    /\btalk through next steps\b/i.test(unit) ||
    /\bhappy to talk through next steps\b/i.test(unit) ||
    /\bwe can (?:talk through|discuss) (?:what )?(?:the )?next steps?\b/i.test(unit) ||
    /\bif you(?:'d)? like,?\s*we can (?:talk through|discuss) (?:the )?next steps?\b/i.test(unit)
  ) {
    return true;
  }
  if (/\bif the date (?:is )?still open on our side\b/i.test(unit) && /\bnext step\b/i.test(unit)) {
    return true;
  }
  return false;
}

function bookingNextStepConcreteUnit(unit: string): boolean {
  if (bookingNextStepExploreFriendlyUnit(unit)) return false;
  return unitMatchesAny(unit, BOOKING_NEXT_STEP_CONCRETE);
}

function bookingNextStepSettledHabitUnit(unit: string): boolean {
  if (bookingNextStepExploreFriendlyUnit(unit)) return false;
  return unitMatchesAny(unit, BOOKING_NEXT_STEP_SETTLED_HABIT);
}

function bookingNextStepSoftCtaUnit(unit: string): boolean {
  if (bookingNextStepExploreFriendlyUnit(unit)) return false;
  return unitMatchesAny(unit, BOOKING_NEXT_STEP_SOFT_CTA);
}

function bookingNextStepProactiveLiveSteerUnit(unit: string): boolean {
  if (
    /\bcontinue (?:the |our )?conversation (?:here|over email|in (?:this )?thread)\b/i.test(unit) ||
    /\b(?:happy to |glad to )?(?:continue|keep) (?:the )?(?:conversation|thread) here\b/i.test(unit)
  ) {
    return false;
  }
  /** Run before {@link bookingNextStepExploreFriendlyUnit}: hedge patterns like `walk through` must not
   * whitewash “best way forward would be a conversation…”. */
  if (unitMatchesAny(unit, BOOKING_NEXT_STEP_PROACTIVE_LIVE_STEER_EXPLORE)) return true;
  if (bookingNextStepExploreFriendlyUnit(unit)) return false;
  return false;
}

function bookingNextStepViolates(text: string, level: InquiryClaimPermissionLevel): boolean {
  const r = RANK[level];
  if (r >= 3) return false;
  const units = splitDraftIntoAuditUnits(text);
  for (const unit of units) {
    if (bookingNextStepConcreteUnit(unit)) return true;
    if (bookingNextStepSettledHabitUnit(unit)) return true;
    if (r <= 1 && bookingNextStepSoftCtaUnit(unit)) return true;
    if (r <= 1 && bookingNextStepProactiveLiveSteerUnit(unit)) return true;
  }
  return false;
}

function destinationHypeFullText(text: string): boolean {
  return (
    /\bphotograph\b/i.test(text) &&
    /\bdestination\b/i.test(text) &&
    /\b(?:we|I)\b/i.test(text) &&
    /\b(absolutely|certainly|definitely|always|love to)\b/i.test(text)
  );
}

function offeringHardInUnit(unit: string): boolean {
  if (skipUnitForClaimScan(unit)) return false;
  if (unitMatchesAny(unit, HYPE_TRIGGERS)) return true;
  if (unitMatchesAny(unit, ABSOLUTE_TRIGGERS)) return true;
  if (unitMatchesAny(unit, EXACTLY_KIND_LOVE)) return true;
  if (unitMatchesAny(unit, CAPABILITY_HARD_EXTRA)) return true;
  if (unitMatchesAny(unit, CAPABILITY_SOFT)) return true;
  return false;
}

function offeringExploreViolation(text: string): boolean {
  const units = splitDraftIntoAuditUnits(text);
  for (const unit of units) {
    if (offeringHardInUnit(unit)) return true;
    if (comboSettledTruthUnit(unit)) return true;
  }
  if (!skipUnitForClaimScan(text) && destinationHypeFullText(text)) return true;
  return false;
}

function offeringSoftConfirmViolation(text: string): boolean {
  const units = splitDraftIntoAuditUnits(text);
  for (const unit of units) {
    if (skipUnitForClaimScan(unit)) continue;
    if (unitMatchesAny(unit, HYPE_TRIGGERS)) return true;
    if (unitMatchesAny(unit, ABSOLUTE_TRIGGERS)) return true;
    if (unitMatchesAny(unit, EXACTLY_KIND_LOVE)) return true;
    if (unitMatchesAny(unit, CAPABILITY_HARD_EXTRA)) return true;
    if (comboSettledTruthUnit(unit)) return true;
  }
  if (destinationHypeFullText(text)) return true;
  return false;
}

function destinationViolation(text: string): boolean {
  const units = splitDraftIntoAuditUnits(text);
  for (const unit of units) {
    if (skipUnitForClaimScan(unit)) continue;
    if (unitMatchesAny(unit, LOGISTICS_SETTLED)) return true;
  }
  return destinationHypeFullText(text);
}

function proposalViolation(text: string): boolean {
  const units = splitDraftIntoAuditUnits(text);
  for (const unit of units) {
    if (skipUnitForClaimScan(unit)) continue;
    if (unitMatchesAny(unit, PROCESS_SETTLED)) return true;
  }
  return false;
}

function deliverableViolation(text: string): boolean {
  const units = splitDraftIntoAuditUnits(text);
  for (const unit of units) {
    if (skipUnitForClaimScan(unit)) continue;
    if (unitMatchesAny(unit, DELIVERABLE_SETTLED)) return true;
  }
  return false;
}

export function auditInquiryClaimPermissionViolations(
  emailDraft: string,
  permissions: InquiryClaimPermissionMap | null,
): string[] {
  if (!permissions) return [];
  const text = emailDraft.trim();
  if (!text) return [];
  const v: string[] = [];

  const av = RANK[permissions.availability];
  if (av < 3) {
    const hardAvail = detectConcreteAvailabilityAssertionText(text);
    const deferSoftAvail =
      av === 0 &&
      !hardAvail &&
      /\bwe(?:'re| are)\s+available\s+(?:for|on)\b[^.!?]{0,50}\b(?:that|your|the|our)\s+date\b/i.test(text);
    if (hardAvail || deferSoftAvail) {
      v.push(
        `${INQUIRY_CLAIM_PERMISSION_VIOLATION_PREFIX}availability: draft exceeds permission ${permissions.availability} for calendar/date availability.`,
      );
    }
  }

  const destMin = Math.min(RANK[permissions.destination_fit], RANK[permissions.destination_logistics]);
  if (destMin < 3 && destinationViolation(text)) {
    v.push(
      `${INQUIRY_CLAIM_PERMISSION_VIOLATION_PREFIX}destination: draft asserts destination or logistics capability as settled practice (fit=${permissions.destination_fit}, logistics=${permissions.destination_logistics}).`,
    );
  }

  const off = RANK[permissions.offering_fit];
  if (off < 3) {
    if (off <= 1) {
      if (offeringExploreViolation(text)) {
        v.push(
          `${INQUIRY_CLAIM_PERMISSION_VIOLATION_PREFIX}offering_fit: draft exceeds explore permission for offering/fit/specialty (permission=${permissions.offering_fit}).`,
        );
      }
    } else if (offeringSoftConfirmViolation(text)) {
      v.push(
        `${INQUIRY_CLAIM_PERMISSION_VIOLATION_PREFIX}offering_fit: draft uses confirm-tier / brochure certainty while permission is soft_confirm.`,
      );
    }
  }

  const proc = RANK[permissions.proposal_process];
  if (proc < 3 && proposalViolation(text)) {
    v.push(
      `${INQUIRY_CLAIM_PERMISSION_VIOLATION_PREFIX}proposal_process: draft asserts proposal/process structure as settled but permission is ${permissions.proposal_process}.`,
    );
  }

  const del = RANK[permissions.deliverable_inclusions];
  if (del < 3 && deliverableViolation(text)) {
    v.push(
      `${INQUIRY_CLAIM_PERMISSION_VIOLATION_PREFIX}deliverable_inclusions: draft asserts inclusions as settled but permission is ${permissions.deliverable_inclusions}.`,
    );
  }

  const book = RANK[permissions.booking_next_step];
  if (book < 3 && bookingNextStepViolates(text, permissions.booking_next_step)) {
    v.push(
      `${INQUIRY_CLAIM_PERMISSION_VIOLATION_PREFIX}booking_next_step: draft realizes a concrete operational next-step / booking CTA but permission is ${permissions.booking_next_step}.`,
    );
  }

  return [...new Set(v)];
}
