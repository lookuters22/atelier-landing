/**
 * Deterministic gate for whether the operator-assistant prompt should embed the full app catalog JSON.
 * Narrow, keyword/regex based — not fuzzy ML classification.
 */
export function shouldIncludeAppCatalogInOperatorPrompt(queryText: string): boolean {
  const q = queryText.trim().toLowerCase();
  if (q.length === 0) return false;

  if (/\bwhere\s+(do\s+i|is|are|can\s+i|should\s+i|did)\b/.test(q)) return true;
  if (/\bhow\s+do\s+i\b/.test(q)) return true;
  if (/\bhow\s+to\s+(find|open|get\s+to|navigate|use|go\s+to)\b/.test(q)) return true;

  if (/\b(which|what)\s+(tab|page|route|section|menu|screen|view|label)\b/.test(q)) return true;

  if (/\bwhat\s+(does|do)\b[^?.!\n]*\bmean\b/.test(q)) return true;
  if (/\bwhat\s+is\s+(the\s+)?(needs filing|operator review|inquiry|draft|escalation|zen|pipeline)\b/.test(q)) {
    return true;
  }
  if (/\bwhat(?:'s|s)\s+(needs filing|operator review|inquiry|drafts)\b/.test(q)) return true;

  if (/\b(this app|in the app|the app|in the studio app|in atelier|the ui|user interface|left rail|navigation dock|ana routing)\b/.test(q)) {
    if (/\b(find|open|go to|go|where|how|navigate|tab|page|menu|settings|onboarding|dock|sidebar|rail|click|section)\b/.test(q)) {
      return true;
    }
  }

  if (/\b(ana routing|left rail|navigation dock|inbox bucket|zen tab|app help|in-repo catalog)\b/.test(q)) return true;

  return false;
}
