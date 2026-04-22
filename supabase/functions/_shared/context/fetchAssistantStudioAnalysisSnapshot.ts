/**
 * Slice 12 — bounded read-only aggregates over `weddings` (+ open task/escalation counts) for operator studio analysis. Tenant-scoped.
 */
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { AssistantStudioAnalysisSnapshot } from "../../../../src/types/assistantContext.types.ts";

const MONTHS_LOOKBACK = 24;
const MAX_FETCH = 200;
const SAMPLE_IN_PROMPT = 12;

const POST_BOOKED_STAGES = new Set([
  "booked",
  "prep",
  "final_balance",
  "delivered",
]);

type WeddingRow = {
  id: string;
  couple_names: string;
  stage: string;
  wedding_date: string | null;
  event_start_date: string | null;
  project_type: string;
  package_name: string | null;
  contract_value: number | null;
  balance_due: number | null;
  location: string;
};

function monthCutoff(now: Date): Date {
  const d = new Date(now);
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCMonth(d.getUTCMonth() - MONTHS_LOOKBACK);
  return d;
}

function effectiveDateForWindow(r: WeddingRow): string | null {
  return (r.wedding_date ?? r.event_start_date) ?? null;
}

function inWindow(r: WeddingRow, cutoff: Date): boolean {
  const ed = effectiveDateForWindow(r);
  if (ed == null) return true;
  const t = new Date(ed + (ed.length <= 10 ? "T12:00:00.000Z" : ""));
  return t >= cutoff;
}

/**
 * Fetches a bounded set of `weddings` for the tenant, filters to a rolling `MONTHS_LOOKBACK` window, and returns aggregates.
 */
export async function fetchAssistantStudioAnalysisSnapshot(
  supabase: SupabaseClient,
  photographerId: string,
  now: Date = new Date(),
): Promise<AssistantStudioAnalysisSnapshot> {
  const cutoff = monthCutoff(now);
  const cutoffIso = cutoff.toISOString().slice(0, 10);

  const { data: raw, error } = await supabase
    .from("weddings")
    .select(
      "id, couple_names, stage, wedding_date, event_start_date, project_type, package_name, contract_value, balance_due, location",
    )
    .eq("photographer_id", photographerId)
    .order("wedding_date", { ascending: false, nullsLast: true })
    .order("id", { ascending: true })
    .limit(MAX_FETCH);

  if (error) {
    throw new Error(`fetchAssistantStudioAnalysisSnapshot weddings: ${error.message}`);
  }

  const rows = (raw ?? []) as unknown as WeddingRow[];
  const windowRows = rows.filter((r) => inWindow(r, cutoff));

  const stageDistribution: Record<string, number> = {};
  for (const r of windowRows) {
    const k = (r.stage ?? "").trim() || "(unknown)";
    stageDistribution[k] = (stageDistribution[k] ?? 0) + 1;
  }
  const byStage = Object.entries(stageDistribution)
    .map(([stage, count]) => ({ stage, count }))
    .sort((a, b) => b.count - a.count);

  const projectTypeMap: Record<string, number> = {};
  for (const r of windowRows) {
    const k = (r.project_type ?? "").trim() || "(unknown)";
    projectTypeMap[k] = (projectTypeMap[k] ?? 0) + 1;
  }
  const projectTypeMix = Object.entries(projectTypeMap)
    .map(([project_type, count]) => ({ project_type, count }))
    .sort((a, b) => b.count - a.count);

  const signed = windowRows.filter((r) => POST_BOOKED_STAGES.has(r.stage));
  const withContract = signed.filter((r) => r.contract_value != null && Number.isFinite(r.contract_value));
  const values = withContract.map((r) => r.contract_value as number);
  const contractStats =
    values.length > 0
      ? (() => {
          const min = Math.min(...values);
          const max = Math.max(...values);
          const sum = values.reduce((a, b) => a + b, 0);
          return { count: values.length, min, max, sum, avg: sum / values.length };
        })()
      : null;

  const withBalance = windowRows.filter((r) => r.balance_due != null && Number.isFinite(r.balance_due) && (r.balance_due as number) > 0);
  const balanceStats =
    withBalance.length > 0
      ? {
          count: withBalance.length,
          sum: withBalance.reduce((a, r) => a + (r.balance_due as number), 0),
        }
      : null;

  const packageMap = new Map<string, { count: number; contractSum: number; contractN: number }>();
  for (const r of signed) {
    if (r.package_name == null || !String(r.package_name).trim()) continue;
    const pk = String(r.package_name).trim();
    const cur = packageMap.get(pk) ?? { count: 0, contractSum: 0, contractN: 0 };
    cur.count += 1;
    if (r.contract_value != null && Number.isFinite(r.contract_value)) {
      cur.contractSum += r.contract_value as number;
      cur.contractN += 1;
    }
    packageMap.set(pk, cur);
  }
  const packageMixBooked = [...packageMap.entries()]
    .map(([package_name, v]) => ({
      package_name,
      count: v.count,
      avgContractValue: v.contractN > 0 ? v.contractSum / v.contractN : null,
    }))
    .sort((a, b) => b.count - a.count);

  const withLoc = windowRows.filter((r) => (r.location ?? "").trim().length > 0);
  const locationHint =
    "Location is free text in CRM. This snapshot only reports whether a non-empty location is stored, not true destination travel vs local (no boolean field).";

  const [openTasksRes, openEscsRes] = await Promise.all([
    supabase
      .from("tasks")
      .select("id", { count: "exact", head: true })
      .eq("photographer_id", photographerId)
      .eq("status", "open"),
    supabase
      .from("escalation_requests")
      .select("id", { count: "exact", head: true })
      .eq("photographer_id", photographerId)
      .eq("status", "open"),
  ]);

  if (openTasksRes.error) {
    throw new Error(`fetchAssistantStudioAnalysisSnapshot tasks count: ${openTasksRes.error.message}`);
  }
  if (openEscsRes.error) {
    throw new Error(`fetchAssistantStudioAnalysisSnapshot escalations count: ${openEscsRes.error.message}`);
  }

  const rowSamples = windowRows.slice(0, SAMPLE_IN_PROMPT).map((r) => ({
    id: r.id,
    couple_names: r.couple_names,
    stage: r.stage,
    project_type: r.project_type,
    wedding_date: r.wedding_date,
    package_name: r.package_name,
    contract_value: r.contract_value,
    balance_due: r.balance_due,
    location: (r.location ?? "").trim() ? (r.location ?? "").trim() : "(empty)",
  }));

  return {
    fetchedAt: now.toISOString(),
    window: { monthsBack: MONTHS_LOOKBACK, cutoffDateIso: cutoffIso },
    projectCount: windowRows.length,
    stageDistribution,
    byStage,
    projectTypeMix,
    packageMixBooked,
    contractStats,
    balanceStats,
    openTasksCount: openTasksRes.count ?? 0,
    openEscalationsCount: openEscsRes.count ?? 0,
    locationCoverage: { withLocationCount: withLoc.length, total: windowRows.length, note: locationHint },
    rowSamples,
  };
}
