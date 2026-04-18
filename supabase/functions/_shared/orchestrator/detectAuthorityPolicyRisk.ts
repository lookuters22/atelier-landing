/**
 * Authority policy for orchestrator proposals — deterministic, upstream of persona.
 *
 * **Escalation scope (V3 booking-progress fix):** Commercial and ambiguous-approval AP1 triggers
 * are evaluated on the **current inbound (`rawMessage`) only**. `threadContextSnippet` is accepted for
 * API compatibility but does **not** contribute to those hits — prior messages must not smear
 * commitment/binding patterns into a benign current turn. Snippet/thread text still feeds persona
 * and drafting via `DecisionContext`, not this module.
 *
 * **Phase 2 — commercial terms (commitment vs coordination):**
 * - **Commitment-level** commercial language (discounts, waivers, contract/payment-term changes,
 *   negotiation, etc.) may **not** be treated as safe routine drafts on the strength of a
 *   **planner** role alone. Only `client_primary` and `payer` pass the commitment allow-list.
 * - **Planner coordination** narrow path: see {@link matchesPlannerCommercialCoordinationTerms}.
 *
 * **Phase 3 — binding approval / authorization:** see {@link matchesBindingApprovalAuthorizationShape}.
 * Only `isApprovalContact`, `client_primary`, and `payer` may satisfy binding-approval-shaped messages
 * without AP1 escalation; planners and other buckets are not automatic binding approvers.
 *
 * **Not** legal/financial endorsement; proposal-safety gating only.
 */
import type {
  DecisionAudienceSnapshot,
  InboundSenderAuthoritySnapshot,
  OrchestratorAuthorityPolicyClass,
} from "../../../../src/types/decisionContext.types.ts";
import { ORCHESTRATOR_AP1_ESCALATION_REASON_CODES } from "../../../../src/types/decisionContext.types.ts";
import {
  detectMultiActorAuthorityRefinement,
  type AuthorityMemoryRow,
} from "./detectMultiActorAuthorityRefinement.ts";

const MAX_COMBINED_CHARS = 8000;

/** When `audience` is omitted (legacy callers), multi-actor refinement uses empty participants — no structured signer loop-in. */
const DEFAULT_AUDIENCE_FOR_MULTI_ACTOR: DecisionAudienceSnapshot = {
  threadParticipants: [],
  agencyCcLock: null,
  broadcastRisk: "low",
  recipientCount: 0,
  visibilityClass: "client_visible",
  clientVisibleForPrivateCommercialRedaction: false,
  approvalContactPersonIds: [],
};

export const AUTHORITY_POLICY_BLOCKER = "authority_policy_risk" as const;

export type AuthorityPolicyDetection =
  | { hit: false }
  | {
      hit: true;
      primaryClass: OrchestratorAuthorityPolicyClass;
      escalation_reason_code: (typeof ORCHESTRATOR_AP1_ESCALATION_REASON_CODES)[OrchestratorAuthorityPolicyClass];
    };

/** Commitment-level commercial terms: client or payer only (Phase 2). */
const COMMERCIAL_TERMS_COMMITMENT_AUTHORITY = new Set<InboundSenderAuthoritySnapshot["bucket"]>([
  "client_primary",
  "payer",
]);

/**
 * Planner coordination path only: visibility / routing of billing artifacts without commitment-level
 * language — client, payer, or planner.
 */
const COMMERCIAL_TERMS_PLANNER_COORDINATION_AUTHORITY = new Set<InboundSenderAuthoritySnapshot["bucket"]>([
  "client_primary",
  "payer",
  "planner",
]);

/** Current turn only — used for AP1 commercial and ambiguous-approval escalation. */
function normalizeCurrentTurnOnly(rawMessage: string): string {
  const collapsed = rawMessage.trim().toLowerCase().replace(/\s+/g, " ");
  return collapsed.length > MAX_COMBINED_CHARS ? collapsed.slice(-MAX_COMBINED_CHARS) : collapsed;
}

/**
 * Payment/pricing/contract commitment language — distinct from banking rail/compliance (BC path).
 * Phase 2: this is the **commitment** tier; planners are not allow-listed for this shape alone.
 */
export function matchesCommitmentLevelCommercialTerms(text: string): boolean {
  if (
    /\b(?:bulk\s+)?discount\b/.test(text) ||
    /\b(?:price|pricing|fee|fees)\s+(?:change|cut|reduction|increase)\b/.test(text) ||
    /\b(?:lower|raise|reduce)\s+(?:the\s+)?(?:price|fee|rate|deposit|retainer)\b/.test(text) ||
    /\brefund\b/.test(text) ||
    /\b(?:waive|waiving)\s+(?:the\s+)?(?:fee|fees)\b/.test(text) ||
    /\bretainer\b/.test(text) && /\b(?:percent|percentage|%)\b/.test(text) ||
    /\bdeposit\b/.test(text) &&
      (/\b(?:invoice|balance|refund|apply|apply\s+to|which)\b/.test(text) || /\bvs\b/.test(text)) ||
    /\binvoice\b/.test(text) && /\b(?:which|apply|deposit|balance)\b/.test(text) ||
    /\bpackage\b/.test(text) && /\b(?:price|cost|change|edit|extra\s+photos)\b/.test(text) ||
    /\bcontract\b/.test(text) &&
      /\b(?:change|modify|amend|clause|term|terms|exception)\b/.test(text) ||
    /\bpayment\s+(?:plan|terms|schedule)\b/.test(text) ||
    /\b(?:negotiate|renegotiate)\b/.test(text) && /\b(?:price|fee|package|contract)\b/.test(text)
  ) {
    return true;
  }
  return false;
}

/**
 * **Maintenance — keep this narrow.** This matcher is **only** for invoice-routing / bookkeeping /
 * accounting-copy style logistics: who gets CC’d, thread visibility, forwarding a document for
 * records. It is **not** commercial-commitment authority (pricing, contract terms, payment
 * commitments). Do **not** grow this into a backdoor for broader commercial authority: if an
 * addition smells like a commitment-level ask, put it in {@link matchesCommitmentLevelCommercialTerms}
 * or leave it escalated via AP1.
 *
 * Checked only when {@link matchesCommitmentLevelCommercialTerms} is false; must stay disjoint from
 * commitment patterns.
 */
export function matchesPlannerCommercialCoordinationTerms(text: string): boolean {
  if (matchesCommitmentLevelCommercialTerms(text)) return false;
  if (
    /\b(?:discount|refund|renegotiate|re-negotiate|negotiate)\b/.test(text) ||
    /\b(?:waive|waiving)\b/.test(text) ||
    /\b(?:lower|raise|reduce)\s+(?:the\s+)?(?:price|fee|rate)\b/.test(text)
  ) {
    return false;
  }
  if (
    /\b(?:please\s+)?(?:cc|bcc)\b.*\b(?:accounting|bookkeeper|billing\s+contact|accounts\s+payable)\b/.test(
      text,
    )
  ) {
    return true;
  }
  if (/\bforward(?:ing)?\b.*\b(?:invoice|receipt)\b.*\b(?:to|for)\b/.test(text)) {
    return true;
  }
  if (
    /\badd\b.*\b(?:accounting|bookkeeper)\b.*\b(?:to\s+)?(?:this\s+)?(?:thread|email|chain)\b/.test(text)
  ) {
    return true;
  }
  return false;
}

export function detectCommercialTermsAuthorityRisk(
  rawMessage: string,
  threadContextSnippet: string | undefined,
  authority: InboundSenderAuthoritySnapshot,
): AuthorityPolicyDetection {
  void threadContextSnippet;
  const text = normalizeCurrentTurnOnly(rawMessage);
  const commitment = matchesCommitmentLevelCommercialTerms(text);
  const coordination = matchesPlannerCommercialCoordinationTerms(text);

  if (!commitment && !coordination) {
    return { hit: false };
  }

  if (commitment) {
    if (COMMERCIAL_TERMS_COMMITMENT_AUTHORITY.has(authority.bucket)) {
      return { hit: false };
    }
    return {
      hit: true,
      primaryClass: "commercial_terms_authority_insufficient",
      escalation_reason_code: ORCHESTRATOR_AP1_ESCALATION_REASON_CODES.commercial_terms_authority_insufficient,
    };
  }

  if (COMMERCIAL_TERMS_PLANNER_COORDINATION_AUTHORITY.has(authority.bucket)) {
    return { hit: false };
  }
  return {
    hit: true,
    primaryClass: "commercial_terms_authority_insufficient",
    escalation_reason_code: ORCHESTRATOR_AP1_ESCALATION_REASON_CODES.commercial_terms_authority_insufficient,
  };
}

/**
 * **Maintenance — do not let this regex drift wide.**
 * `BINDING_APPROVAL_COMMERCIAL_ANCHOR` ties “approve / authorize / proceed” language to **binding or
 * commercial authorization** (money, contract, formal booking terms). It is **not** for general
 * creative or project coordination (timelines, shot lists, seating, mood boards, etc.). Do **not**
 * keep adding words until the matcher catches everything — operational/creative-only cues belong
 * elsewhere, not here.
 */
const BINDING_APPROVAL_COMMERCIAL_ANCHOR =
  /\b(?:contract|payment|payments|invoice|invoices|fee|fees|deposit|deposits|retainer|package|balance|quote|proposal|addendum|terms|booking|order|schedule\s+change|payment\s+plan)\b/;

/**
 * **Phase 3 — binding approval / authorization language only.** Conservative: must look like granting
 * or requesting authority over money, contract, or formal booking terms — not casual positivity
 * (“sounds good”) or bare “approve the timeline” without a commercial anchor.
 */
export function matchesBindingApprovalAuthorizationShape(text: string): boolean {
  // Same anchor discipline as other branches — no bare “I authorize” without commercial/binding object.
  if (/\b(?:i|we)\s+(?:hereby\s+)?(?:authorize|authorise)\b/.test(text)) {
    if (
      BINDING_APPROVAL_COMMERCIAL_ANCHOR.test(text) ||
      /\b(?:this|the)\s+(?:payment|invoice|contract|change|addendum)\b/.test(text)
    ) {
      return true;
    }
  }
  if (
    /\b(?:i|we)\s+(?:have\s+)?(?:authorized|authorised|approved)\b/.test(text) &&
    (BINDING_APPROVAL_COMMERCIAL_ANCHOR.test(text) ||
      /\b(?:this|the)\s+(?:payment|invoice|contract|change|addendum)\b/.test(text))
  ) {
    return true;
  }
  if (
    /\b(?:you\s+)?(?:may|can)\s+proceed\s+with\b/.test(text) &&
    BINDING_APPROVAL_COMMERCIAL_ANCHOR.test(text)
  ) {
    return true;
  }
  if (/\bgo\s+ahead\s+with\b/.test(text) && BINDING_APPROVAL_COMMERCIAL_ANCHOR.test(text)) {
    return true;
  }
  if (/\byou\s+can\s+proceed\b/.test(text) && BINDING_APPROVAL_COMMERCIAL_ANCHOR.test(text)) {
    return true;
  }
  if (
    /\b(?:sign|signed)\s*[- ]?\s*off\b/.test(text) &&
    (BINDING_APPROVAL_COMMERCIAL_ANCHOR.test(text) || /\b(?:on\s+behalf|behalf)\b/.test(text))
  ) {
    return true;
  }
  // On-behalf: role words (couple/client/bride/groom) alone are not binding — require authorization
  // verb + same commercial anchor discipline as other branches.
  if (/\bon\s+behalf\s+of\b/.test(text)) {
    const onBehalfBindingVerb =
      /\b(?:approve|approved|authorized|authorised|authorize|authorise)\b/.test(text) ||
      /\b(?:may|can)\s+proceed\s+with\b/.test(text) ||
      /\bproceed\s+with\b/.test(text) ||
      /\bgo\s+ahead\s+with\b/.test(text) ||
      /\bplease\s+proceed\b/.test(text);
    if (
      onBehalfBindingVerb &&
      (BINDING_APPROVAL_COMMERCIAL_ANCHOR.test(text) ||
        /\b(?:this|the)\s+(?:payment|invoice|contract|change|addendum)\b/.test(text))
    ) {
      return true;
    }
  }
  if (
    /\bplease\s+(?:approve|authorize|authorise)\b/.test(text) &&
    BINDING_APPROVAL_COMMERCIAL_ANCHOR.test(text)
  ) {
    return true;
  }
  if (
    /\bconfirm\b/.test(text) &&
    /\b(?:on\s+behalf\s+of|behalf\s+of\s+the\s+couple|for\s+the\s+couple)\b/.test(text)
  ) {
    return true;
  }
  if (
    /\b(?:final\s+)?(?:go\s*[- ]?ahead|binding)\b/.test(text) &&
    BINDING_APPROVAL_COMMERCIAL_ANCHOR.test(text)
  ) {
    return true;
  }
  return false;
}

/**
 * Narrow inquiry / booking-progress informational cues on the **current message only**.
 * When true, the turn is still not safe to treat as commitment if
 * {@link matchesCommitmentLevelCommercialTerms} or {@link matchesBindingApprovalAuthorizationShape}
 * already matched the same text.
 */
export function matchesInquiryBookingProgressInformationalTurn(rawMessage: string): boolean {
  const t = normalizeCurrentTurnOnly(rawMessage);
  if (t.length === 0) return false;
  if (matchesCommitmentLevelCommercialTerms(t)) return false;
  if (matchesBindingApprovalAuthorizationShape(t)) return false;

  const nextStepsBook =
    /\bnext\s+steps\b/.test(t) &&
    /\b(?:book|booking|reserve|retainer|contract|officially)\b/.test(t);
  const howToBook =
    /\bhow\s+(?:do\s+we|can\s+we|to)\s+(?:book|reserve|secure)\b/.test(t) ||
    /\bofficially\s+book\b/.test(t);
  const inclusionAsk =
    /\b(?:included|inclusion|add[-\s]?on|extra|additional)\b/.test(t) ||
    /\bis\s+.{0,40}\s+included\b/.test(t) ||
    /\bincluded\s+or\s+(?:extra|additional|an?\s+add[-\s]?on)\b/.test(t);
  const feeInformational =
    /\b(?:destination|travel|local)\s+fee\b/.test(t) ||
    (/\bfee\b/.test(t) &&
      /\b(?:apply|applies|for\s+(?:the\s+)?(?:venue|location|wedding)|is\s+there|do\s+you\s+charge)\b/.test(
        t,
      ));
  const scheduleCall =
    /\b(?:schedule|book)\s+(?:a\s+)?(?:call|chat|meeting|consultation)\b/.test(t) ||
    /\b(?:zoom|facetime|google\s+meet|teams)\b/.test(t) ||
    /\b(?:jump\s+on|hop\s+on)\s+(?:a\s+)?(?:quick\s+)?call\b/.test(t) ||
    /\bcall\s+(?:on\s+)?(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i.test(
      rawMessage,
    ) ||
    /\b(?:brief|quick)\s+call\b/.test(t);

  return Boolean(nextStepsBook || howToBook || inclusionAsk || feeInformational || scheduleCall);
}

/**
 * Escalate when **binding** approval/authorization language appears from someone who is not an
 * approval contact and not `client_primary` or `payer`. Planners, vendors, assistants, and unknown
 * senders do not automatically pass (Phase 3).
 */
export function detectAmbiguousApprovalAuthorityRisk(
  rawMessage: string,
  threadContextSnippet: string | undefined,
  authority: InboundSenderAuthoritySnapshot,
): AuthorityPolicyDetection {
  void threadContextSnippet;
  const text = normalizeCurrentTurnOnly(rawMessage);
  if (!matchesBindingApprovalAuthorizationShape(text)) {
    return { hit: false };
  }
  if (authority.isApprovalContact) {
    return { hit: false };
  }
  if (authority.bucket === "client_primary" || authority.bucket === "payer") {
    return { hit: false };
  }
  return {
    hit: true,
    primaryClass: "ambiguous_approval_authority",
    escalation_reason_code: ORCHESTRATOR_AP1_ESCALATION_REASON_CODES.ambiguous_approval_authority,
  };
}

export function detectAuthorityPolicyRisk(params: {
  rawMessage: string;
  threadContextSnippet?: string;
  authority: InboundSenderAuthoritySnapshot;
  /** Multi-actor slice — memory rows (summary/full_content) for verify-note authority narrowing. */
  selectedMemorySummaries?: readonly AuthorityMemoryRow[];
  /** Structured audience for multi-actor signer loop-in; omit → empty participants for that slice only. */
  audience?: DecisionAudienceSnapshot;
}): AuthorityPolicyDetection {
  const { rawMessage, threadContextSnippet, authority } = params;
  const commercial = detectCommercialTermsAuthorityRisk(rawMessage, threadContextSnippet, authority);
  if (commercial.hit) return commercial;
  const ambiguous = detectAmbiguousApprovalAuthorityRisk(rawMessage, threadContextSnippet, authority);
  if (ambiguous.hit) return ambiguous;
  const multi = detectMultiActorAuthorityRefinement({
    rawMessage,
    authority,
    selectedMemories: params.selectedMemorySummaries ?? [],
    audience: params.audience ?? DEFAULT_AUDIENCE_FOR_MULTI_ACTOR,
  });
  if (multi.hit) {
    return {
      hit: true,
      primaryClass: multi.primaryClass,
      escalation_reason_code: multi.escalation_reason_code,
    };
  }
  return { hit: false };
}
