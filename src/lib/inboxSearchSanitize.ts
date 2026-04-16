/**
 * Prepares user input for PostgREST `ilike` patterns and `or=(...)` filters.
 * Strips characters that break LIKE / comma-separated `or` clauses.
 */
export function sanitizeInboxSearchForIlike(input: string): string {
  const t = input
    .trim()
    .slice(0, 160)
    .replace(/[%_,]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return t;
}
