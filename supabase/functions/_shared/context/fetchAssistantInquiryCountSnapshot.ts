import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { AssistantOperatorInquiryCountSnapshot } from "../../../../src/types/assistantContext.types.ts";
import { isOperatorInquiryArrivalThread } from "../../../../src/lib/operatorInquiryArrivalThread.ts";
import {
  computeUtcInquiryCountWindows,
  formatUtcWindowLabelForOperator,
  toUtcIsoString,
} from "../../../../src/lib/operatorInquiryCountWindows.ts";
const MAX_VIEW_ROWS = 8000;

const IDLE: AssistantOperatorInquiryCountSnapshot = {
  didRun: false,
  computedAt: "1970-01-01T00:00:00.000Z",
  timezoneNote: "UTC calendar windows (not studio local time).",
  semanticsNote:
    "Not run — only pre-booking inquiries: linked `weddings.stage` in inquiry pipeline stages, or unlinked `customer_lead` (same as `deriveInboxThreadBucket`).",
  windows: {
    today: { label: "", startIso: "", endIso: "", count: 0 },
    yesterday: { label: "", startIso: "", endIso: "", count: 0 },
    thisWeek: { label: "", startIso: "", endIso: "", count: 0 },
    lastWeek: { label: "", startIso: "", endIso: "", count: 0 },
  },
  comparison: { todayMinusYesterday: null },
  rowCountLoaded: 0,
  truncated: false,
};

export const IDLE_ASSISTANT_INQUIRY_COUNT_SNAPSHOT = IDLE;

function inHalfOpenUtc(ts: string, start: Date, end: Date): boolean {
  const t = Date.parse(ts);
  return t >= start.getTime() && t < end.getTime();
}

/**
 * Bounded counts of **new** inquiry arrivals (first client inbound on a thread) in UTC windows.
 * Grounded in `messages` (first inbound) + `threads` + `weddings.stage` / inbox bucket rules.
 */
export async function fetchAssistantInquiryCountSnapshot(
  supabase: SupabaseClient,
  photographerId: string,
  input: { now?: Date },
): Promise<AssistantOperatorInquiryCountSnapshot> {
  const now = input.now ?? new Date();
  const w = computeUtcInquiryCountWindows(now);
  const todayStart = new Date(w.today.start);
  const todayEnd = new Date(w.today.end);
  const yesterdayStart = new Date(w.yesterday.start);
  const thisWeekStart = new Date(w.thisWeek.start);
  const lastWeekStart = new Date(w.lastWeek.start);
  const lastWeekEnd = new Date(w.lastWeek.end);

  const { data, error } = await supabase
    .from("v_thread_first_inbound_at")
    .select("thread_id, first_inbound_at, wedding_id, wedding_stage, ai_routing_metadata, kind")
    .eq("photographer_id", photographerId)
    .neq("kind", "other")
    .gte("first_inbound_at", w.dbLookbackStart)
    .order("first_inbound_at", { ascending: false })
    .limit(MAX_VIEW_ROWS + 1);

  if (error) {
    throw new Error(`fetchAssistantInquiryCountSnapshot: ${error.message}`);
  }

  const rows = data ?? [];
  const truncated = rows.length > MAX_VIEW_ROWS;
  const usable = truncated ? rows.slice(0, MAX_VIEW_ROWS) : rows;

  let cToday = 0;
  let cYesterday = 0;
  let cThisWeek = 0;
  let cLastWeek = 0;

  for (const r of usable) {
    const row = r as Record<string, unknown>;
    const ts = String(row.first_inbound_at ?? "");
    if (!ts) continue;
    const weddingId = row.wedding_id != null ? String(row.wedding_id) : null;
    const weddingStage = row.wedding_stage != null ? String(row.wedding_stage) : null;
    if (
      !isOperatorInquiryArrivalThread({
        weddingId,
        weddingStage,
        ai_routing_metadata: row.ai_routing_metadata,
      })
    ) {
      continue;
    }

    if (inHalfOpenUtc(ts, todayStart, todayEnd)) cToday += 1;
    if (inHalfOpenUtc(ts, yesterdayStart, todayStart)) cYesterday += 1;
    const tMs = Date.parse(ts);
    if (tMs >= thisWeekStart.getTime() && tMs <= now.getTime()) cThisWeek += 1;
    if (inHalfOpenUtc(ts, lastWeekStart, lastWeekEnd)) cLastWeek += 1;
  }

  const semanticsNote =
    "Pre-booking inquiries only: linked projects with `weddings.stage` in inquiry / consultation / proposal_sent / contract_out, or unlinked threads with inquiry bucket (`customer_lead`). Based on **first inbound** message time (`direction=in`) per thread.";

  return {
    didRun: true,
    computedAt: toUtcIsoString(now),
    timezoneNote: "UTC calendar windows (not studio local time).",
    semanticsNote,
    windows: {
      today: {
        label: formatUtcWindowLabelForOperator(w.today.start, w.today.end, false),
        startIso: w.today.start,
        endIso: w.today.end,
        count: cToday,
      },
      yesterday: {
        label: formatUtcWindowLabelForOperator(w.yesterday.start, w.yesterday.end, false),
        startIso: w.yesterday.start,
        endIso: w.yesterday.end,
        count: cYesterday,
      },
      thisWeek: {
        label: formatUtcWindowLabelForOperator(w.thisWeek.start, w.thisWeek.end, true),
        startIso: w.thisWeek.start,
        endIso: w.thisWeek.end,
        count: cThisWeek,
      },
      lastWeek: {
        label: formatUtcWindowLabelForOperator(w.lastWeek.start, w.lastWeek.end, false),
        startIso: w.lastWeek.start,
        endIso: w.lastWeek.end,
        count: cLastWeek,
      },
    },
    comparison: { todayMinusYesterday: cToday - cYesterday },
    rowCountLoaded: usable.length,
    truncated,
  };
}
