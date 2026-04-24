/**
 * Tenant-bounded deterministic inquiry → existing project matching (no LLM).
 * Reuses confidence bands aligned with bounded unresolved matchmaker: auto ≥90, near [75,90) → operator approval.
 */
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import {
  BOUNDED_UNRESOLVED_MATCH_APPROVAL_ESCALATION_MIN_CONFIDENCE,
  BOUNDED_UNRESOLVED_MATCH_AUTO_RESOLVE_MIN_CONFIDENCE,
} from "./triageRoutingFlags.ts";
import { normalizeEmail } from "../utils/normalizeEmail.ts";
import { weddingEmailGraphContainsAnyCandidate } from "../identity/identityEmailLookupCandidates.ts";

export const DETERMINISTIC_INQUIRY_DEDUP_MAX_PROJECTS = 200;

const TOPIC_STOP = new Set([
  "the",
  "and",
  "for",
  "our",
  "you",
  "your",
  "are",
  "was",
  "but",
  "not",
  "with",
  "from",
  "this",
  "that",
  "have",
  "has",
  "will",
  "can",
  "wedding",
  "day",
  "shoot",
  "photo",
  "video",
  "session",
  "inquiry",
  "inquiries",
]);

export type DedupWeddingSnapshot = {
  id: string;
  couple_names: string;
  wedding_date: string | null;
  location: string;
  project_type: string;
  event_start_date: string | null;
  event_end_date: string | null;
};

export type DeterministicInquiryDedupRunResult =
  | { kind: "skipped" }
  | {
      kind: "no_match";
      trace: Record<string, unknown>;
    }
  | {
      kind: "auto";
      weddingId: string;
      score: number;
      signals: string[];
      reasoning: string;
      trace: Record<string, unknown>;
    }
  | {
      kind: "near_match";
      weddingId: string;
      score: number;
      signals: string[];
      reasoning: string;
      trace: Record<string, unknown>;
    };

export function normalizeHaystackForDedup(subject: string, body: string): string {
  return `${subject}\n${body}`.trim().toLowerCase();
}

export function tokenizeMeaningful(raw: string, minLen: number): string[] {
  const t = raw
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s&]/gu, " ")
    .split(/[\s/&,]+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= minLen && !TOPIC_STOP.has(s));
  return [...new Set(t)];
}

export function extractNameTokens(coupleNames: string, displayNames: readonly string[]): string[] {
  const parts = coupleNames
    .split(/[&,\/]|(?:\s+and\s+)|(?:\s*\+\s*)/i)
    .flatMap((p) => p.trim())
    .filter(Boolean);
  const fromCouple = parts.flatMap((p) => tokenizeMeaningful(p, 2));
  const fromPeople = displayNames.flatMap((d) => tokenizeMeaningful(d, 2));
  return [...new Set([...fromCouple, ...fromPeople])];
}

export function extractLocationTokens(location: string): string[] {
  return tokenizeMeaningful(location.replace(/,/g, " "), 3);
}

export function parseNumericDatesFromText(text: string): Date[] {
  const out: Date[] = [];
  const s = String(text ?? "");

  for (const m of s.matchAll(/\b(20\d{2})-(\d{2})-(\d{2})\b/g)) {
    const d = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    if (!Number.isNaN(d)) out.push(new Date(d));
  }

  for (const m of s.matchAll(/\b(\d{1,2})[\/\-](\d{1,2})[\/\-](20\d{2}|\d{2})\b/g)) {
    let y = Number(m[3]);
    if (y < 100) y += 2000;
    const mo = Number(m[1]);
    const day = Number(m[2]);
    if (mo >= 1 && mo <= 12 && day >= 1 && day <= 31) {
      const d = Date.UTC(y, mo - 1, day);
      if (!Number.isNaN(d)) out.push(new Date(d));
    }
  }

  return out;
}

function utcDayMs(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

function parseIsoDateOnly(iso: string | null | undefined): Date | null {
  if (!iso || typeof iso !== "string") return null;
  const day = iso.slice(0, 10);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!m) return null;
  const d = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d) ? null : new Date(d);
}

export function scoreDateProximity(
  haystackDates: Date[],
  weddingDate: string | null,
  eventStart: string | null,
  eventEnd: string | null,
): { score: number; matched: boolean } {
  const targets = [weddingDate, eventStart, eventEnd]
    .map((x) => parseIsoDateOnly(x))
    .filter((x): x is Date => x != null);
  if (targets.length === 0 || haystackDates.length === 0) return { score: 0, matched: false };

  let bestDiff = Infinity;
  for (const h of haystackDates) {
    const hu = utcDayMs(h);
    for (const t of targets) {
      const tu = utcDayMs(t);
      bestDiff = Math.min(bestDiff, Math.abs(hu - tu) / 86400000);
    }
  }
  if (bestDiff <= 1) return { score: 26, matched: true };
  if (bestDiff <= 7) return { score: 22, matched: true };
  if (bestDiff <= 14) return { score: 12, matched: true };
  return { score: 0, matched: false };
}

export function scoreNameOverlap(nameTokens: string[], haystack: string): { hits: number; score: number } {
  let hits = 0;
  for (const tok of nameTokens) {
    if (tok.length >= 2 && haystack.includes(tok)) hits++;
  }
  if (hits >= 4) return { hits, score: 46 };
  if (hits === 3) return { hits, score: 38 };
  if (hits === 2) return { hits, score: 28 };
  if (hits === 1) return { hits, score: 10 };
  return { hits, score: 0 };
}

export function scoreLocationOverlap(locationTokens: string[], haystack: string): { hits: number; score: number } {
  let hits = 0;
  for (const tok of locationTokens) {
    if (tok.length >= 3 && haystack.includes(tok)) hits++;
  }
  if (hits >= 3) return { hits, score: 40 };
  if (hits === 2) return { hits, score: 34 };
  if (hits === 1) return { hits, score: 12 };
  return { hits, score: 0 };
}

export type WeddingEmailGraph = {
  weddingIdToEmails: Map<string, Set<string>>;
  weddingIdToDisplayNames: Map<string, string[]>;
};

export type BuildWeddingEmailGraphResult =
  | { ok: true; graph: WeddingEmailGraph }
  | { ok: false; reason: string };

/** Pure scoring + policy — unit-tested without DB. */
export function computeDeterministicInquiryDedup(input: {
  normalizedSender: string;
  subject: string;
  body: string;
  weddings: DedupWeddingSnapshot[];
  weddingIdToEmails: Map<string, Set<string>>;
  weddingIdToDisplayNames: Map<string, string[]>;
}): DeterministicInquiryDedupRunResult {
  const { normalizedSender, subject, body, weddings } = input;
  const haystack = normalizeHaystackForDedup(subject, body);
  const haystackDates = parseNumericDatesFromText(`${subject}\n${body}`);

  if (weddings.length === 0) {
    return {
      kind: "no_match",
      trace: { outcome: "no_active_projects", projects_considered: 0 },
    };
  }

  const emailMatches = normalizedSender
    ? weddings
        .filter((w) => weddingEmailGraphContainsAnyCandidate(input.weddingIdToEmails.get(w.id), normalizedSender))
        .map((w) => w.id)
        .sort()
    : [];

  if (emailMatches.length >= 2) {
    const weddingId = emailMatches[0]!;
    const reasoning = `deterministic_inquiry_dedup: sender email matches multiple active projects; operator approval required (${weddingId}).`;
    return {
      kind: "near_match",
      weddingId,
      score: 77,
      signals: ["sender_email_multi_project"],
      reasoning,
      trace: {
        outcome: "near_match",
        reason: "sender_email_multi_project",
        candidate_wedding_id: weddingId,
        ambiguous_candidate_ids: emailMatches,
        score: 77,
      },
    };
  }

  if (emailMatches.length === 1) {
    const weddingId = emailMatches[0]!;
    const reasoning = `deterministic_inquiry_dedup: sender email linked to existing project via client/contact graph (${weddingId}).`;
    return {
      kind: "auto",
      weddingId,
      score: 94,
      signals: ["sender_email_on_project"],
      reasoning,
      trace: {
        outcome: "auto_linked",
        reason: "sender_email_on_project",
        candidate_wedding_id: weddingId,
        score: 94,
      },
    };
  }

  type RowScore = {
    id: string;
    nameScore: number;
    locScore: number;
    dateScore: number;
    total: number;
    signals: string[];
  };

  const rows: RowScore[] = [];

  for (const w of weddings) {
    const nameToks = extractNameTokens(
      w.couple_names,
      input.weddingIdToDisplayNames.get(w.id) ?? [],
    );
    const locToks = extractLocationTokens(w.location);
    const ns = scoreNameOverlap(nameToks, haystack);
    const ls = scoreLocationOverlap(locToks, haystack);
    const ds = scoreDateProximity(haystackDates, w.wedding_date, w.event_start_date, w.event_end_date);
    const total = Math.min(100, ns.score + ls.score + ds.score);
    const signals: string[] = [];
    if (ns.hits > 0) signals.push(`name_tokens_${ns.hits}`);
    if (ls.hits > 0) signals.push(`location_tokens_${ls.hits}`);
    if (ds.matched) signals.push("date_proximity");
    if (w.project_type && w.project_type !== "wedding") signals.push(`project_type_${w.project_type}`);
    rows.push({
      id: w.id,
      nameScore: ns.score,
      locScore: ls.score,
      dateScore: ds.score,
      total,
      signals,
    });
  }

  rows.sort((a, b) => b.total - a.total || a.id.localeCompare(b.id));
  const first = rows[0]!;
  const second = rows[1];

  if (first.total < BOUNDED_UNRESOLVED_MATCH_APPROVAL_ESCALATION_MIN_CONFIDENCE) {
    return {
      kind: "no_match",
      trace: {
        outcome: "below_near_threshold",
        best_score: first.total,
        best_wedding_id: first.id,
        projects_considered: weddings.length,
      },
    };
  }

  if (
    first.total >= BOUNDED_UNRESOLVED_MATCH_AUTO_RESOLVE_MIN_CONFIDENCE &&
    second &&
    first.total - second.total < 4
  ) {
    const reasoning = `deterministic_inquiry_dedup: top text signals tied within margin; operator approval (${first.id}).`;
    return {
      kind: "near_match",
      weddingId: first.id,
      score: 78,
      signals: [...first.signals, "ambiguous_top_tie"],
      reasoning,
      trace: {
        outcome: "near_match",
        reason: "ambiguous_top_tie",
        candidate_wedding_id: first.id,
        score: 78,
        tied_with: second.id,
      },
    };
  }

  const textAuto =
    first.nameScore >= 36 &&
    first.locScore >= 32 &&
    first.dateScore >= 18 &&
    first.total >= BOUNDED_UNRESOLVED_MATCH_AUTO_RESOLVE_MIN_CONFIDENCE;

  if (textAuto) {
    const reasoning = `deterministic_inquiry_dedup: strong name+location+date alignment to existing project (${first.id}); score=${first.total}.`;
    return {
      kind: "auto",
      weddingId: first.id,
      score: Math.max(first.total, 92),
      signals: first.signals,
      reasoning,
      trace: {
        outcome: "auto_linked",
        reason: "text_signals_high",
        candidate_wedding_id: first.id,
        score: Math.max(first.total, 92),
        breakdown: { name: first.nameScore, location: first.locScore, date: first.dateScore },
      },
    };
  }

  if (first.total >= BOUNDED_UNRESOLVED_MATCH_APPROVAL_ESCALATION_MIN_CONFIDENCE) {
    const reasoning = `deterministic_inquiry_dedup: partial alignment to project ${first.id} (score ${first.total}); operator approval.`;
    return {
      kind: "near_match",
      weddingId: first.id,
      score: first.total,
      signals: first.signals,
      reasoning,
      trace: {
        outcome: "near_match",
        reason: "text_signals_partial",
        candidate_wedding_id: first.id,
        score: first.total,
        breakdown: { name: first.nameScore, location: first.locScore, date: first.dateScore },
      },
    };
  }

  return {
    kind: "no_match",
    trace: {
      outcome: "below_near_threshold",
      best_score: first.total,
      best_wedding_id: first.id,
      projects_considered: weddings.length,
    },
  };
}

export async function buildWeddingEmailGraph(
  supabase: SupabaseClient,
  input: { photographerId: string; weddingIds: string[] },
): Promise<BuildWeddingEmailGraphResult> {
  const weddingIdToEmails = new Map<string, Set<string>>();
  const weddingIdToDisplayNames = new Map<string, string[]>();
  const addEmail = (wid: string, em: string) => {
    const n = normalizeEmail(em);
    if (!n) return;
    const s = weddingIdToEmails.get(wid) ?? new Set();
    s.add(n);
    weddingIdToEmails.set(wid, s);
  };

  if (input.weddingIds.length === 0) {
    return { ok: true, graph: { weddingIdToEmails, weddingIdToDisplayNames } };
  }

  const { data: clientRows, error: clientsErr } = await supabase
    .from("clients")
    .select("wedding_id, email")
    .in("wedding_id", input.weddingIds)
    .not("email", "is", null);

  if (clientsErr) {
    return { ok: false, reason: `clients: ${clientsErr.message}` };
  }

  for (const row of clientRows ?? []) {
    const wid = row.wedding_id as string;
    const em = row.email as string | null;
    if (em) addEmail(wid, em);
  }

  const { data: wpRows, error: wpErr } = await supabase
    .from("wedding_people")
    .select("wedding_id, person_id")
    .eq("photographer_id", input.photographerId)
    .in("wedding_id", input.weddingIds);

  if (wpErr) {
    return { ok: false, reason: `wedding_people: ${wpErr.message}` };
  }

  const personToWeddings = new Map<string, string[]>();
  for (const wp of wpRows ?? []) {
    const pid = wp.person_id as string;
    const wid = wp.wedding_id as string;
    const arr = personToWeddings.get(pid) ?? [];
    arr.push(wid);
    personToWeddings.set(pid, arr);
  }

  const personIds = [...personToWeddings.keys()];
  if (personIds.length === 0) {
    return { ok: true, graph: { weddingIdToEmails, weddingIdToDisplayNames } };
  }

  const { data: peopleRows, error: peopleErr } = await supabase
    .from("people")
    .select("id, display_name")
    .eq("photographer_id", input.photographerId)
    .in("id", personIds);

  if (peopleErr) {
    return { ok: false, reason: `people: ${peopleErr.message}` };
  }

  const peopleById = new Map<string, { display_name: string | null }>();
  for (const p of peopleRows ?? []) {
    peopleById.set(p.id as string, { display_name: (p.display_name as string | null) ?? null });
  }

  for (const wp of wpRows ?? []) {
    const wid = wp.wedding_id as string;
    const pid = wp.person_id as string;
    const dn = peopleById.get(pid)?.display_name?.trim();
    if (dn) {
      const arr = weddingIdToDisplayNames.get(wid) ?? [];
      arr.push(dn);
      weddingIdToDisplayNames.set(wid, arr);
    }
  }

  const { data: cpRows, error: cpErr } = await supabase
    .from("contact_points")
    .select("person_id, value_normalized")
    .eq("photographer_id", input.photographerId)
    .eq("kind", "email")
    .in("person_id", personIds);

  if (cpErr) {
    return { ok: false, reason: `contact_points: ${cpErr.message}` };
  }

  for (const cp of cpRows ?? []) {
    const pid = cp.person_id as string;
    const val = cp.value_normalized as string;
    const wids = personToWeddings.get(pid) ?? [];
    for (const wid of wids) addEmail(wid, val);
  }

  return { ok: true, graph: { weddingIdToEmails, weddingIdToDisplayNames } };
}

export async function runDeterministicInquiryProjectDedup(
  supabase: SupabaseClient,
  input: {
    photographerId: string;
    senderEmail: string;
    subject: string;
    body: string;
  },
): Promise<DeterministicInquiryDedupRunResult> {
  const normalizedSender = normalizeEmail(input.senderEmail);

  const { data: activeWeddings, error: wErr } = await supabase
    .from("weddings")
    .select(
      "id, couple_names, wedding_date, location, stage, project_type, event_start_date, event_end_date",
    )
    .eq("photographer_id", input.photographerId)
    .neq("stage", "archived")
    .neq("stage", "delivered")
    .order("wedding_date", { ascending: false, nullsFirst: false })
    .limit(DETERMINISTIC_INQUIRY_DEDUP_MAX_PROJECTS);

  if (wErr) {
    console.error("[deterministicInquiryProjectDedup] weddings query failed:", wErr.message);
    return { kind: "skipped" };
  }

  const weddings: DedupWeddingSnapshot[] = (activeWeddings ?? []).map((r) => ({
    id: r.id as string,
    couple_names: String(r.couple_names ?? ""),
    wedding_date: (r.wedding_date as string | null) ?? null,
    location: String(r.location ?? ""),
    project_type: String(r.project_type ?? "wedding"),
    event_start_date: (r.event_start_date as string | null) ?? null,
    event_end_date: (r.event_end_date as string | null) ?? null,
  }));

  const weddingIds = weddings.map((w) => w.id);
  const graphResult = await buildWeddingEmailGraph(supabase, {
    photographerId: input.photographerId,
    weddingIds,
  });

  if (!graphResult.ok) {
    console.error("[deterministicInquiryProjectDedup] contact graph build failed:", graphResult.reason);
    return { kind: "skipped" };
  }

  const { graph } = graphResult;

  return computeDeterministicInquiryDedup({
    normalizedSender,
    subject: input.subject,
    body: input.body,
    weddings,
    weddingIdToEmails: graph.weddingIdToEmails,
    weddingIdToDisplayNames: graph.weddingIdToDisplayNames,
  });
}
