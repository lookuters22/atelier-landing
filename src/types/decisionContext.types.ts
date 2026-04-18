import type { AgentContext } from "./agent.types.ts";
import type { Database } from "./database.types.ts";
import type {
  InboundSuppressionClassification,
  InboundSuppressionReasonCode,
  InboundSuppressionVerdict,
} from "../lib/inboundSuppressionClassifier.ts";

export type {
  CrmSnapshot,
  PackageInclusionItem,
} from "./crmSnapshot.types.ts";
export {
  emptyCrmSnapshot,
  isPackageInclusionItem,
  parsePackageInclusions,
} from "./crmSnapshot.types.ts";

/**
 * ## Decision context contract (execute_v3 Step 5F)
 *
 * **`DecisionContext`** is the single typed object for policy-aware reasoning. Workers must
 * not invent parallel shapes (ad hoc playbook, audience, or memory subsets).
 * Baseline playbook is `rawPlaybookRules`; `authorizedCaseExceptions` are merged deterministically
 * into `playbookRules` (effective policy) before verifier/orchestrator/writer policy excerpts.
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
 * Policy-aware decision context for orchestrator / verifier (execute_v3 Phase 5).
 * Audience facts are backend-resolved; callers must not infer visibility from raw message text alone
 * (ARCHITECTURE §8, §9 Memory Model — retrieval contract).
 */

export type BroadcastRiskLevel = "low" | "medium" | "high" | "unknown";

/**
 * Outgoing-draft audience bucket (V3 Phase 1 RBAC).
 * `mixed_audience` includes planner + couple/client on the same thread (To/CC).
 */
export type AudienceVisibilityClass =
  | "planner_only"
  | "client_visible"
  | "vendor_only"
  | "internal_only"
  | "mixed_audience";

/**
 * Channel-ingress sender identity (email/web) for deterministic routing hints — not CRM resolution.
 * Populated when the inbound pipeline passes verified sender metadata alongside `rawMessage`.
 */
export type InboundSenderIdentity = {
  /** Normalized bare email when parseable from ingress; otherwise null. */
  email: string | null;
  displayName: string | null;
  /** Registrable host from `email` when parseable; otherwise null. */
  domain: string | null;
};

/**
 * Phase-1 inbound sender authority for proposal gating (not a full permissions model).
 * Derived from `thread_participants.is_sender` + `wedding_people` + approval-contact ids; when
 * `is_sender` is missing, `buildDecisionContext` may resolve a unique wedding person via scoped
 * `contact_points` email match (`wedding_contact_email`).
 */
export type InboundSenderAuthorityBucket =
  | "client_primary"
  | "planner"
  | "payer"
  | "vendor"
  | "assistant_or_team"
  | "unknown";

export type InboundSenderAuthoritySource =
  | "thread_sender"
  /** Unique `contact_points` email match on the effective wedding when no `is_sender` row (structured fallback). */
  | "wedding_contact_email"
  | "unresolved";

export type InboundSenderAuthoritySnapshot = {
  bucket: InboundSenderAuthorityBucket;
  personId: string | null;
  /** True when `person_id` is in `wedding_people.is_approval_contact` for the effective wedding. */
  isApprovalContact: boolean;
  source: InboundSenderAuthoritySource;
};

/**
 * Optional Step 5C retrieval — load full `memories` rows only for IDs chosen after header scan.
 */
export type BuildDecisionContextOptions = {
  /**
   * Memory UUIDs to hydrate with `full_content` (tenant must own all rows).
   * When set and non-empty, overrides deterministic promotion; capped at 5. When omitted/empty,
   * `buildDecisionContext` promotes ids via `selectRelevantMemoryIdsDeterministic` (headers + turn text).
   * Hydrated memories support orchestrator/verifier — they do not override `playbook_rules`.
   */
  selectedMemoryIds?: string[];
  /**
   * QA/replay only — force audience visibility classification after DB resolution.
   * Production callers must omit; used for Stress Test 7–shaped unit/replay proofs.
   */
  qaVisibilityClassOverride?: AudienceVisibilityClass;
  /**
   * From verified email/web ingress (e.g. triage `sender`); used for IE2 B2B domain signals without
   * parsing `From …@` out of message body text.
   */
  inboundSenderEmail?: string | null;
  inboundSenderDisplayName?: string | null;
  /**
   * QA/replay only — replace derived `inboundSenderAuthority` after audience load.
   * Production callers must omit.
   */
  qaInboundSenderAuthorityOverride?: InboundSenderAuthoritySnapshot;
  /**
   * QA/replay only — run bounded `knowledge_base` retrieval even when the gate would skip.
   * Production callers must omit.
   */
  qaBypassGlobalKnowledgeGate?: boolean;
};

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
   * Resolved from `thread_participants` (To/CC) + `wedding_people.role_label` / `is_payer`.
   * When unknown or conservative-safe, may be `client_visible`.
   */
  visibilityClass: AudienceVisibilityClass;
  /**
   * When true, planner-private commercial facts (commission, agency fee, etc.) are stripped from
   * context before orchestrator/persona and blocked in draft prose by `auditPlannerPrivateLeakage`.
   * False only for `planner_only` / `internal_only` (studio/planner-internal threads).
   */
  clientVisibleForPrivateCommercialRedaction: boolean;
  /**
   * execute_v3 Phase 6.5 Step 6.5G — **approval contact** authority (one slice).
   * `people.id` values for rows on the effective wedding with `wedding_people.is_approval_contact = true`.
   * Empty when no wedding in scope or no flags set. Compare to `thread_participants.person_id` + `is_sender` for routing.
   */
  approvalContactPersonIds: string[];
  /**
   * Inbound suppression verdict for the **latest inbound message** on this thread.
   *
   * Populated by `buildDecisionContext` via the shared `classifyInboundSuppression`
   * helper when an inbound message is in scope. When `suppressed === true`, the
   * orchestrator must not produce a routine client send_message draft (promo /
   * system / non-client mail such as OTA campaigns, newsletters, do-not-reply
   * notifications). `null` / omitted when no inbound message is available
   * (e.g. thread has no inbound rows yet, or this call has no thread in scope).
   *
   * Optional for backward compatibility with pre-suppression test harnesses and
   * QA fixtures; production `buildDecisionContext` always sets it (possibly to
   * `null`).
   */
  inboundSuppression?: InboundSuppressionClassification | null;
};

export type { InboundSuppressionClassification, InboundSuppressionReasonCode, InboundSuppressionVerdict };

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
 * Structured fields inside `authorized_case_exceptions.override_payload` (JSONB).
 * Application validates — keep additive and explicit.
 */
export type AuthorizedCaseExceptionOverridePayload = {
  decision_mode?: Database["public"]["Enums"]["decision_mode"];
  /** When set, replaces the targeted playbook instruction (empty string allowed). */
  instruction_override?: string | null;
  /** Appended after the baseline instruction when `instruction_override` is absent. */
  instruction_append?: string | null;
};

/**
 * Normalized authorized case exception row (see migration `authorized_case_exceptions`).
 * Internal audit / orchestrator only — not forwarded raw to persona.
 */
export type AuthorizedCaseExceptionRow = Pick<
  Database["public"]["Tables"]["authorized_case_exceptions"]["Row"],
  | "id"
  | "photographer_id"
  | "wedding_id"
  | "thread_id"
  | "status"
  | "overrides_action_key"
  | "target_playbook_rule_id"
  | "override_payload"
  | "approved_by"
  | "approved_via_escalation_id"
  | "effective_from"
  | "effective_until"
  | "notes"
>;

/**
 * Baseline playbook row plus deterministic merge audit. Built by {@link deriveEffectivePlaybook}
 * in TS before verifier / orchestrator / persona policy excerpts.
 */
export type EffectivePlaybookRule = PlaybookRuleContextRow & {
  effectiveDecisionSource: "playbook" | "authorized_exception";
  appliedAuthorizedExceptionId: string | null;
};

/**
 * Full contract: thin session snapshot (`AgentContext`) plus audience, routing candidates,
 * and tenant playbook rows. Optional `selectedMemoryIds` in builder options hydrates
 * `selectedMemories`; `globalKnowledge` is populated by bounded `knowledge_base` retrieval in
 * `buildDecisionContext` (tenant-scoped; does not override `playbook_rules`).
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

/**
 * Audit-only retrieval facts (execute_v3 Step 5F). Orchestrator / QA / reports — **not** for persona.
 * `playbook_rules` remain authoritative over supporting memory / global knowledge.
 */
export type DecisionContextRetrievalTrace = {
  /** Memory ids chosen before hydrate (explicit override or deterministic promotion). */
  selectedMemoryIdsResolved: string[];
  selectedMemoriesLoadedCount: number;
  globalKnowledgeIdsLoaded: string[];
  globalKnowledgeLoadedCount: number;
  globalKnowledgeFetch: "queried" | "skipped_by_gate";
  /** Deterministic gate outcome / reason (see `decideGlobalKnowledgeBaseQuery`). */
  globalKnowledgeGateDetail: string;
};

/**
 * V3 orchestrator context injection (bounded). The orchestrator may read `selectedMemories`,
 * `globalKnowledge`, and `retrievalTrace`; the persona/writer must not receive raw heavy layers.
 * Synthesized facts land in proposal rationale and this structured payload for QA/replay.
 *
 * Truth hierarchy: manual/pause/locks → audience safety → `playbook_rules` → selected case memory
 * (supporting) → global studio knowledge (supporting) → live thread. Ordinary case memory does **not**
 * silently override `playbook_rules`; only `authorized_case_exceptions` may narrow policy at case scope.
 */
export type OrchestratorContextInjection = {
  /**
   * Orchestrator-synthesized, non-authoritative facts about what was loaded and how to treat it.
   * Does not include raw memory `full_content` or unbounded KB bodies.
   */
  approved_supporting_facts: string[];
  /**
   * Constraints on action choice / outbound grounding (surfaced via candidate rationale; not raw dumps).
   */
  action_constraints: string[];
  retrieval_observation: {
    selected_memory_ids: string[];
    global_knowledge_ids_loaded: string[];
    global_knowledge_fetch: DecisionContextRetrievalTrace["globalKnowledgeFetch"];
    global_knowledge_gate_detail: string;
    /** One compact line for logs / QA (bounded; not prompt stuffing). */
    trace_line: string;
  };
  /** Bounded digest lines for orchestrator reasoning / replay (type + title + summary excerpt). */
  memory_digest_lines: string[];
  /** Bounded digest lines for orchestrator reasoning / replay. */
  global_knowledge_digest_lines: string[];
};

export interface DecisionContext extends AgentContext {
  readonly contextVersion: 1;
  audience: DecisionAudienceSnapshot;
  /** Distinct `wedding_id` from `thread_weddings` for this thread (multi-wedding threads). */
  candidateWeddingIds: string[];
  /**
   * Baseline tenant `playbook_rules` rows from DB (before case exceptions). For audit and diffs.
   */
  rawPlaybookRules: PlaybookRuleContextRow[];
  /**
   * Active, in-window authorized exceptions for this wedding/thread scope (internal — not raw persona input).
   */
  authorizedCaseExceptions: AuthorizedCaseExceptionRow[];
  /**
   * Effective runtime policy: deterministic merge of `rawPlaybookRules` with `authorizedCaseExceptions`.
   * Verifier, orchestrator, and writer playbook excerpts must use this field.
   */
  playbookRules: EffectivePlaybookRule[];
  /**
   * A4 — pending-approval drafts on the current thread (null when no thread or unknown thread).
   * Does not load draft bodies.
   */
  threadDraftsSummary: ThreadDraftsSummary | null;
  /**
   * Resolved from ingress options in `buildDecisionContext`; null when not supplied or unparseable.
   */
  inboundSenderIdentity: InboundSenderIdentity | null;
  /**
   * Phase-1 authority snapshot for deterministic orchestrator proposal policy (commercial/approval asks).
   */
  inboundSenderAuthority: InboundSenderAuthoritySnapshot;
  /**
   * What was loaded for this decision (ids + counts + global KB gate). Persona inputs unchanged.
   */
  retrievalTrace: DecisionContextRetrievalTrace;
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
 * Phase 4.1 — deterministic non-commercial high-risk classes (orchestrator proposals only).
 * When set on a candidate, `escalation_reason_code` should match via `ORCHESTRATOR_NC_ESCALATION_REASON_CODES`.
 */
export type OrchestratorNonCommercialRiskClass =
  | "legal_compliance"
  | "artistic_dispute"
  | "pr_vendor_dispute";

/** Stable machine codes for `toolEscalate` / observability; paired with `risk_class`. */
export const ORCHESTRATOR_NC_ESCALATION_REASON_CODES = {
  legal_compliance: "NC_LEGAL_COMPLIANCE_V1",
  artistic_dispute: "NC_ARTISTIC_DISPUTE_V1",
  pr_vendor_dispute: "NC_PR_VENDOR_DISPUTE_V1",
} as const satisfies Record<
  OrchestratorNonCommercialRiskClass,
  `NC_${string}_V1`
>;

/** Banking / compliance exception routing (orchestrator proposals only). */
export type OrchestratorBankingComplianceClass =
  | "payment_rail_exception"
  | "compliance_document_request";

export const ORCHESTRATOR_BC_ESCALATION_REASON_CODES = {
  payment_rail_exception: "BC_PAYMENT_RAIL_V1",
  compliance_document_request: "BC_COMPLIANCE_DOCUMENT_V1",
} as const satisfies Record<
  OrchestratorBankingComplianceClass,
  `BC_${string}_V1`
>;

/** Visual / attachment verification — model cannot inspect binary assets; human review required. */
export type OrchestratorVisualAssetVerificationClass =
  | "layout_proof_review"
  | "pre_print_publication_verification";

export const ORCHESTRATOR_VAV_ESCALATION_REASON_CODES = {
  layout_proof_review: "VAV_LAYOUT_PROOF_V1",
  pre_print_publication_verification: "VAV_PRE_PRINT_PUBLICATION_V1",
} as const satisfies Record<
  OrchestratorVisualAssetVerificationClass,
  `VAV_${string}_V1`
>;

/** Identity / entity routing Phase 2 — beyond DB-linked `thread_weddings` ambiguity. */
export type OrchestratorIdentityEntityPhase2Class =
  | "b2b_corporate_sender"
  | "multi_booking_text_cues";

export const ORCHESTRATOR_IE2_ESCALATION_REASON_CODES = {
  b2b_corporate_sender: "IE2_B2B_CORPORATE_SENDER_V1",
  multi_booking_text_cues: "IE2_MULTI_BOOKING_TEXT_V1",
} as const satisfies Record<
  OrchestratorIdentityEntityPhase2Class,
  `IE2_${string}_V1`
>;

/** Phase-1 authority policy — insufficient role for commercial or approval-shaped asks. */
export type OrchestratorAuthorityPolicyClass =
  | "commercial_terms_authority_insufficient"
  | "ambiguous_approval_authority"
  /** Planner proposed a material schedule/timeline reduction — signer/couple confirmation required. */
  | "multi_actor_planner_timeline_reduction_signer"
  /** Payer requested paid scope/hours/fees — not binding without signer/approval contact (verify-note may tighten). */
  | "multi_actor_payer_scope_spend_signer";

export const ORCHESTRATOR_AP1_ESCALATION_REASON_CODES = {
  commercial_terms_authority_insufficient: "AP1_COMMERCIAL_TERMS_AUTHORITY_V1",
  ambiguous_approval_authority: "AP1_AMBIGUOUS_APPROVAL_AUTHORITY_V1",
  multi_actor_planner_timeline_reduction_signer: "AP1_MULTI_ACTOR_PLANNER_TIMELINE_SIGNER_V1",
  multi_actor_payer_scope_spend_signer: "AP1_MULTI_ACTOR_PAYER_SCOPE_SIGNER_V1",
} as const satisfies Record<
  OrchestratorAuthorityPolicyClass,
  `AP1_${string}_V1`
>;

/**
 * Irregular settlement / tax-avoidance-shaped inbound (orchestrator proposals only).
 * Distinct from banking rail failures (`OrchestratorBankingComplianceClass`).
 */
export type OrchestratorIrregularSettlementClass = "settlement_or_tax_avoidance_request";

export const ORCHESTRATOR_ISR_ESCALATION_REASON_CODES = {
  settlement_or_tax_avoidance_request: "ISR_SETTLEMENT_AVOIDANCE_V1",
} as const satisfies Record<
  OrchestratorIrregularSettlementClass,
  `ISR_${string}_V1`
>;

/**
 * High-magnitude commercial concession from client/payer (orchestrator proposals only).
 * Distinct from AP1 authority insufficiency — same authorized sender, concession too large for routine path.
 */
export type OrchestratorHighMagnitudeClientConcessionClass = "high_magnitude_client_concession_request";

export const ORCHESTRATOR_CCM_ESCALATION_REASON_CODES = {
  high_magnitude_client_concession_request: "CCM_LARGE_CONCESSION_V1",
} as const satisfies Record<
  OrchestratorHighMagnitudeClientConcessionClass,
  `CCM_${string}_V1`
>;

/**
 * Sensitive government-identity / personal-document handling (orchestrator proposals only).
 * Distinct from BC (payment rail), VAV (layout/proof review), ISR (settlement/tax avoidance), and IE2 (entity routing).
 */
export type OrchestratorSensitivePersonalDocumentClass = "sensitive_identity_document_handling_request";

export const ORCHESTRATOR_SPD_ESCALATION_REASON_CODES = {
  sensitive_identity_document_handling_request: "SPD_IDENTITY_DOCUMENT_V1",
} as const satisfies Record<
  OrchestratorSensitivePersonalDocumentClass,
  `SPD_${string}_V1`
>;

/** Contradiction / expectation repair / credibility-risk threads (orchestrator proposals only). */
export type OrchestratorStrategicTrustRepairClass = "contradiction_or_expectation_repair_request";

export const ORCHESTRATOR_STR_ESCALATION_REASON_CODES = {
  contradiction_or_expectation_repair_request: "STR_CONTRADICTION_REPAIR_V1",
} as const satisfies Record<
  OrchestratorStrategicTrustRepairClass,
  `STR_${string}_V1`
>;

/**
 * Narrow recurring compliance artifacts operators attach from studio-held files (not NDA/signature, not SPD).
 * Keys are stable proposal metadata; optional `compliance_asset_resolution` is filled in core after Storage lookup.
 */
export type OrchestratorComplianceAssetLibraryKey =
  | "public_liability_coi"
  | "venue_security_compliance_packet";

/**
 * Tenant Storage resolution for a compliance library key (safe to log/persist — no signed URLs).
 */
export type ComplianceAssetResolution = {
  library_key: OrchestratorComplianceAssetLibraryKey;
  storage_bucket: string;
  /** Full object path within the bucket (exact key). */
  object_path: string;
  /** True when an object exists at `object_path` (verified via exact-path download, not prefix listing). */
  found: boolean;
};

/**
 * One proposed client-facing action — enough structure for later draft/escalation slices.
 * Not executed here; verifier / approval gates apply downstream.
 */
export type OrchestratorProposalCandidate = {
  id: string;
  action_family: OrchestratorClientActionFamily;
  /**
   * Stable key (may mirror `playbook_rules.action_key` or a heuristic label).
   * Compliance library: `v3_compliance_asset_library_attach` when file exists in Storage;
   * `v3_compliance_asset_library_missing_collect` when `compliance_asset_resolution.found === false` (after Storage enrich in core / live worker).
   */
  action_key: string;
  rationale: string;
  verifier_gating_required: boolean;
  likely_outcome: OrchestratorProposalLikelyOutcome;
  blockers_or_missing_facts: string[];
  playbook_rule_ids?: string[];
  /** Phase 4.1 — set when deterministic non-commercial risk heuristics matched. */
  risk_class?: OrchestratorNonCommercialRiskClass;
  /** Phase 4.1 — stable code from `ORCHESTRATOR_NC_ESCALATION_REASON_CODES`. */
  escalation_reason_code?: (typeof ORCHESTRATOR_NC_ESCALATION_REASON_CODES)[OrchestratorNonCommercialRiskClass];
  /** Banking/compliance exception slice — class label for observability. */
  banking_compliance_class?: OrchestratorBankingComplianceClass;
  /** Banking/compliance exception slice — stable code from `ORCHESTRATOR_BC_ESCALATION_REASON_CODES`. */
  banking_compliance_reason_code?: (typeof ORCHESTRATOR_BC_ESCALATION_REASON_CODES)[OrchestratorBankingComplianceClass];
  /**
   * When `action_key` is `v3_compliance_asset_library_attach`, which standard compliance artifact to fulfill.
   * Omitted for payment-rail BC, NDA/signature-shaped compliance, or generic compliance_document_request without attach hints.
   */
  compliance_asset_library_key?: OrchestratorComplianceAssetLibraryKey;
  /**
   * Populated in `executeClientOrchestratorV1Core` when storage resolution runs for compliance attach proposals.
   * Does not include signed URLs (use `createComplianceAssetSignedUrlForOperator` at download time only).
   */
  compliance_asset_resolution?: ComplianceAssetResolution;
  /** Visual / attachment verification slice — class label for observability. */
  visual_asset_verification_class?: OrchestratorVisualAssetVerificationClass;
  /** Visual / attachment verification slice — stable code from `ORCHESTRATOR_VAV_ESCALATION_REASON_CODES`. */
  visual_asset_verification_reason_code?: (typeof ORCHESTRATOR_VAV_ESCALATION_REASON_CODES)[OrchestratorVisualAssetVerificationClass];
  /** Identity/entity Phase 2 slice — class label for observability. */
  identity_entity_phase2_class?: OrchestratorIdentityEntityPhase2Class;
  /** Identity/entity Phase 2 slice — stable code from `ORCHESTRATOR_IE2_ESCALATION_REASON_CODES`. */
  identity_entity_phase2_reason_code?: (typeof ORCHESTRATOR_IE2_ESCALATION_REASON_CODES)[OrchestratorIdentityEntityPhase2Class];
  /** Phase-1 authority policy slice — class label for observability. */
  authority_policy_class?: OrchestratorAuthorityPolicyClass;
  /** Phase-1 authority policy slice — stable code from `ORCHESTRATOR_AP1_ESCALATION_REASON_CODES`. */
  authority_policy_reason_code?: (typeof ORCHESTRATOR_AP1_ESCALATION_REASON_CODES)[OrchestratorAuthorityPolicyClass];
  /** Irregular settlement / tax-avoidance routing slice — class label for observability. */
  irregular_settlement_class?: OrchestratorIrregularSettlementClass;
  /** Irregular settlement slice — stable code from `ORCHESTRATOR_ISR_ESCALATION_REASON_CODES`. */
  irregular_settlement_reason_code?: (typeof ORCHESTRATOR_ISR_ESCALATION_REASON_CODES)[OrchestratorIrregularSettlementClass];
  /** High-magnitude client/payer concession slice — class label for observability. */
  high_magnitude_client_concession_class?: OrchestratorHighMagnitudeClientConcessionClass;
  /** High-magnitude client concession slice — stable code from `ORCHESTRATOR_CCM_ESCALATION_REASON_CODES`. */
  high_magnitude_client_concession_reason_code?: (typeof ORCHESTRATOR_CCM_ESCALATION_REASON_CODES)[OrchestratorHighMagnitudeClientConcessionClass];
  /** Sensitive identity-document / PII-document handling slice — class label for observability. */
  sensitive_personal_document_class?: OrchestratorSensitivePersonalDocumentClass;
  /** Sensitive identity-document slice — stable code from `ORCHESTRATOR_SPD_ESCALATION_REASON_CODES`. */
  sensitive_personal_document_reason_code?: (typeof ORCHESTRATOR_SPD_ESCALATION_REASON_CODES)[OrchestratorSensitivePersonalDocumentClass];
  /** Strategic trust-repair / contradiction-expectation slice — class label for observability. */
  strategic_trust_repair_class?: OrchestratorStrategicTrustRepairClass;
  /** Strategic trust-repair slice — stable code from `ORCHESTRATOR_STR_ESCALATION_REASON_CODES`. */
  strategic_trust_repair_reason_code?: (typeof ORCHESTRATOR_STR_ESCALATION_REASON_CODES)[OrchestratorStrategicTrustRepairClass];
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

/** V3 — structured operator/developer explainability for `executeClientOrchestratorV1` (additive; no persona raw dumps). */
export const V3_CLIENT_ORCHESTRATOR_DECISION_EXPLANATION_SCHEMA_VERSION = 1 as const;

export type V3ClientOrchestratorDecisionExplanation = {
  schemaVersion: typeof V3_CLIENT_ORCHESTRATOR_DECISION_EXPLANATION_SCHEMA_VERSION;
  /** Mapped orchestrator outcome (auto / draft / ask / block). */
  outcome: "auto" | "draft" | "ask" | "block";
  requestedExecutionMode: "auto" | "draft_only" | "ask_first" | "forbidden";
  verifier: {
    success: boolean;
    verifierStage: string | null;
    policyVerdict: string | null;
    reasonCodes: string[];
    pipelineHaltsBeforeExternalSend: boolean | null;
    policyGateApplied: boolean | null;
    ruleId: string | null;
    policyEvaluationActionKey: string | null;
    mergedPlaybookDecisionModeFromRelevantRules: "draft_only" | "ask_first" | "forbidden" | null;
  };
  chosenPath: {
    selectionSource: "draft_attempt" | "escalation_artifact" | "pick_escalation_context_fallback" | null;
    chosenCandidateId: string | null;
    actionFamily: string | null;
    actionKey: string | null;
    likelyOutcome: OrchestratorProposalLikelyOutcome | null;
    /**
     * Non-block proposal with `action_key === "send_message"` (baseline client reply path).
     * Excludes special send variants (e.g. `v3_authority_policy_clarification`) used for comparison only.
     */
    routineBaselineSendMessageCandidate: { actionKey: string; likelyOutcome: OrchestratorProposalLikelyOutcome } | null;
  };
  authority: {
    bucket: InboundSenderAuthorityBucket;
    isApprovalContact: boolean;
    source: InboundSenderAuthoritySource;
    personId: string | null;
  };
  policy: {
    effectivePlaybookRuleIds: string[];
    rawPlaybookRuleIds: string[];
    baselineDiffersFromEffective: boolean;
    appliedAuthorizedExceptionIds: string[];
    policyEvaluationActionKey: string | null;
  };
  /**
   * V3 Phase 1 RBAC — resolved outgoing audience from `buildDecisionContext` / `resolveAudienceVisibility`.
   * Enables replay and operator tooling to verify which visibility bucket governed redaction/policy without inferring from prose.
   */
  audience: {
    visibilityClass: AudienceVisibilityClass;
    clientVisibleForPrivateCommercialRedaction: boolean;
    recipientCount: number;
    broadcastRisk: BroadcastRiskLevel;
  };
  memoryRetrieval: {
    selectedMemoryIds: string[];
    selectedMemoryTypes: { id: string; type: string }[];
    verifyNoteMemoryPresent: boolean;
    /** True only when a verify-note memory row was loaded and injection constraints reference verify-note (not generic multi-actor authority alone). */
    verifyNoteInfluencedInjection: boolean;
    globalKnowledgeFetch: DecisionContextRetrievalTrace["globalKnowledgeFetch"];
    globalKnowledgeLoadedCount: number;
    retrievalGateDetailShort: string | null;
  };
  /** Codes/classes copied from the chosen candidate when present (deterministic observability). */
  riskSignals: {
    nonCommercial?: { riskClass?: string; reasonCode?: string };
    bankingCompliance?: { class?: string; reasonCode?: string };
    visualAssetVerification?: { class?: string; reasonCode?: string };
    identityEntityPhase2?: { class?: string; reasonCode?: string };
    authorityPolicy?: { class?: string; reasonCode?: string };
    irregularSettlement?: { class?: string; reasonCode?: string };
    highMagnitudeClientConcession?: { class?: string; reasonCode?: string };
    sensitivePersonalDocument?: { class?: string; reasonCode?: string };
    strategicTrustRepair?: { class?: string; reasonCode?: string };
  };
  blockers: {
    draftSkipReason: string | null;
    escalationSkipReason: string | null;
    chosenCandidateBlockers: string[];
  };
  executionContext: {
    openEscalationCount: number;
    pendingDraftApprovalCount: number;
    workflowNote: string | null;
  };
  /** Substrings from injection constraints indicating travel/second-shooter package inclusion handling. */
  packageInclusionHints: ("travel" | "second_shooter")[];
  persona: {
    pathAttempted: boolean;
    passed: boolean | null;
    skipOrViolationSummary: string | null;
  };
  /** Bounded high-signal lines for operators (max length enforced at build time). */
  summaryLines: string[];
};

/** Learning loop — operator resolution writeback (classifier → atomic persistence; v1 contract). */
export type {
  AuthorizedCaseExceptionWriteback,
  MemoryWriteback,
  OperatorResolutionCorrelation,
  OperatorResolutionWritebackArtifact,
  OperatorResolutionWritebackEnvelope,
  PlaybookRuleCandidateReviewStatus,
  PlaybookRuleCandidateWriteback,
} from "./operatorResolutionWriteback.types.ts";
export { OPERATOR_RESOLUTION_WRITEBACK_SCHEMA_VERSION } from "./operatorResolutionWriteback.types.ts";
