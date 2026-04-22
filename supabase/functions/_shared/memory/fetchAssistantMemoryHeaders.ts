import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { MemoryHeader, MemoryScope } from "./fetchMemoryHeaders.ts";

function parseScope(raw: unknown): MemoryScope {
  if (raw === "project" || raw === "person" || raw === "studio") return raw;
  return "studio";
}

function normalizeId(id: string | null | undefined): string | null {
  if (id == null) return null;
  const t = String(id).trim();
  return t.length > 0 ? t : null;
}

/**
 * PostgREST `.or()` filter for assistant Mode B default + optional explicit scope expansion.
 * Always includes `scope=studio`; adds project/person only when corresponding focus ids are set.
 *
 * @internal Exported for unit tests.
 */
export function assistantMemoriesOrFilter(focusedWeddingId: string | null, focusedPersonId: string | null): string {
  const wid = normalizeId(focusedWeddingId);
  const pid = normalizeId(focusedPersonId);
  const parts: string[] = ["scope.eq.studio"];
  if (wid) {
    parts.push(`and(scope.eq.project,wedding_id.eq.${wid})`);
  }
  if (pid) {
    parts.push(`and(scope.eq.person,person_id.eq.${pid})`);
  }
  return parts.join(",");
}

/**
 * Header scan for assistant queries — **never** used by reply / `buildDecisionContext`.
 * Tenant-scoped, non-archived; studio always; project/person only when focus params are provided.
 */
export async function fetchAssistantMemoryHeaders(
  supabase: SupabaseClient,
  photographerId: string,
  focusedWeddingId: string | null,
  focusedPersonId: string | null,
): Promise<MemoryHeader[]> {
  const orExpr = assistantMemoriesOrFilter(focusedWeddingId, focusedPersonId);

  const { data, error } = await supabase
    .from("memories")
    .select("id, wedding_id, scope, person_id, type, title, summary, weddings(project_type)")
    .eq("photographer_id", photographerId)
    .is("archived_at", null)
    .or(orExpr);

  if (error) {
    throw new Error(`fetchAssistantMemoryHeaders: ${error.message}`);
  }

  const rows = (data ?? []) as Record<string, unknown>[];
  return rows.map((r) => {
    const wEmb = r.weddings as { project_type?: string } | null | undefined;
    const weddingProjectType =
      wEmb != null && typeof wEmb === "object" && typeof wEmb.project_type === "string"
        ? wEmb.project_type
        : null;
    return {
      id: String(r.id ?? ""),
      wedding_id:
        r.wedding_id != null && String(r.wedding_id).trim() !== "" ? String(r.wedding_id).trim() : null,
      person_id:
        r.person_id != null && String(r.person_id).trim() !== "" ? String(r.person_id).trim() : null,
      weddingProjectType,
      scope: parseScope(r.scope),
      type: String(r.type ?? ""),
      title: String(r.title ?? ""),
      summary: String(r.summary ?? ""),
    };
  });
}
