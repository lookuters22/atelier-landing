/**
 * Service-role insert into `playbook_rule_candidates` only (no `playbook_rules` writes). Slice 6.
 */
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { Database } from "../../../../src/types/database.types.ts";
import type { ValidatedPlaybookRuleCandidatePayload } from "./validatePlaybookRuleCandidatePayload.ts";

export async function insertPlaybookRuleCandidateForOperatorAssistant(
  supabase: SupabaseClient,
  photographerId: string,
  body: ValidatedPlaybookRuleCandidatePayload,
): Promise<{ id: string }> {
  if (body.weddingId) {
    const { data, error } = await supabase
      .from("weddings")
      .select("id")
      .eq("id", body.weddingId)
      .eq("photographer_id", photographerId)
      .maybeSingle();
    if (error) {
      throw new Error(`wedding verify failed: ${error.message}`);
    }
    if (!data?.id) {
      throw new Error("wedding not found for tenant");
    }
  }

  const insertRow: Database["public"]["Tables"]["playbook_rule_candidates"]["Insert"] = {
    photographer_id: photographerId,
    wedding_id: body.weddingId ?? null,
    proposed_action_key: body.proposedActionKey,
    topic: body.topic,
    proposed_instruction: body.proposedInstruction,
    proposed_decision_mode: body.proposedDecisionMode,
    proposed_scope: body.proposedScope,
    proposed_channel: body.proposedScope === "global" ? null : body.proposedChannel!,
    source_classification: { source: "operator_studio_assistant", v: 1 },
    operator_resolution_summary: `Operator assistant proposal — ${body.topic}`.slice(0, 2000),
    originating_operator_text: null,
  };

  const { data: row, error: insErr } = await supabase
    .from("playbook_rule_candidates")
    .insert(insertRow)
    .select("id")
    .single();

  if (insErr) {
    throw new Error(insErr.message);
  }
  if (!row?.id) {
    throw new Error("insert did not return id");
  }
  return { id: String(row.id) };
}
