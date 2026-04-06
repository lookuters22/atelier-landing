import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { AgentContext } from "../../../../src/types/agent.types.ts";

/**
 * Step 5C — second stage after `fetchMemoryHeaders`: load full durable memory for selected IDs only.
 * Tenant-safe: `.eq("photographer_id")` plus `.in("id", ...)`.
 * Preserves caller ID order; omits IDs not found or not owned.
 */
export async function fetchSelectedMemoriesFull(
  supabase: SupabaseClient,
  photographerId: string,
  memoryIds: string[],
): Promise<AgentContext["selectedMemories"]> {
  const unique = [...new Set(memoryIds.filter((id) => id.length > 0))];
  if (unique.length === 0) {
    return [];
  }

  const { data, error } = await supabase
    .from("memories")
    .select("id, type, title, summary, full_content")
    .eq("photographer_id", photographerId)
    .in("id", unique);

  if (error) {
    throw new Error(`fetchSelectedMemoriesFull: ${error.message}`);
  }

  const byId = new Map<string, AgentContext["selectedMemories"][number]>();
  for (const r of data ?? []) {
    byId.set(r.id, {
      id: r.id,
      type: r.type,
      title: r.title,
      summary: r.summary,
      full_content: r.full_content,
    });
  }

  const out: AgentContext["selectedMemories"] = [];
  for (const id of unique) {
    const row = byId.get(id);
    if (row) out.push(row);
  }
  return out;
}
