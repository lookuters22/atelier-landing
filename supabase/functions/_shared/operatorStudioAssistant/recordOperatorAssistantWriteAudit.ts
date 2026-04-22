/**
 * P4: persist one audit row per successful operator-assistant direct write (service role).
 */
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { Database, Json } from "../../../../src/types/database.types.ts";

export type OperatorAssistantAuditOperation =
  | "task_create"
  | "memory_create"
  | "authorized_case_exception_create"
  | "calendar_event_create"
  | "calendar_event_reschedule"
  | "playbook_rule_candidate_create";

export async function recordOperatorAssistantWriteAudit(
  supabase: SupabaseClient,
  photographerId: string,
  input: {
    operation: OperatorAssistantAuditOperation;
    entityTable: string;
    entityId: string;
    detail: Record<string, unknown>;
  },
): Promise<{ auditId: string }> {
  const row: Database["public"]["Tables"]["operator_assistant_write_audit"]["Insert"] = {
    photographer_id: photographerId,
    source: "operator_studio_assistant",
    operation: input.operation,
    entity_table: input.entityTable,
    entity_id: input.entityId,
    detail: input.detail as Json,
  };

  const { data, error } = await supabase
    .from("operator_assistant_write_audit")
    .insert(row)
    .select("id")
    .single();

  if (error) {
    throw new Error(`operator assistant audit insert failed: ${error.message}`);
  }
  if (!data?.id) {
    throw new Error("operator assistant audit insert did not return id");
  }
  return { auditId: String(data.id) };
}
