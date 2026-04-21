import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { Database } from "../../../../src/types/database.types.ts";

/**
 * Matches `AgentContext["memoryHeaders"][number]` in `src/types/agent.types.ts`.
 * Only header fields — never `full_content`.
 */
export type MemoryScope = Database["public"]["Enums"]["memory_scope"];

export type MemoryHeader = {
  id: string;
  /** Null = tenant-wide; aligns with `scope='studio'` for new rows. */
  wedding_id: string | null;
  /** `memories.person_id`; meaningful when `scope='person'`. */
  person_id: string | null;
  scope: MemoryScope;
  type: string;
  title: string;
  summary: string;
};

export type FetchMemoryHeadersOptions = {
  /** Reply-mode: allow `scope='person'` rows only for these `people.id` values (thread participants). */
  replyModeParticipantPersonIds?: string[] | null;
};

function parseScope(raw: unknown): MemoryScope {
  if (raw === "project" || raw === "person" || raw === "studio") return raw;
  return "studio";
}

function normalizeParticipantPersonIds(ids?: string[] | null): string[] {
  if (!ids?.length) return [];
  return [...new Set(ids.map((id) => String(id).trim()).filter((id) => id.length > 0))].sort((a, b) =>
    a.localeCompare(b),
  );
}

/**
 * PostgREST `or()` filter: in-scope project rows for `weddingId`, all studio rows, optional person rows
 * bound to participant ids.
 *
 * @internal Exported for unit tests.
 */
export function replyModeMemoriesOrFilter(weddingId: string, participantPersonIds: string[] = []): string {
  const projectAndStudio = `and(scope.eq.project,wedding_id.eq.${weddingId}),scope.eq.studio`;
  const normalized = normalizeParticipantPersonIds(participantPersonIds);
  if (normalized.length === 0) {
    return projectAndStudio;
  }
  const inList = normalized.join(",");
  return `${projectAndStudio},and(scope.eq.person,person_id.in.(${inList}))`;
}

/**
 * When there is no wedding id but thread participants exist: project (any) + studio + listed person rows.
 *
 * @internal Exported for unit tests.
 */
export function unscopedReplyModeMemoriesOrFilter(participantPersonIds: string[]): string {
  const normalized = normalizeParticipantPersonIds(participantPersonIds);
  if (normalized.length === 0) {
    throw new Error("unscopedReplyModeMemoriesOrFilter: participantPersonIds required");
  }
  const inList = normalized.join(",");
  return `and(scope.eq.person,person_id.in.(${inList})),scope.eq.project,scope.eq.studio`;
}

/**
 * Header-scan: load durable memory titles for orchestrator context without full blobs.
 * Reply-mode filtering:
 * - Always tenant-scoped and non-archived (`archived_at IS NULL`).
 * - With `weddingId`: project rows for that wedding, all studio rows, and `person` rows whose `person_id`
 *   is in `replyModeParticipantPersonIds` (when non-empty).
 * - Without `weddingId` but with participant ids: `person` rows for those ids, plus all project and studio.
 * - Without `weddingId` and no participant ids: all project + studio (excludes person), legacy breadth.
 */
export async function fetchMemoryHeaders(
  supabase: SupabaseClient,
  photographerId: string,
  weddingId?: string | null,
  options?: FetchMemoryHeadersOptions,
): Promise<MemoryHeader[]> {
  const participantIds = normalizeParticipantPersonIds(options?.replyModeParticipantPersonIds);
  const effectiveWeddingId = typeof weddingId === "string" && weddingId.length > 0 ? weddingId : null;

  let query = supabase
    .from("memories")
    .select("id, wedding_id, scope, person_id, type, title, summary")
    .eq("photographer_id", photographerId)
    .is("archived_at", null);

  if (effectiveWeddingId) {
    query = query.or(replyModeMemoriesOrFilter(effectiveWeddingId, participantIds));
  } else if (participantIds.length > 0) {
    query = query.or(unscopedReplyModeMemoriesOrFilter(participantIds));
  } else {
    query = query.neq("scope", "person");
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`fetchMemoryHeaders: ${error.message}`);
  }

  const rows = (data ?? []) as Record<string, unknown>[];
  return rows.map((r) => ({
    id: String(r.id ?? ""),
    wedding_id:
      r.wedding_id != null && String(r.wedding_id).trim() !== "" ? String(r.wedding_id).trim() : null,
    person_id:
      r.person_id != null && String(r.person_id).trim() !== "" ? String(r.person_id).trim() : null,
    scope: parseScope(r.scope),
    type: String(r.type ?? ""),
    title: String(r.title ?? ""),
    summary: String(r.summary ?? ""),
  }));
}
