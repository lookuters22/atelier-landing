/**
 * Phase 10 Step 10D — deduped `Awaiting reply:` tasks for the operator tool surface (`execute_v3.md`).
 * No invented relative due dates in code paths: deferral uses an explicit studio policy offset only.
 */
import type { AwaitingReplyDisposition } from "./classifyAwaitingReplyDisposition.ts";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

type ServiceClient = SupabaseClient;

/** Title prefix for follow-up tasks created via `create_awaiting_reply_task`. */
export const AWAITING_REPLY_TITLE_PREFIX = "Awaiting reply:";

/** Policy: deferral bumps due date by this many days (fixed contract, not model-invented). */
export const DEFERRAL_DUE_POLICY_DAYS = 14;

export function buildAwaitingReplyTitle(actionKey: string): string {
  const k = actionKey.trim().slice(0, 100);
  return `${AWAITING_REPLY_TITLE_PREFIX} ${k}`;
}

export async function findEarliestOpenAwaitingReplyTask(
  supabase: ServiceClient,
  photographerId: string,
): Promise<{ id: string; title: string; due_date: string; wedding_id: string | null } | null> {
  const { data, error } = await supabase
    .from("tasks")
    .select("id, title, due_date, wedding_id")
    .eq("photographer_id", photographerId)
    .eq("status", "open")
    .ilike("title", `${AWAITING_REPLY_TITLE_PREFIX}%`)
    .order("due_date", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`awaiting_reply task lookup: ${error.message}`);
  return data ?? null;
}

export async function createAwaitingReplyTaskDeduped(
  supabase: ServiceClient,
  params: {
    photographerId: string;
    weddingId: string;
    actionKey: string;
    dueDateIso: string;
  },
): Promise<{ ok: true; taskId: string; deduped: boolean } | { ok: false; error: string }> {
  const actionKey = params.actionKey.trim();
  if (!actionKey) return { ok: false, error: "action_key is required." };

  const dueMs = Date.parse(params.dueDateIso);
  if (Number.isNaN(dueMs)) return { ok: false, error: "due_date must be a valid ISO 8601 datetime." };

  const { data: wedding, error: wErr } = await supabase
    .from("weddings")
    .select("id")
    .eq("id", params.weddingId)
    .eq("photographer_id", params.photographerId)
    .maybeSingle();

  if (wErr) return { ok: false, error: `weddings: ${wErr.message}` };
  if (!wedding) return { ok: false, error: "wedding not found for this studio." };

  const title = buildAwaitingReplyTitle(actionKey);

  const { data: existing } = await supabase
    .from("tasks")
    .select("id")
    .eq("photographer_id", params.photographerId)
    .eq("wedding_id", params.weddingId)
    .eq("status", "open")
    .eq("title", title)
    .maybeSingle();

  if (existing?.id) {
    return { ok: true, taskId: existing.id as string, deduped: true };
  }

  const { data: inserted, error: insErr } = await supabase
    .from("tasks")
    .insert({
      photographer_id: params.photographerId,
      wedding_id: params.weddingId,
      title,
      due_date: new Date(dueMs).toISOString(),
      status: "open",
    })
    .select("id")
    .single();

  if (insErr || !inserted?.id) return { ok: false, error: insErr?.message ?? "task insert failed" };
  return { ok: true, taskId: inserted.id as string, deduped: false };
}

export async function applyAwaitingReplyDisposition(
  supabase: ServiceClient,
  params: {
    taskId: string;
    photographerId: string;
    disposition: AwaitingReplyDisposition;
  },
): Promise<void> {
  if (params.disposition === "unresolved") return;

  if (params.disposition === "answered") {
    const { error } = await supabase
      .from("tasks")
      .update({ status: "completed" })
      .eq("id", params.taskId)
      .eq("photographer_id", params.photographerId);

    if (error) throw new Error(`task complete: ${error.message}`);
    return;
  }

  const next = new Date();
  next.setUTCDate(next.getUTCDate() + DEFERRAL_DUE_POLICY_DAYS);

  const { error } = await supabase
    .from("tasks")
    .update({ due_date: next.toISOString() })
    .eq("id", params.taskId)
    .eq("photographer_id", params.photographerId);

  if (error) throw new Error(`task defer: ${error.message}`);
}
