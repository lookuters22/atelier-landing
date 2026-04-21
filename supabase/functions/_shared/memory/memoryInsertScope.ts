import type { Database } from "../../../../src/types/database.types.ts";

/** Scopes allowed on insert today (`person` is reserved for future write paths). */
export type MemoryInsertScope = Extract<Database["public"]["Enums"]["memory_scope"], "project" | "studio">;

/**
 * Maps wedding binding to production memory scope for inserts.
 * Person scope is not set here (Slice 4+); do not use this for person-scoped rows.
 */
export function memoryScopeForWeddingBinding(weddingId: string | null | undefined): MemoryInsertScope {
  if (typeof weddingId === "string" && weddingId.trim().length > 0) {
    return "project";
  }
  return "studio";
}
