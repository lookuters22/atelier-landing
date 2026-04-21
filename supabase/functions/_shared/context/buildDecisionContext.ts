import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { AgentContext } from "../../../../src/types/agent.types.ts";
import {
  assertResolvedTenantPhotographerId,
  type BuildDecisionContextOptions,
  type DecisionAudienceSnapshot,
  type DecisionContext,
  type DecisionContextRetrievalTrace,
  type InboundSenderAuthoritySnapshot,
  type AuthorizedCaseExceptionRow,
  type EffectivePlaybookRule,
  type PlaybookRuleContextRow,
  type ThreadDraftsSummary,
  type ThreadParticipantAudienceRow,
} from "../../../../src/types/decisionContext.types.ts";
import { applyAudiencePrivateCommercialRedaction } from "./applyAudiencePrivateCommercialRedaction.ts";
import { fetchLatestInboundSuppressionVerdict as _fetchLatestInboundSuppressionVerdictImpl } from "./fetchLatestInboundSuppressionVerdict.ts";
import type { InboundSuppressionClassification } from "../../../../src/lib/inboundSuppressionClassifier.ts";
import {
  applyVisibilityClassOverride,
  resolveAudienceVisibility,
  type WeddingPersonRoleRow,
} from "./resolveAudienceVisibility.ts";
import { buildAgentContext } from "../memory/buildAgentContext.ts";
import { fetchThreadParticipantPersonIdsForMemory } from "./fetchThreadParticipantPersonIdsForMemory.ts";
import { fetchSelectedMemoriesFull } from "../memory/fetchSelectedMemoriesFull.ts";
import {
  MAX_SELECTED_MEMORIES,
  selectRelevantMemoryIdsDeterministic,
} from "../memory/selectRelevantMemoriesForDecisionContext.ts";
import { fetchActivePlaybookRulesForDecisionContext } from "./fetchActivePlaybookRulesForDecisionContext.ts";
import { fetchAuthorizedCaseExceptionsForDecisionContext } from "./fetchAuthorizedCaseExceptionsForDecisionContext.ts";
import { deriveEffectivePlaybook } from "../policy/deriveEffectivePlaybook.ts";
import { fetchRelevantGlobalKnowledgeForDecisionContext } from "./fetchRelevantGlobalKnowledgeForDecisionContext.ts";
import {
  buildDecisionContextRetrievalTrace,
  decideGlobalKnowledgeBaseQuery,
} from "./gateGlobalKnowledgeRetrievalForDecisionContext.ts";
import { fetchThreadDraftsSummaryForDecisionContext } from "./fetchThreadDraftsSummaryForDecisionContext.ts";
import { buildInboundSenderIdentityFromIngress } from "../identity/inboundSenderIdentity.ts";
import { deriveInboundSenderAuthority } from "./deriveInboundSenderAuthority.ts";
import { resolveInboundSenderAuthorityForAudienceLoad } from "./resolveInboundSenderAuthorityForAudienceLoad.ts";
import {
  normalizeInquiryFirstStepStyle,
  type InquiryFirstStepStyle,
} from "../../../../src/lib/inquiryFirstStepStyle.ts";
import { readPhotographerSettings } from "../../../../src/lib/photographerSettings.ts";

export type { BuildDecisionContextOptions } from "../../../../src/types/decisionContext.types.ts";

function resolveMemoryIdsForDecisionContext(
  tenantPhotographerId: string,
  weddingId: string | null,
  threadId: string | null,
  rawMessage: string,
  base: AgentContext,
  options?: BuildDecisionContextOptions,
): string[] {
  const explicit = options?.selectedMemoryIds?.filter((id) => id.length > 0) ?? [];
  if (explicit.length > 0) {
    return explicit.slice(0, MAX_SELECTED_MEMORIES);
  }
  return selectRelevantMemoryIdsDeterministic({
    photographerId: tenantPhotographerId,
    weddingId,
    threadId,
    rawMessage,
    threadSummary: base.threadSummary,
    memoryHeaders: base.memoryHeaders,
    replyModeParticipantPersonIds: base.replyModeParticipantPersonIds,
  });
}

/**
 * **Sole factory** for `DecisionContext` (execute_v3 Step 5F). Do not hand-roll context
 * objects in workers — call this helper so playbook, audience, and memory layers stay consistent.
 *
 * Phase 5 — Steps 5A–5C: header-scan via `buildAgentContext` / `fetchMemoryHeaders`;
 * deterministic promotion (`selectRelevantMemoryIdsDeterministic`) fills `selectedMemories` when
 * `options.selectedMemoryIds` is omitted or empty; explicit ids override for QA/replay.
 * `selectedMemories` / `globalKnowledge` do not override `playbook_rules` (supporting context only).
 * **Authorized case exceptions:** `authorized_case_exceptions` rows are loaded per wedding/thread and merged
 * with raw playbook in TS (`deriveEffectivePlaybook`) — `playbookRules` on the context is the **effective** view.
 *
 * **Global KB gating:** `decideGlobalKnowledgeBaseQuery` may skip the tenant `knowledge_base` vector RPC
 * on low-signal turns (no extra DB round-trip to decide). `retrievalTrace` records ids, counts, and gate outcome.
 *
 * **Step 5G:** `photographerId` must be a **resolved** tenant key (never trust raw client input).
 * All fetches are scoped with `.eq("photographer_id", …)`; the returned context pins that id.
 *
 * @param photographerId — Resolved `photographers.id` for this tenant (e.g. from verified JWT or parent row).
 *
 * Step 6.5G: `audience.approvalContactPersonIds` resolves `wedding_people.is_approval_contact` for the effective wedding.
 */
export async function buildDecisionContext(
  supabase: SupabaseClient,
  photographerId: string,
  weddingId: string | null,
  threadId: string | null,
  replyChannel: AgentContext["replyChannel"],
  rawMessage: string,
  options?: BuildDecisionContextOptions,
): Promise<DecisionContext> {
  const tenantPhotographerId = assertResolvedTenantPhotographerId(photographerId);

  const replyModeParticipantPersonIds = await fetchThreadParticipantPersonIdsForMemory(
    supabase,
    tenantPhotographerId,
    threadId,
  );

  const base = await buildAgentContext(
    supabase,
    tenantPhotographerId,
    weddingId,
    threadId,
    replyChannel,
    rawMessage,
    { replyModeParticipantPersonIds },
  );

  const memoryIds = resolveMemoryIdsForDecisionContext(
    tenantPhotographerId,
    weddingId,
    threadId,
    rawMessage,
    base,
    options,
  );
  const selectedMemoriesPromise =
    memoryIds.length > 0
      ? fetchSelectedMemoriesFull(supabase, tenantPhotographerId, memoryIds)
      : Promise.resolve(base.selectedMemories);

  const globalKnowledgeGate = decideGlobalKnowledgeBaseQuery({
    rawMessage,
    threadSummary: base.threadSummary,
    replyChannel: base.replyChannel,
    promotedMemoryIds: memoryIds,
    qaBypassGate: options?.qaBypassGlobalKnowledgeGate === true,
  });
  const globalKnowledgePromise =
    globalKnowledgeGate.queryKnowledgeBase
      ? fetchRelevantGlobalKnowledgeForDecisionContext(supabase, {
          photographerId: tenantPhotographerId,
          rawMessage,
          threadSummary: base.threadSummary,
          replyChannel: base.replyChannel,
        })
      : Promise.resolve([]);

  const [
    audienceBundle,
    candidateWeddingIds,
    rawPlaybookRules,
    authorizedCaseExceptions,
    selectedMemories,
    threadDraftsSummary,
    globalKnowledge,
    photographerSettingsRead,
  ] = await Promise.all([
    loadAudienceSnapshot(
      supabase,
      tenantPhotographerId,
      weddingId,
      threadId,
      options?.inboundSenderEmail,
    ),
    loadCandidateWeddingIds(supabase, tenantPhotographerId, threadId),
    fetchActivePlaybookRulesForDecisionContext(supabase, tenantPhotographerId),
    fetchAuthorizedCaseExceptionsForDecisionContext(
      supabase,
      tenantPhotographerId,
      weddingId,
      threadId,
    ),
    selectedMemoriesPromise,
    fetchThreadDraftsSummaryForDecisionContext(supabase, tenantPhotographerId, threadId),
    globalKnowledgePromise,
    readPhotographerSettings(supabase, tenantPhotographerId),
  ]);
  const { audience, inboundSenderAuthority: inboundSenderAuthorityFromLoad } = audienceBundle;

  const effectivePlaybookRules = deriveEffectivePlaybook(rawPlaybookRules, authorizedCaseExceptions);

  const retrievalTrace = buildDecisionContextRetrievalTrace({
    selectedMemoryIdsResolved: memoryIds,
    selectedMemories,
    globalKnowledge,
    gate: globalKnowledgeGate,
  });

  const inquiryFirstStepStyle = normalizeInquiryFirstStepStyle(
    photographerSettingsRead?.contract.inquiry_first_step_style,
  );

  const merged = mergeDecisionContextWithoutRedaction(base, tenantPhotographerId, {
    selectedMemories,
    audience,
    inboundSenderAuthorityFromLoad,
    candidateWeddingIds,
    rawPlaybookRules,
    authorizedCaseExceptions,
    effectivePlaybookRules,
    threadDraftsSummary,
    globalKnowledge,
    retrievalTrace,
    inquiryFirstStepStyle,
    options,
  });
  return applyAudiencePrivateCommercialRedaction(merged);
}

/**
 * QA/replay harness only — same DB path as {@link buildDecisionContext}, but returns the merged
 * context **before** and **after** `applyAudiencePrivateCommercialRedaction` for proof reports.
 */
export async function buildDecisionContextQaProofPair(
  supabase: SupabaseClient,
  photographerId: string,
  weddingId: string | null,
  threadId: string | null,
  replyChannel: AgentContext["replyChannel"],
  rawMessage: string,
  options?: BuildDecisionContextOptions,
): Promise<{ preRedaction: DecisionContext; postRedaction: DecisionContext }> {
  const tenantPhotographerId = assertResolvedTenantPhotographerId(photographerId);

  const replyModeParticipantPersonIds = await fetchThreadParticipantPersonIdsForMemory(
    supabase,
    tenantPhotographerId,
    threadId,
  );

  const base = await buildAgentContext(
    supabase,
    tenantPhotographerId,
    weddingId,
    threadId,
    replyChannel,
    rawMessage,
    { replyModeParticipantPersonIds },
  );

  const memoryIds = resolveMemoryIdsForDecisionContext(
    tenantPhotographerId,
    weddingId,
    threadId,
    rawMessage,
    base,
    options,
  );
  const selectedMemoriesPromise =
    memoryIds.length > 0
      ? fetchSelectedMemoriesFull(supabase, tenantPhotographerId, memoryIds)
      : Promise.resolve(base.selectedMemories);

  const globalKnowledgeGate = decideGlobalKnowledgeBaseQuery({
    rawMessage,
    threadSummary: base.threadSummary,
    replyChannel: base.replyChannel,
    promotedMemoryIds: memoryIds,
    qaBypassGate: options?.qaBypassGlobalKnowledgeGate === true,
  });
  const globalKnowledgePromise =
    globalKnowledgeGate.queryKnowledgeBase
      ? fetchRelevantGlobalKnowledgeForDecisionContext(supabase, {
          photographerId: tenantPhotographerId,
          rawMessage,
          threadSummary: base.threadSummary,
          replyChannel: base.replyChannel,
        })
      : Promise.resolve([]);

  const [
    audienceBundle,
    candidateWeddingIds,
    rawPlaybookRules,
    authorizedCaseExceptions,
    selectedMemories,
    threadDraftsSummary,
    globalKnowledge,
    photographerSettingsRead,
  ] = await Promise.all([
    loadAudienceSnapshot(
      supabase,
      tenantPhotographerId,
      weddingId,
      threadId,
      options?.inboundSenderEmail,
    ),
    loadCandidateWeddingIds(supabase, tenantPhotographerId, threadId),
    fetchActivePlaybookRulesForDecisionContext(supabase, tenantPhotographerId),
    fetchAuthorizedCaseExceptionsForDecisionContext(
      supabase,
      tenantPhotographerId,
      weddingId,
      threadId,
    ),
    selectedMemoriesPromise,
    fetchThreadDraftsSummaryForDecisionContext(supabase, tenantPhotographerId, threadId),
    globalKnowledgePromise,
    readPhotographerSettings(supabase, tenantPhotographerId),
  ]);
  const { audience, inboundSenderAuthority: inboundSenderAuthorityFromLoad } = audienceBundle;

  const effectivePlaybookRules = deriveEffectivePlaybook(rawPlaybookRules, authorizedCaseExceptions);

  const retrievalTrace = buildDecisionContextRetrievalTrace({
    selectedMemoryIdsResolved: memoryIds,
    selectedMemories,
    globalKnowledge,
    gate: globalKnowledgeGate,
  });

  const inquiryFirstStepStyle = normalizeInquiryFirstStepStyle(
    photographerSettingsRead?.contract.inquiry_first_step_style,
  );

  const preRedaction = mergeDecisionContextWithoutRedaction(base, tenantPhotographerId, {
    selectedMemories,
    audience,
    inboundSenderAuthorityFromLoad,
    candidateWeddingIds,
    rawPlaybookRules,
    authorizedCaseExceptions,
    effectivePlaybookRules,
    threadDraftsSummary,
    globalKnowledge,
    retrievalTrace,
    inquiryFirstStepStyle,
    options,
  });
  return {
    preRedaction,
    postRedaction: applyAudiencePrivateCommercialRedaction(preRedaction),
  };
}

/**
 * Merge-only Step 5F object (no audience redaction). Used by `buildDecisionContext` and QA proof pair.
 */
function mergeDecisionContextWithoutRedaction(
  base: AgentContext,
  canonicalTenantPhotographerId: string,
  parts: {
    selectedMemories: AgentContext["selectedMemories"];
    audience: DecisionAudienceSnapshot;
    inboundSenderAuthorityFromLoad: InboundSenderAuthoritySnapshot;
    candidateWeddingIds: string[];
    rawPlaybookRules: PlaybookRuleContextRow[];
    authorizedCaseExceptions: AuthorizedCaseExceptionRow[];
    effectivePlaybookRules: EffectivePlaybookRule[];
    threadDraftsSummary: ThreadDraftsSummary | null;
    globalKnowledge: AgentContext["globalKnowledge"];
    retrievalTrace: DecisionContextRetrievalTrace;
    inquiryFirstStepStyle: InquiryFirstStepStyle;
    options?: BuildDecisionContextOptions;
  },
): DecisionContext {
  let audience = parts.audience;
  if (parts.options?.qaVisibilityClassOverride) {
    audience = {
      ...audience,
      ...applyVisibilityClassOverride(
        {
          visibilityClass: audience.visibilityClass,
          clientVisibleForPrivateCommercialRedaction: audience.clientVisibleForPrivateCommercialRedaction,
        },
        parts.options.qaVisibilityClassOverride,
      ),
    };
  }

  const inboundSenderIdentity = buildInboundSenderIdentityFromIngress({
    inboundSenderEmail: parts.options?.inboundSenderEmail,
    inboundSenderDisplayName: parts.options?.inboundSenderDisplayName,
  });

  const inboundSenderAuthority = parts.options?.qaInboundSenderAuthorityOverride
    ? parts.options.qaInboundSenderAuthorityOverride
    : parts.inboundSenderAuthorityFromLoad;

  return {
    ...base,
    photographerId: canonicalTenantPhotographerId,
    contextVersion: 1,
    selectedMemories: parts.selectedMemories,
    audience,
    candidateWeddingIds: parts.candidateWeddingIds,
    rawPlaybookRules: parts.rawPlaybookRules,
    authorizedCaseExceptions: parts.authorizedCaseExceptions,
    playbookRules: parts.effectivePlaybookRules,
    threadDraftsSummary: parts.threadDraftsSummary,
    globalKnowledge: parts.globalKnowledge,
    retrievalTrace: parts.retrievalTrace,
    inboundSenderIdentity,
    inboundSenderAuthority,
    inquiryFirstStepStyle: parts.inquiryFirstStepStyle,
  };
}

/** Conservative default when thread or participants are missing: assume client-visible. */
const DEFAULT_VISIBILITY: Pick<
  DecisionAudienceSnapshot,
  "visibilityClass" | "clientVisibleForPrivateCommercialRedaction"
> = {
  visibilityClass: "client_visible",
  clientVisibleForPrivateCommercialRedaction: true,
};

async function fetchWeddingPeopleByWedding(
  supabase: SupabaseClient,
  photographerId: string,
  weddingId: string | null,
): Promise<Map<string, WeddingPersonRoleRow>> {
  if (!weddingId) return new Map();

  const { data, error } = await supabase
    .from("wedding_people")
    .select("person_id, role_label, is_payer")
    .eq("photographer_id", photographerId)
    .eq("wedding_id", weddingId);

  if (error) {
    throw new Error(`buildDecisionContext wedding_people: ${error.message}`);
  }

  const m = new Map<string, WeddingPersonRoleRow>();
  for (const row of data ?? []) {
    m.set(row.person_id as string, {
      person_id: row.person_id as string,
      role_label: typeof row.role_label === "string" ? row.role_label : "",
      is_payer: Boolean(row.is_payer),
    });
  }
  return m;
}

async function loadAudienceSnapshot(
  supabase: SupabaseClient,
  photographerId: string,
  weddingId: string | null,
  threadId: string | null,
  inboundSenderEmailFromIngress: string | null | undefined,
): Promise<{
  audience: DecisionAudienceSnapshot;
  inboundSenderAuthority: InboundSenderAuthoritySnapshot;
}> {
  if (!threadId) {
    const agencyCcLock = weddingId
      ? await fetchAgencyCcLock(supabase, photographerId, weddingId)
      : null;
    const approvalContactPersonIds = await fetchApprovalContactPersonIds(
      supabase,
      photographerId,
      weddingId,
    );
    const audience: DecisionAudienceSnapshot = {
      threadParticipants: [],
      agencyCcLock,
      broadcastRisk: "unknown",
      recipientCount: 0,
      approvalContactPersonIds,
      inboundSuppression: null,
      ...DEFAULT_VISIBILITY,
    };
    return {
      audience,
      inboundSenderAuthority: deriveInboundSenderAuthority([], new Map(), approvalContactPersonIds),
    };
  }

  const { data: threadRow, error: threadErr } = await supabase
    .from("threads")
    .select("id, wedding_id")
    .eq("id", threadId)
    .eq("photographer_id", photographerId)
    .maybeSingle();

  if (threadErr) {
    throw new Error(`buildDecisionContext thread check: ${threadErr.message}`);
  }
  if (!threadRow) {
    const approvalContactPersonIds = await fetchApprovalContactPersonIds(
      supabase,
      photographerId,
      weddingId,
    );
    const audience: DecisionAudienceSnapshot = {
      threadParticipants: [],
      agencyCcLock: null,
      broadcastRisk: "unknown",
      recipientCount: 0,
      approvalContactPersonIds,
      inboundSuppression: null,
      ...DEFAULT_VISIBILITY,
    };
    return {
      audience,
      inboundSenderAuthority: deriveInboundSenderAuthority([], new Map(), approvalContactPersonIds),
    };
  }

  const effectiveWeddingId = weddingId ?? threadRow.wedding_id ?? null;
  const weddingPeopleByPersonId = await fetchWeddingPeopleByWedding(
    supabase,
    photographerId,
    effectiveWeddingId,
  );

  const { data: parts, error: partErr } = await supabase
    .from("thread_participants")
    .select(
      "id, person_id, thread_id, visibility_role, is_cc, is_recipient, is_sender",
    )
    .eq("thread_id", threadId)
    .eq("photographer_id", photographerId);

  if (partErr) {
    throw new Error(`buildDecisionContext thread_participants: ${partErr.message}`);
  }

  const threadParticipants: ThreadParticipantAudienceRow[] = (parts ?? []).map(
    (p) => ({
      id: p.id,
      person_id: p.person_id,
      thread_id: p.thread_id,
      visibility_role: p.visibility_role,
      is_cc: p.is_cc,
      is_recipient: p.is_recipient,
      is_sender: p.is_sender,
    }),
  );

  const recipientCount = threadParticipants.filter((p) => p.is_recipient).length;

  const agencyCcLock =
    effectiveWeddingId !== null
      ? await fetchAgencyCcLock(supabase, photographerId, effectiveWeddingId)
      : null;

  const approvalContactPersonIds = await fetchApprovalContactPersonIds(
    supabase,
    photographerId,
    effectiveWeddingId,
  );

  const { visibilityClass, clientVisibleForPrivateCommercialRedaction } = resolveAudienceVisibility(
    threadParticipants,
    weddingPeopleByPersonId,
  );

  /**
   * Inbound suppression — latest inbound message on this thread is classified
   * against the shared promo/system/non-client heuristics. When suppressed we:
   *   1) populate `inboundSuppression` so orchestrator proposal logic can block
   *      `send_message` and route only `operator_notification_routing`;
   *   2) upgrade `broadcastRisk` to `"high"` so `inferLikelyOutcome` folds into
   *      the existing auto→block rails (no new enum, no orchestrator refactor).
   */
  const inboundSuppression = await _fetchLatestInboundSuppressionVerdictImpl(
    supabase,
    photographerId,
    threadId,
    recipientCount,
  );
  const broadcastRisk: DecisionAudienceSnapshot["broadcastRisk"] = inboundSuppression?.suppressed
    ? "high"
    : "unknown";

  const audience: DecisionAudienceSnapshot = {
    threadParticipants,
    agencyCcLock,
    broadcastRisk,
    recipientCount,
    approvalContactPersonIds,
    visibilityClass,
    clientVisibleForPrivateCommercialRedaction,
    inboundSuppression,
  };

  const inboundSenderAuthority = await resolveInboundSenderAuthorityForAudienceLoad(
    supabase,
    photographerId,
    effectiveWeddingId,
    threadId,
    threadParticipants,
    weddingPeopleByPersonId,
    approvalContactPersonIds,
    inboundSenderEmailFromIngress,
  );

  return {
    audience,
    inboundSenderAuthority,
  };
}

/** Step 6.5G — approval-contact role is first-class on the wedding graph (`wedding_people`). */
async function fetchApprovalContactPersonIds(
  supabase: SupabaseClient,
  photographerId: string,
  weddingId: string | null,
): Promise<string[]> {
  if (!weddingId) return [];

  const { data, error } = await supabase
    .from("wedding_people")
    .select("person_id")
    .eq("photographer_id", photographerId)
    .eq("wedding_id", weddingId)
    .eq("is_approval_contact", true);

  if (error) {
    throw new Error(`buildDecisionContext approval_contact: ${error.message}`);
  }

  const ids = (data ?? []).map((r) => r.person_id as string);
  return [...new Set(ids)];
}

/**
 * Pulls the newest inbound message on the thread (by `sent_at`) and runs
 * `classifyInboundSuppression`. Returns `null` when:
 *   - no inbound message exists yet, or
 *   - the DB call fails (conservative — we never want this helper to block
 *     decision context from building).
 *
 * Subject proxy uses `threads.title` because `messages` has no subject column;
 * Gmail import sets the thread title from the RFC822 `Subject` header, and the
 * classifier only needs subject-level promo tokens (unsubscribe, "X% off"),
 * which the thread title still carries.
 */
/**
 * Re-exported via the standalone module so unit tests can hit the helper
 * without dragging in the entire decision-context graph (and its npm:* deps).
 */
export { fetchLatestInboundSuppressionVerdict } from "./fetchLatestInboundSuppressionVerdict.ts";

async function fetchAgencyCcLock(
  supabase: SupabaseClient,
  photographerId: string,
  weddingId: string,
): Promise<boolean | null> {
  const { data, error } = await supabase
    .from("weddings")
    .select("agency_cc_lock")
    .eq("id", weddingId)
    .eq("photographer_id", photographerId)
    .maybeSingle();

  if (error) {
    throw new Error(`buildDecisionContext agency_cc_lock: ${error.message}`);
  }
  if (!data) return null;
  return data.agency_cc_lock;
}

async function loadCandidateWeddingIds(
  supabase: SupabaseClient,
  photographerId: string,
  threadId: string | null,
): Promise<string[]> {
  if (!threadId) return [];

  const { data, error } = await supabase
    .from("thread_weddings")
    .select("wedding_id")
    .eq("thread_id", threadId)
    .eq("photographer_id", photographerId);

  if (error) {
    throw new Error(`buildDecisionContext thread_weddings: ${error.message}`);
  }

  const ids = new Set<string>();
  for (const row of data ?? []) {
    if (row.wedding_id) ids.add(row.wedding_id);
  }
  return [...ids];
}
