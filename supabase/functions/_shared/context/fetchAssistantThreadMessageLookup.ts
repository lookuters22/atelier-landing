import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type {
  AssistantOperatorQueryEntityResolution,
  AssistantOperatorThreadMessageLookup,
} from "../../../../src/types/assistantContext.types.ts";
import { computeUtcInquiryCountWindows } from "../../../../src/lib/operatorInquiryCountWindows.ts";
import {
  extractOperatorInboxThreadLookupSignals,
  extractOperatorThreadTitleSearchToken,
  hasOperatorThreadMessageLookupIntent,
  normalizeOperatorInboxMatchText,
  OPERATOR_INBOX_BODY_SNIPPET_CHARS,
  type OperatorInboxThreadLookupSignals,
} from "../../../../src/lib/operatorAssistantThreadMessageLookupIntent.ts";

const MAX_THREADS = 8;
const MAX_PERSON_PARTICIPANT_THREADS = 24;
const MAX_AMBIGUOUS_WEDDINGS = 2;
const RECENT_TENANT_THREADS = 3;
/** Bounded inbox candidates before in-memory score (deterministic order). */
const MAX_INBOX_CANDIDATES = 64;

const IDLE: AssistantOperatorThreadMessageLookup = {
  didRun: false,
  selectionNote: "not run",
  threads: [],
};

type ThreadRow = {
  id: string;
  title: string;
  wedding_id: string | null;
  channel: string;
  kind: string;
  last_activity_at: string;
  last_inbound_at: string | null;
  last_outbound_at: string | null;
};

type InboxViewRow = {
  id: string;
  title: string;
  wedding_id: string | null;
  last_activity_at: string;
  kind: string;
  latest_sender: string | null;
  latest_body: string | null;
};

type ScoredInbox = { row: InboxViewRow; score: number; strong: boolean };

function toPublic(r: ThreadRow) {
  return {
    threadId: r.id,
    title: r.title,
    weddingId: r.wedding_id,
    channel: r.channel,
    kind: r.kind,
    lastActivityAt: r.last_activity_at,
    lastInboundAt: r.last_inbound_at,
    lastOutboundAt: r.last_outbound_at,
  };
}

function dedupeById(rows: ThreadRow[]): ThreadRow[] {
  const m = new Map<string, ThreadRow>();
  for (const r of rows) {
    if (!m.has(r.id)) m.set(r.id, r);
  }
  return [...m.values()].sort(
    (a, b) => b.last_activity_at.localeCompare(a.last_activity_at) || a.id.localeCompare(b.id),
  );
}

/** Dedupe by thread id; keep first-seen order (for inbox score ranking before CRM/wedding rows). */
function mergePreferFirst(primary: ThreadRow[], secondary: ThreadRow[]): ThreadRow[] {
  const seen = new Set<string>();
  const out: ThreadRow[] = [];
  for (const r of primary) {
    if (seen.has(r.id)) continue;
    seen.add(r.id);
    out.push(r);
  }
  for (const r of secondary) {
    if (seen.has(r.id)) continue;
    seen.add(r.id);
    out.push(r);
  }
  return out;
}

function collectWeddingAndPersonIds(
  weddingIdEffective: string | null,
  personIdEffective: string | null,
  entity: AssistantOperatorQueryEntityResolution,
): { weddingIds: string[]; personIds: string[] } {
  const weddingIds: string[] = [];
  if (weddingIdEffective) weddingIds.push(weddingIdEffective);
  if (entity.weddingSignal === "unique" && entity.uniqueWeddingId) {
    weddingIds.push(entity.uniqueWeddingId);
  }
  if (entity.weddingSignal === "ambiguous") {
    for (const c of entity.weddingCandidates.slice(0, MAX_AMBIGUOUS_WEDDINGS)) {
      weddingIds.push(c.weddingId);
    }
  }
  const personIds: string[] = [];
  if (personIdEffective) personIds.push(personIdEffective);
  for (const p of entity.personMatches.slice(0, 2)) {
    personIds.push(p.id);
  }
  return {
    weddingIds: [...new Set(weddingIds)].filter(Boolean),
    personIds: [...new Set(personIds)].filter(Boolean),
  };
}

function mergeSenderSignals(
  base: OperatorInboxThreadLookupSignals,
  entity: AssistantOperatorQueryEntityResolution,
): OperatorInboxThreadLookupSignals {
  const phrases = [...base.senderPhrases];
  for (const p of entity.personMatches) {
    const d = normalizeOperatorInboxMatchText(p.display_name ?? "");
    if (d.length >= 3) phrases.push(d);
    const parts = d.split(" ").filter((x) => x.length >= 4);
    for (const w of parts.slice(0, 3)) {
      if (!phrases.includes(w)) phrases.push(w);
    }
  }
  const senderPhrases = [...new Set(phrases)].slice(0, 8);
  return { ...base, senderPhrases };
}

function inboxHaystack(row: InboxViewRow): { blob: string; titleN: string; senderN: string; bodyN: string } {
  const body = (row.latest_body ?? "").slice(0, OPERATOR_INBOX_BODY_SNIPPET_CHARS);
  const titleN = normalizeOperatorInboxMatchText(row.title ?? "");
  const senderN = normalizeOperatorInboxMatchText(row.latest_sender ?? "");
  const bodyN = normalizeOperatorInboxMatchText(body);
  const blob = `${titleN} ${senderN} ${bodyN}`.trim();
  return { blob, titleN, senderN, bodyN };
}

function activityInRecencyWindow(
  lastActivityIso: string,
  signals: OperatorInboxThreadLookupSignals,
  windows: ReturnType<typeof computeUtcInquiryCountWindows>,
): boolean {
  if (!signals.recency) return false;
  const t = Date.parse(lastActivityIso);
  if (Number.isNaN(t)) return false;
  if (signals.recency === "today") {
    const a = Date.parse(windows.today.start);
    const b = Date.parse(windows.today.end);
    return t >= a && t < b;
  }
  if (signals.recency === "yesterday") {
    const a = Date.parse(windows.yesterday.start);
    const b = Date.parse(windows.yesterday.end);
    return t >= a && t < b;
  }
  const weekStart = Date.parse(windows.thisWeek.start);
  const now = Date.parse(windows.now);
  return t >= weekStart && t <= now;
}

function scoreInboxRow(
  row: InboxViewRow,
  signals: OperatorInboxThreadLookupSignals,
  windows: ReturnType<typeof computeUtcInquiryCountWindows>,
): ScoredInbox {
  const { blob, titleN, senderN, bodyN } = inboxHaystack(row);
  let score = 0;
  let topicHits = 0;
  let senderHit = false;

  for (const kw of signals.topicKeywords) {
    if (kw.length < 4) continue;
    let hit = false;
    if (titleN.includes(kw)) {
      score += 7;
      hit = true;
    } else if (senderN.includes(kw)) {
      score += 5;
      hit = true;
    } else if (bodyN.includes(kw)) {
      score += 4;
      hit = true;
    }
    if (hit) topicHits += 1;
  }

  for (const ph of signals.senderPhrases) {
    const p = ph.trim();
    if (p.length < 3) continue;
    if (p.includes("@")) {
      if (senderN.includes(p) || blob.includes(p)) {
        score += 16;
        senderHit = true;
      }
      continue;
    }
    if (senderN.includes(p)) {
      score += 14;
      senderHit = true;
    } else if (titleN.includes(p)) {
      score += 5;
      senderHit = true;
    } else if (bodyN.includes(p)) {
      score += 3;
      senderHit = true;
    }
  }

  const recencyOk = activityInRecencyWindow(row.last_activity_at, signals, windows);
  if (signals.recency && recencyOk) {
    score += 6;
  }

  const strong =
    topicHits >= 2 ||
    (topicHits >= 1 && senderHit) ||
    (topicHits >= 1 && signals.recency != null && recencyOk) ||
    score >= 18;

  return { row, score, strong: strong && score >= 6 };
}

async function fetchScoredInboxMatches(
  supabase: SupabaseClient,
  photographerId: string,
  signals: OperatorInboxThreadLookupSignals,
  now: Date,
): Promise<ScoredInbox[]> {
  const windows = computeUtcInquiryCountWindows(now);
  let q = supabase
    .from("v_threads_inbox_latest_message")
    .select("id, title, wedding_id, last_activity_at, kind, latest_sender, latest_body")
    .eq("photographer_id", photographerId)
    .neq("kind", "other")
    .order("last_activity_at", { ascending: false })
    .limit(MAX_INBOX_CANDIDATES);

  if (signals.recency === "today") {
    q = q.gte("last_activity_at", windows.today.start).lt("last_activity_at", windows.today.end);
  } else if (signals.recency === "yesterday") {
    q = q
      .gte("last_activity_at", windows.yesterday.start)
      .lt("last_activity_at", windows.yesterday.end);
  } else if (signals.recency === "recent") {
    q = q.gte("last_activity_at", windows.thisWeek.start);
  }

  const { data, error } = await q;
  if (error) {
    throw new Error(`fetchAssistantThreadMessageLookup inbox view: ${error.message}`);
  }
  const rows = (data ?? []) as unknown as InboxViewRow[];
  const scored = rows
    .map((row) => scoreInboxRow(row, signals, windows))
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score || b.row.last_activity_at.localeCompare(a.row.last_activity_at));
  return scored;
}

async function hydrateThreads(
  supabase: SupabaseClient,
  photographerId: string,
  ids: string[],
): Promise<ThreadRow[]> {
  if (ids.length === 0) return [];
  const selectColumns =
    "id, title, wedding_id, channel, kind, last_activity_at, last_inbound_at, last_outbound_at";
  const { data, error } = await supabase
    .from("threads")
    .select(selectColumns)
    .eq("photographer_id", photographerId)
    .in("id", ids);
  if (error) {
    throw new Error(`fetchAssistantThreadMessageLookup threads hydrate: ${error.message}`);
  }
  return (data ?? []) as unknown as ThreadRow[];
}

/**
 * Bounded recent `threads` rows + last inbound/outbound timestamps (from `threads` columns).
 * Tenant-scoped; not full message bodies; no broad scan beyond caps above.
 */
export async function fetchAssistantThreadMessageLookup(
  supabase: SupabaseClient,
  photographerId: string,
  input: {
    queryText: string;
    weddingIdEffective: string | null;
    personIdEffective: string | null;
    operatorQueryEntityResolution: AssistantOperatorQueryEntityResolution;
    /**
     * Operator-assistant read-only tools only: run the bounded thread query even when
     * `hasOperatorThreadMessageLookupIntent` is false (model already chose to look up threads).
     */
    force?: boolean;
    /** UTC "now" for recency windows (today/yesterday); defaults to `new Date()`. */
    now?: Date;
  },
): Promise<AssistantOperatorThreadMessageLookup> {
  const now = input.now ?? new Date();
  const { weddingIds, personIds } = collectWeddingAndPersonIds(
    input.weddingIdEffective,
    input.personIdEffective,
    input.operatorQueryEntityResolution,
  );
  const hasTarget = weddingIds.length > 0 || personIds.length > 0;
  const hasIntent = hasOperatorThreadMessageLookupIntent(input.queryText);

  if (!input.force && !hasIntent) {
    return { ...IDLE, selectionNote: "no thread/message intent" };
  }

  const selectColumns =
    "id, title, wedding_id, channel, kind, last_activity_at, last_inbound_at, last_outbound_at";

  const rows: ThreadRow[] = [];
  const notes: string[] = [];

  if (weddingIds.length > 0) {
    const { data, error } = await supabase
      .from("threads")
      .select(selectColumns)
      .eq("photographer_id", photographerId)
      .in("wedding_id", weddingIds)
      .order("last_activity_at", { ascending: false })
      .limit(MAX_THREADS);
    if (error) {
      throw new Error(`fetchAssistantThreadMessageLookup threads by wedding: ${error.message}`);
    }
    for (const r of data ?? []) {
      rows.push(r as unknown as ThreadRow);
    }
    notes.push(`wedding_id in (${weddingIds.length} id(s))`);
  }

  if (personIds.length > 0) {
    const { data: tp, error: tperr } = await supabase
      .from("thread_participants")
      .select("thread_id")
      .eq("photographer_id", photographerId)
      .in("person_id", personIds)
      .limit(MAX_PERSON_PARTICIPANT_THREADS);
    if (tperr) {
      throw new Error(`fetchAssistantThreadMessageLookup thread_participants: ${tperr.message}`);
    }
    const threadIdSet = new Set(
      (tp ?? []).map((r) => String((r as { thread_id: string }).thread_id ?? "")).filter(Boolean),
    );
    const threadIdList = [...threadIdSet];
    if (threadIdList.length > 0) {
      const { data: trows, error: terr } = await supabase
        .from("threads")
        .select(selectColumns)
        .eq("photographer_id", photographerId)
        .in("id", threadIdList)
        .order("last_activity_at", { ascending: false })
        .limit(MAX_THREADS);
      if (terr) {
        throw new Error(`fetchAssistantThreadMessageLookup threads by person: ${terr.message}`);
      }
      for (const r of trows ?? []) {
        rows.push(r as unknown as ThreadRow);
      }
      notes.push(`person_id → thread_participants (${threadIdList.length} thread id(s))`);
    } else {
      notes.push("person_id → no thread_participants rows in cap");
    }
  }

  if (!hasTarget) {
    const token = extractOperatorThreadTitleSearchToken(input.queryText);
    if (token) {
      const { data, error } = await supabase
        .from("threads")
        .select(selectColumns)
        .eq("photographer_id", photographerId)
        .ilike("title", `%${token.replace(/[%_]/g, "")}%`)
        .order("last_activity_at", { ascending: false })
        .limit(4);
      if (error) {
        throw new Error(`fetchAssistantThreadMessageLookup title ilike: ${error.message}`);
      }
      for (const r of data ?? []) {
        rows.push(r as unknown as ThreadRow);
      }
      notes.push(`title contains token (bounded ilike) "${token}"`);
    } else {
      const { data, error } = await supabase
        .from("v_threads_inbox_latest_message")
        .select("id, title, wedding_id, last_activity_at, kind, photographer_id")
        .eq("photographer_id", photographerId)
        .neq("kind", "other")
        .order("last_activity_at", { ascending: false })
        .limit(RECENT_TENANT_THREADS);
      if (error) {
        throw new Error(`fetchAssistantThreadMessageLookup recent inbox view: ${error.message}`);
      }
      const ids = (data ?? [])
        .map((r) => (r as { id: string | null }).id)
        .filter((x): x is string => x != null && String(x).length > 0);
      if (ids.length > 0) {
        const hydrated = await hydrateThreads(supabase, photographerId, ids);
        for (const r of hydrated) {
          rows.push(r);
        }
      }
      notes.push("no project/person target — recent tenant threads (inbox view order)");
    }
  }

  let merged = dedupeById(rows);

  const rawSignals = extractOperatorInboxThreadLookupSignals(input.queryText);
  const signals = mergeSenderSignals(rawSignals, input.operatorQueryEntityResolution);
  const shouldRunInboxScore =
    signals.topicKeywords.length > 0 ||
    signals.senderPhrases.length > 0 ||
    signals.recency != null;

  if (shouldRunInboxScore) {
    const scored = await fetchScoredInboxMatches(supabase, photographerId, signals, now);
    const strong = scored.filter((s) => s.strong);
    const weak = scored.filter((s) => !s.strong && s.score >= 8);
    const pickIds = [...strong, ...weak].map((s) => s.row.id);
    if (pickIds.length > 0) {
      const inboxHydrated = await hydrateThreads(supabase, photographerId, pickIds);
      const byId = new Map(inboxHydrated.map((t) => [t.id, t]));
      const ordered: ThreadRow[] = [];
      for (const id of pickIds) {
        const t = byId.get(id);
        if (t) ordered.push(t);
      }
      if (ordered.length > 0) {
        const strongCount = strong.length;
        merged = mergePreferFirst(ordered, merged).slice(0, MAX_THREADS);
        if (strongCount > 0) {
          notes.push(
            `inbox_scored_preferred (${strongCount} strong / ${scored.length} scored; keywords=${signals.topicKeywords.length}; recency=${signals.recency ?? "none"})`,
          );
        } else if (rows.length === 0) {
          notes.push(`inbox_scored_fallback (${scored.length} scored; weak only)`);
        } else {
          notes.push(
            `inbox_scored_prepend (${scored.length} scored weak; keywords=${signals.topicKeywords.length}; recency=${signals.recency ?? "none"})`,
          );
        }
      }
    } else if (signals.recency != null) {
      notes.push("inbox_scored_no_hits_in_window");
    }
  }

  merged = merged.slice(0, MAX_THREADS);

  if (merged.length === 0) {
    return {
      didRun: true,
      selectionNote: notes.join("; "),
      threads: [],
    };
  }

  return {
    didRun: true,
    selectionNote: notes.length > 0 ? notes.join("; ") : "threads matched",
    threads: merged.map(toPublic),
  };
}

export const IDLE_ASSISTANT_THREAD_MESSAGE_LOOKUP = IDLE;
