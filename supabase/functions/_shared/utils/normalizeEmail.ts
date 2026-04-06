/**
 * Canonical email form for deduplication and tenant-scoped lookups.
 * Matches DATABASE_SCHEMA contact_points rules: lowercase, trimmed.
 */
export function normalizeEmail(input: string | null | undefined): string {
  if (input == null) return "";
  return input.trim().toLowerCase();
}
