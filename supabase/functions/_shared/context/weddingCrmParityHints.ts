import type { AgentContext } from "../../../../src/types/agent.types.ts";

/**
 * Phase 2 Slice A4 — compact CRM facts aligned with legacy specialist reads (no story_notes / blobs).
 * Used for orchestrator `heavyContextSummary` / shadow QA only.
 */
export type WeddingCrmParityHints = {
  weddingId: string;
  balanceDue: number | null;
  strategicPause: boolean;
  compassionPause: boolean;
  packageName: string | null;
  stage: string;
};

export function buildWeddingCrmParityHints(
  weddingId: string | null,
  crmSnapshot: AgentContext["crmSnapshot"],
): WeddingCrmParityHints | null {
  if (!weddingId || !crmSnapshot || Object.keys(crmSnapshot).length === 0) {
    return null;
  }
  const sid = crmSnapshot.id;
  if (typeof sid !== "string" || sid !== weddingId) {
    return null;
  }
  const balanceRaw = crmSnapshot.balance_due;
  const balanceDue =
    typeof balanceRaw === "number" && Number.isFinite(balanceRaw) ? balanceRaw : null;
  return {
    weddingId,
    balanceDue,
    strategicPause: crmSnapshot.strategic_pause === true,
    compassionPause: crmSnapshot.compassion_pause === true,
    packageName: typeof crmSnapshot.package_name === "string" ? crmSnapshot.package_name : null,
    stage: typeof crmSnapshot.stage === "string" ? crmSnapshot.stage : "unknown",
  };
}
