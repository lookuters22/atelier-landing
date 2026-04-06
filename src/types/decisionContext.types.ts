import type { AgentContext } from "./agent.types.ts";
import type { Database } from "./database.types.ts";

/**
 * ## Decision context contract (execute_v3 Step 5F)
 *
 * **`DecisionContext`** is the single typed object for policy-aware reasoning. Workers must
 * not invent parallel shapes (ad hoc playbook, audience, or memory subsets).
 *
 * **Construction:** only `buildDecisionContext` in
 * `supabase/functions/_shared/context/buildDecisionContext.ts` assembles this interface.
 *
 * **Tenant safety (Step 5G):** pass only a **resolved** `photographer_id` (trusted JWT / owned row).
 * Every sub-query filters by that tenant; the returned `DecisionContext.photographerId` is pinned
 * to the validated id so rows cannot mix photographers (DATABASE_SCHEMA §3 Multi-Tenant Rule).
 */

/**
 * Validates non-empty tenant identity before `buildDecisionContext` runs any service-role query.
 * @throws if the value is missing or whitespace-only
 */
export function assertResolvedTenantPhotographerId(photographerId: string): string {
  if (typeof photographerId !== "string" || photographerId.trim().length === 0) {
    throw new Error(
      "buildDecisionContext: resolved tenant identity (photographerId) is required and cannot be empty",
    );
  }
  return photographerId.trim();
}

/**
 * Optional Step 5C retrieval — load full `memories` rows only for IDs chosen after header scan.
 */
export type BuildDecisionContextOptions = {
  /** Memory UUIDs to hydrate with `full_content` (tenant must own all rows). */
  selectedMemoryIds?: string[];
};

/**
 * Policy-aware decision context for orchestrator / verifier (execute_v3 Phase 5).
 * Audience facts are backend-resolved; callers must not infer visibility from raw message text alone
 * (ARCHITECTURE §8, §9 Memory Model — retrieval contract).
 */

export type BroadcastRiskLevel = "low" | "medium" | "high" | "unknown";

/** `thread_participants` rows scoped to the current thread (deterministic visibility). */
export type ThreadParticipantAudienceRow = {
  id: string;
  person_id: string;
  thread_id: string;
  visibility_role: string;
  is_cc: boolean;
  is_recipient: boolean;
  is_sender: boolean;
};

/**
 * Backend-resolved audience slice for reasoning and verification.
 * `broadcastRisk` stays `unknown` until routing metadata is wired (later Phase 5 steps).
 */
export type DecisionAudienceSnapshot = {
  threadParticipants: ThreadParticipantAudienceRow[];
  /** From `weddings.agency_cc_lock` when a wedding is in scope; null if not applicable. */
  agencyCcLock: boolean | null;
  broadcastRisk: BroadcastRiskLevel;
  recipientCount: number;
  /**
   * execute_v3 Phase 6.5 Step 6.5G — **approval contact** authority (one slice).
   * `people.id` values for rows on the effective wedding with `wedding_people.is_approval_contact = true`.
   * Empty when no wedding in scope or no flags set. Compare to `thread_participants.person_id` + `is_sender` for routing.
   */
  approvalContactPersonIds: string[];
};

/**
 * Active `playbook_rules` rows attached to decision context (execute_v3 Step 5B).
 * Full relevance ranking may narrow this list in Step 5C.
 */
export type PlaybookRuleContextRow = Pick<
  Database["public"]["Tables"]["playbook_rules"]["Row"],
  | "id"
  | "action_key"
  | "topic"
  | "decision_mode"
  | "scope"
  | "channel"
  | "instruction"
  | "source_type"
  | "confidence_label"
  | "is_active"
>;

/**
 * Full contract: thin session snapshot (`AgentContext`) plus audience, routing candidates,
 * and tenant playbook rows. Optional `selectedMemoryIds` in builder options hydrates
 * `selectedMemories`; `globalKnowledge` full retrieval remains a later slice.
 */
/**
 * Phase 2 Slice A4 — bounded thread draft read-side parity (pending approval only; ids capped for QA logs).
 * Tenant-scoped via `buildDecisionContext` + `drafts.photographer_id` / `threads` pre-check.
 */
export type ThreadDraftsSummary = {
  pendingApprovalCount: number;
  /** Newest-first draft ids; capped for observability (not full enumeration). */
  pendingApprovalDraftIds: string[];
};

export interface DecisionContext extends AgentContext {
  readonly contextVersion: 1;
  audience: DecisionAudienceSnapshot;
  /** Distinct `wedding_id` from `thread_weddings` for this thread (multi-wedding threads). */
  candidateWeddingIds: string[];
  /** Tenant-wide active playbook rules (deterministic query; not wedding-scoped). */
  playbookRules: PlaybookRuleContextRow[];
  /**
   * A4 — pending-approval drafts on the current thread (null when no thread or unknown thread).
   * Does not load draft bodies.
   */
  threadDraftsSummary: ThreadDraftsSummary | null;
}

// ── Phase 2 Slice A1 — client orchestrator proposal objects (no DB / no sends) ────────────────

/** V3 action families used for structured proposals (`POST_V3_CLEANUP_PHASE2_ROADMAP` A1). */
export const ORCHESTRATOR_CLIENT_ACTION_FAMILIES = [
  "send_message",
  "schedule_call",
  "move_call",
  "share_document",
  "update_crm",
  "operator_notification_routing",
] as const;

export type OrchestratorClientActionFamily =
  (typeof ORCHESTRATOR_CLIENT_ACTION_FAMILIES)[number];

/**
 * Proposal-level outcome class; should align with `toolVerifier` + orchestrator `mapOutcome`.
 * **block** = same class as verifier failure (e.g. `broadcast_risk_high_blocks_auto_execution` when mode is `auto`).
 */
export type OrchestratorProposalLikelyOutcome = "auto" | "draft" | "ask" | "block";

/**
 * One proposed client-facing action — enough structure for later draft/escalation slices.
 * Not executed here; verifier / approval gates apply downstream.
 */
export type OrchestratorProposalCandidate = {
  id: string;
  action_family: OrchestratorClientActionFamily;
  /** Stable key (may mirror `playbook_rules.action_key` or a heuristic label). */
  action_key: string;
  rationale: string;
  verifier_gating_required: boolean;
  likely_outcome: OrchestratorProposalLikelyOutcome;
  blockers_or_missing_facts: string[];
  playbook_rule_ids?: string[];
};

/** Phase 2 Slice A2 — orchestrator draft insert result (QA/replay; no sends). */
export type OrchestratorDraftAttemptResult = {
  draftCreated: boolean;
  draftId: string | null;
  chosenCandidate: OrchestratorProposalCandidate | null;
  /** When `draftCreated` is false, a stable machine-readable reason. */
  skipReason: string | null;
};

/** Phase 2 Slice A3 — `toolEscalate` validation artifact for block/ask outcomes (QA/replay; no DB insert). */
export type OrchestratorEscalationArtifactResult = {
  escalationArtifactCreated: boolean;
  toolEscalateSuccess: boolean;
  escalationFacts: Record<string, unknown> | null;
  toolEscalateError: string | null;
  skipReason: string | null;
  chosenCandidateForEscalation: OrchestratorProposalCandidate | null;
};
