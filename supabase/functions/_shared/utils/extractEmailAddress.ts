/** Best-effort parse of an email from a From line or bare address. */
export function extractEmailAddress(from: string | null | undefined): string | null {
  if (from == null || !String(from).trim()) return null;
  const t = String(from).trim();
  const angle = t.match(/<([^>]+@[^>]+)>/);
  if (angle?.[1]) return angle[1].trim();
  const bare = t.match(/([\w.+-]+@[\w.-]+\.[a-zA-Z]{2,})/);
  return bare?.[1]?.trim() ?? null;
}
