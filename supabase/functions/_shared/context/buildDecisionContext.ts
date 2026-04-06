import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { AgentContext } from "../../../../src/types/agent.types.ts";
import {
  assertResolvedTenantPhotographerId,
  type BuildDecisionContextOptions,
  type DecisionAudienceSnapshot,
  type DecisionContext,
  type PlaybookRuleContextRow,
  type ThreadDraftsSummary,
  type ThreadParticipantAudienceRow,
} from "../../../../src/types/decisionContext.types.ts";
import { buildAgentContext } from "../memory/buildAgentContext.ts";
import { fetchSelectedMemoriesFull } from "../memory/fetchSelectedMemoriesFull.ts";
import { fetchActivePlaybookRulesForDecisionContext } from "./fetchActivePlaybookRulesForDecisionContext.ts";
import { fetchThreadDraftsSummaryForDecisionContext } from "./fetchThreadDraftsSummaryForDecisionContext.ts";

export type { BuildDecisionContextOptions } from "../../../../src/types/decisionContext.types.ts";

/**
 * **Sole factory** for `DecisionContext` (execute_v3 Step 5F). Do not hand-roll context
 * objects in workers — call this helper so playbook, audience, and memory layers stay consistent.
 *
 * Phase 5 — Steps 5A–5C: header-scan via `buildAgentContext` / `fetchMemoryHeaders`;
 * optional `selectedMemoryIds` promotes full memory rows.
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

  const base = await buildAgentContext(
    supabase,
    tenantPhotographerId,
    weddingId,
    threadId,
    replyChannel,
    rawMessage,
  );

  const memoryIds = options?.selectedMemoryIds?.filter((id) => id.length > 0) ?? [];
  const selectedMemoriesPromise =
    memoryIds.length > 0
      ? fetchSelectedMemoriesFull(supabase, tenantPhotographerId, memoryIds)
      : Promise.resolve(base.selectedMemories);

  const [audience, candidateWeddingIds, playbookRules, selectedMemories, threadDraftsSummary] =
    await Promise.all([
      loadAudienceSnapshot(supabase, tenantPhotographerId, weddingId, threadId),
      loadCandidateWeddingIds(supabase, tenantPhotographerId, threadId),
      fetchActivePlaybookRulesForDecisionContext(supabase, tenantPhotographerId),
      selectedMemoriesPromise,
      fetchThreadDraftsSummaryForDecisionContext(supabase, tenantPhotographerId, threadId),
    ]);

  return finalizeDecisionContext(base, tenantPhotographerId, {
    selectedMemories,
    audience,
    candidateWeddingIds,
    playbookRules,
    threadDraftsSummary,
  });
}

/**
 * Single merge point for the `DecisionContext` object shape (Step 5F).
 * Pins `photographerId` to the validated tenant (Step 5G) so the object cannot reflect mixed tenants.
 */
function finalizeDecisionContext(
  base: AgentContext,
  canonicalTenantPhotographerId: string,
  parts: {
    selectedMemories: AgentContext["selectedMemories"];
    audience: DecisionAudienceSnapshot;
    candidateWeddingIds: string[];
    playbookRules: PlaybookRuleContextRow[];
    threadDraftsSummary: ThreadDraftsSummary | null;
  },
): DecisionContext {
  return {
    ...base,
    photographerId: canonicalTenantPhotographerId,
    contextVersion: 1,
    selectedMemories: parts.selectedMemories,
    audience: parts.audience,
    candidateWeddingIds: parts.candidateWeddingIds,
    playbookRules: parts.playbookRules,
    threadDraftsSummary: parts.threadDraftsSummary,
  };
}

async function loadAudienceSnapshot(
  supabase: SupabaseClient,
  photographerId: string,
  weddingId: string | null,
  threadId: string | null,
): Promise<DecisionAudienceSnapshot> {
  if (!threadId) {
    const agencyCcLock = weddingId
      ? await fetchAgencyCcLock(supabase, photographerId, weddingId)
      : null;
    const approvalContactPersonIds = await fetchApprovalContactPersonIds(
      supabase,
      photographerId,
      weddingId,
    );
    return {
      threadParticipants: [],
      agencyCcLock,
      broadcastRisk: "unknown",
      recipientCount: 0,
      approvalContactPersonIds,
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
    return {
      threadParticipants: [],
      agencyCcLock: null,
      broadcastRisk: "unknown",
      recipientCount: 0,
      approvalContactPersonIds,
    };
  }

  const effectiveWeddingId = weddingId ?? threadRow.wedding_id ?? null;

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

  return {
    threadParticipants,
    agencyCcLock,
    broadcastRisk: "unknown",
    recipientCount,
    approvalContactPersonIds,
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
