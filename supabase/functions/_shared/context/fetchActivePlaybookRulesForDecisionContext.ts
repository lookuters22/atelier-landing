import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { PlaybookRuleContextRow } from "../../../../src/types/decisionContext.types.ts";

/**
 * Loads active tenant `playbook_rules` for decision context (execute_v3 Step 5B).
 * Tenant-safe: always filters by `photographer_id`.
 */
export async function fetchActivePlaybookRulesForDecisionContext(
  supabase: SupabaseClient,
  photographerId: string,
): Promise<PlaybookRuleContextRow[]> {
  const { data, error } = await supabase
    .from("playbook_rules")
    .select(
      "id, action_key, topic, decision_mode, scope, channel, instruction, source_type, confidence_label, is_active",
    )
    .eq("photographer_id", photographerId)
    .eq("is_active", true)
    .order("topic", { ascending: true })
    .order("action_key", { ascending: true });

  if (error) {
    throw new Error(
      `fetchActivePlaybookRulesForDecisionContext: ${error.message}`,
    );
  }

  return (data ?? []) as PlaybookRuleContextRow[];
}
