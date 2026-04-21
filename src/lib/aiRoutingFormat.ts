/** 0–1 score → 0–100 display, or null if missing / invalid (matches inbox routing UI). */
export function routingConfidencePercent(score: unknown): number | null {
  if (typeof score !== "number" || Number.isNaN(score)) return null;
  return Math.round(Math.max(0, Math.min(1, score)) * 100);
}
