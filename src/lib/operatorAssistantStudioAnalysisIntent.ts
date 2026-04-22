/**
 * Deterministic gate: load bounded studio-analysis snapshot (tenant CRM) only for clear analytical questions.
 * Operator assistant only; not fuzzy classification.
 */
export function shouldLoadStudioAnalysisSnapshotForQuery(queryText: string): boolean {
  const t = queryText.trim().toLowerCase();
  if (t.length < 8) return false;

  // Light chat / navigation-only — avoid loading expensive aggregates.
  if (/^(hi|hello|hey|thanks|thank you|ok|okay)[\s!.?]*$/i.test(t)) return false;

  const patterns: RegExp[] = [
    /\b(should|ought)\b[^?.!]{0,80}\b(prices?|pricing|rates?|fees?|packages?|charging)\b/,
    /\b(are|am|is)\s+we\b[^?.!]{0,80}\b(undercharging|overcharging|under-?chargin\w*|over-?chargin\w*|charging enough|competitive|too high|too low)\b/,
    /\b(raise|lower|increase|decrease|cut)\b[^?.!]{0,40}\b(prices?|pricing|rates?|fees?|packages?|our rates?)\b/,
    /\bwhich\s+package|package(?:es)?\s+that|packages?\s+convert|conversion|convert(?:s|ed)?\s+best|funnel|pipeline (stats|mix|stages?)|by stage|stage distribution|stage mix\b/,
    /\b(average|median|typical|mean)\b[^?.!]{0,60}\b(contract|revenue|fee|pric|balance|booking)\b/,
    /\b(recent|our) data|data (say|suggest|show|tells?)|evidence (from|in) (our|the studio)|worth it for|financially|margin|\brevenue\b|profit|\broi\b/,
    /\b(under-?selling|leaving money|discount(ed)? too (much|often)|too (cheap|expensive))\b/,
    /\bdestination|local (vs?|versus)|travel|multi-?day (event|gig|shoot)\b[^?.!]{0,80}\b(worth|profit|revenue|margin|us)\b/,
    /\bproject type mix|wedding(s)? vs|portrait|commercial|editorial|mix of projects\b/,
    /\bhow(\'s|s)\b[^?.!]{0,40}business|studio performance|studio doing\b/,
  ];

  return patterns.some((r) => r.test(t));
}
