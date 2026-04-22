/**
 * Service-role: revoke competing active `authorized_case_exceptions` + insert one active row (Slice 11).
 * No writes to `playbook_rules` or `playbook_rule_candidates`. Operator-initiated: `approved_via_escalation_id` null.
 */
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { Json } from "../../../../src/types/database.types.ts";
import { addDaysIsoUtc, DEFAULT_AUTHORIZED_CASE_EXCEPTION_TTL_DAYS } from "../policy/authorizedCaseExceptionExpiry.ts";
import { fetchPlaybookRuleIdForTenantActionKey } from "../policy/upsertAuthorizedCaseExceptionFromEscalationResolution.ts";
import type { ValidatedOperatorAssistantAuthorizedCaseExceptionPayload } from "./validateOperatorAssistantAuthorizedCaseExceptionPayload.ts";
import { recordOperatorAssistantWriteAudit } from "./recordOperatorAssistantWriteAudit.ts";

async function revokeCompetingForActionKey(
  supabase: SupabaseClient,
  photographerId: string,
  weddingId: string,
  overridesActionKey: string,
  clientThreadId: string | null,
): Promise<void> {
  const base = supabase
    .from("authorized_case_exceptions")
    .update({ status: "revoked", updated_at: new Date().toISOString() })
    .eq("photographer_id", photographerId)
    .eq("wedding_id", weddingId)
    .eq("status", "active")
    .eq("overrides_action_key", overridesActionKey);

  const { error } =
    clientThreadId == null
      ? await base.is("thread_id", null)
      : await base.or(`thread_id.is.null,thread_id.eq.${clientThreadId}`);

  if (error) {
    throw new Error(`revoke case exceptions (action key): ${error.message}`);
  }
}

async function revokeCompetingForTargetRule(
  supabase: SupabaseClient,
  photographerId: string,
  weddingId: string,
  targetPlaybookRuleId: string,
  clientThreadId: string | null,
): Promise<void> {
  const base = supabase
    .from("authorized_case_exceptions")
    .update({ status: "revoked", updated_at: new Date().toISOString() })
    .eq("photographer_id", photographerId)
    .eq("wedding_id", weddingId)
    .eq("status", "active")
    .eq("target_playbook_rule_id", targetPlaybookRuleId);

  const { error } =
    clientThreadId == null
      ? await base.is("thread_id", null)
      : await base.or(`thread_id.is.null,thread_id.eq.${clientThreadId}`);

  if (error) {
    throw new Error(`revoke case exceptions (target rule): ${error.message}`);
  }
}

export async function insertAuthorizedCaseExceptionForOperatorAssistant(
  supabase: SupabaseClient,
  photographerId: string,
  body: ValidatedOperatorAssistantAuthorizedCaseExceptionPayload,
): Promise<{ id: string; effectiveUntil: string; auditId: string }> {
  const { data: w, error: wErr } = await supabase
    .from("weddings")
    .select("id")
    .eq("id", body.weddingId)
    .eq("photographer_id", photographerId)
    .maybeSingle();
  if (wErr) {
    throw new Error(`wedding verify failed: ${wErr.message}`);
  }
  if (!w?.id) {
    throw new Error("wedding not found for tenant");
  }

  let targetRuleId: string | null = body.targetPlaybookRuleId ?? null;
  if (targetRuleId == null) {
    targetRuleId = await fetchPlaybookRuleIdForTenantActionKey(supabase, photographerId, body.overridesActionKey);
  } else {
    const { data: pr, error: prErr } = await supabase
      .from("playbook_rules")
      .select("id, action_key")
      .eq("photographer_id", photographerId)
      .eq("id", targetRuleId)
      .maybeSingle();
    if (prErr) {
      throw new Error(`playbook rule verify failed: ${prErr.message}`);
    }
    if (!pr?.id) {
      throw new Error("targetPlaybookRuleId not found for tenant");
    }
    if (String((pr as { action_key?: string }).action_key ?? "") !== body.overridesActionKey) {
      throw new Error("targetPlaybookRuleId does not match overridesActionKey");
    }
  }

  await revokeCompetingForActionKey(
    supabase,
    photographerId,
    body.weddingId,
    body.overridesActionKey,
    body.clientThreadId ?? null,
  );
  if (targetRuleId) {
    await revokeCompetingForTargetRule(
      supabase,
      photographerId,
      body.weddingId,
      targetRuleId,
      body.clientThreadId ?? null,
    );
  }

  const effectiveFrom = new Date().toISOString();
  const effectiveUntil =
    body.effectiveUntil && body.effectiveUntil.trim().length > 0
      ? new Date(body.effectiveUntil).toISOString()
      : addDaysIsoUtc(DEFAULT_AUTHORIZED_CASE_EXCEPTION_TTL_DAYS, new Date());

  const overridePayloadJson = body.overridePayload as unknown as Json;

  const { data: row, error: insErr } = await supabase
    .from("authorized_case_exceptions")
    .insert({
      photographer_id: photographerId,
      wedding_id: body.weddingId,
      thread_id: body.clientThreadId ?? null,
      status: "active",
      overrides_action_key: body.overridesActionKey,
      target_playbook_rule_id: targetRuleId,
      override_payload: overridePayloadJson,
      approved_by: null,
      approved_via_escalation_id: null,
      effective_from: effectiveFrom,
      effective_until: effectiveUntil,
      notes: body.notes ?? null,
    })
    .select("id, effective_until")
    .single();

  if (insErr) {
    throw new Error(insErr.message);
  }
  if (!row?.id) {
    throw new Error("insert did not return id");
  }
  const id = String(row.id);
  const { auditId } = await recordOperatorAssistantWriteAudit(supabase, photographerId, {
    operation: "authorized_case_exception_create",
    entityTable: "authorized_case_exceptions",
    entityId: id,
    detail: {
      weddingId: body.weddingId,
      overridesActionKey: body.overridesActionKey,
      targetPlaybookRuleId: body.targetPlaybookRuleId ?? null,
      clientThreadId: body.clientThreadId ?? null,
    },
  });
  return {
    id,
    effectiveUntil: String((row as { effective_until: string }).effective_until),
    auditId,
  };
}
