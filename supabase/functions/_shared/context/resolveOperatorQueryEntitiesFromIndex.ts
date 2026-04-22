/**
 * Deterministic, tenant-bounded name / location resolution for operator-assistant queries.
 * No message history, no fuzzy DB scan — only rows passed in (from a capped index fetch).
 */
import type {
  AssistantOperatorQueryEntityResolution,
  AssistantOperatorQueryWeddingCandidate,
} from "../../../../src/types/assistantContext.types.ts";

/** Bounded fetch size for tenant `weddings` index (deterministic ordering). */
export const ENTITY_WEDDINGS_INDEX_LIMIT = 60;
/** Bounded fetch size for tenant `people` index. */
export const ENTITY_PEOPLE_INDEX_LIMIT = 50;

export type AssistantQueryEntityWeddingIndexRow = {
  id: string;
  couple_names: string;
  location: string;
  stage: string;
  project_type: string;
  wedding_date: string | null;
};

export type AssistantQueryEntityPersonIndexRow = {
  id: string;
  display_name: string;
  kind: string;
};

const STOP = new Set(
  `the a an to of in on for with from at by and or as is it if we you they are was were be been being
about what when where which who how why that this these those there then than into over out up down
our your their its his her them me my mine us
do did does doing done can could should would will shall may might must
not no yes just also only very more most much many few some any each every both each other
please thanks hello hi hey okay ok yes
email emails sent send draft drafts inbox message messages thread app ui page tab
going last did week day days time times today tomorrow yesterday help need want know tell give get got
completely sure maybe seems seem please thank`.split(/\s+/),
);

const MIN_QUERY_LEN = 4;
const AMBIGUOUS_TOP = 3;
const UNIQUE_MIN_SCORE = 5;
const UNIQUE_RATIO = 1.2;

type ScoredWedding = AssistantQueryEntityWeddingIndexRow & { score: number };

export function shouldRunOperatorQueryEntityResolution(queryText: string): boolean {
  const t = String(queryText ?? "").trim();
  if (t.length < MIN_QUERY_LEN) return false;
  if (!/[\p{L}]/u.test(t)) return false;
  return true;
}

function fold(s: string): string {
  return s.normalize("NFD").replace(/\p{M}/gu, "");
}

function normalizeText(s: string): string {
  return fold(s.toLowerCase().replace(/[^a-z0-9]+/g, " ")).replace(/\s+/g, " ").trim();
}

function queryTokensForScoring(q: string): string[] {
  const n = normalizeText(q);
  const parts = n.split(" ").filter((p) => p.length >= 2 && !STOP.has(p));
  return [...new Set(parts)];
}

function coupleNamePairBonus(queryNorm: string, coupleNorm: string): number {
  const m = queryNorm.match(/\b([a-z]{2,})\s*(?:&|and|\/|\+)\s*([a-z]{2,})\b/);
  if (!m) return 0;
  const a = m[1]!;
  const b = m[2]!;
  if (a.length < 2 || b.length < 2) return 0;
  if (coupleNorm.includes(a) && coupleNorm.includes(b)) return 12;
  return 0;
}

function scoreWedding(
  w: AssistantQueryEntityWeddingIndexRow,
  queryNorm: string,
  queryTokens: string[],
): number {
  const c = normalizeText(w.couple_names);
  const l = normalizeText(w.location);
  const st = normalizeText(w.stage);
  let s = coupleNamePairBonus(queryNorm, c);
  /** Must have a real couple/location token hit before the generic inquiry-stage boost (avoids pinning arbitrary inquiry-stage weddings on “skincare inquiry”-style prompts). */
  let nameOrLocationTokenScore = 0;
  for (const t of queryTokens) {
    if (t.length < 3) continue;
    if (c.includes(t)) {
      s += 3;
      nameOrLocationTokenScore += 3;
    }
    if (l.includes(t)) {
      s += 2;
      nameOrLocationTokenScore += 2;
    }
  }
  if (
    nameOrLocationTokenScore > 0 &&
    queryNorm.includes("inquiry") &&
    (st.includes("inquiry") || st.includes("lead"))
  ) {
    s += 2;
  }
  return s;
}

function scorePerson(p: AssistantQueryEntityPersonIndexRow, queryNorm: string): number {
  const d = normalizeText(p.display_name);
  if (d.length < 2) return 0;
  const words = d.split(" ").filter((x) => x.length >= 2);
  if (words.length === 0) return 0;
  let hit = 0;
  for (const w of words) {
    if (queryNorm.includes(w)) hit += 1;
  }
  if (hit === words.length) return 10 + words.length;
  if (hit >= 1) return hit * 2;
  return 0;
}

function toPublicCandidate(
  w: ScoredWedding,
): AssistantOperatorQueryWeddingCandidate {
  return {
    weddingId: w.id,
    couple_names: w.couple_names,
    stage: w.stage,
    wedding_date: w.wedding_date,
    location: w.location,
    project_type: w.project_type,
  };
}

/**
 * Ranks the bounded in-memory index only; all strings must come from the tenant’s index query.
 */
export function resolveOperatorQueryEntitiesFromIndex(
  queryText: string,
  weddings: AssistantQueryEntityWeddingIndexRow[],
  people: AssistantQueryEntityPersonIndexRow[],
): {
  weddingSignal: "none" | "unique" | "ambiguous";
  uniqueWeddingId: string | null;
  weddingCandidates: AssistantOperatorQueryWeddingCandidate[];
  personMatches: Array<{ id: string; display_name: string; kind: string }>;
} {
  const q = String(queryText ?? "");
  if (!shouldRunOperatorQueryEntityResolution(q)) {
    return {
      weddingSignal: "none",
      uniqueWeddingId: null,
      weddingCandidates: [],
      personMatches: [],
    };
  }
  const queryNorm = normalizeText(q);
  const queryTokens = queryTokensForScoring(q);

  const scored: ScoredWedding[] = (weddings ?? [])
    .map((w) => ({ ...w, score: scoreWedding(w, queryNorm, queryTokens) }))
    .filter((w) => w.score > 0)
    .sort((a, b) => (b.score - a.score) || a.id.localeCompare(b.id));

  const top: ScoredWedding[] = scored.slice(0, AMBIGUOUS_TOP);
  const best = top[0];
  const second = top[1];

  let weddingSignal: "none" | "unique" | "ambiguous" = "none";
  let uniqueWeddingId: string | null = null;
  const weddingCandidates: AssistantOperatorQueryWeddingCandidate[] = [];

  if (!best) {
    weddingSignal = "none";
  } else if (top.length === 1) {
    if (best.score >= 2) {
      weddingSignal = "unique";
      uniqueWeddingId = best.id;
    } else {
      weddingSignal = "none";
    }
  } else {
    const marginOk = !second || best.score > second.score * UNIQUE_RATIO;
    if (best.score >= UNIQUE_MIN_SCORE && marginOk) {
      weddingSignal = "unique";
      uniqueWeddingId = best.id;
    } else {
      weddingSignal = "ambiguous";
      for (const w of scored.slice(0, AMBIGUOUS_TOP)) {
        weddingCandidates.push(toPublicCandidate(w));
      }
    }
  }

  const pScored = (people ?? [])
    .map((p) => ({ p, s: scorePerson(p, queryNorm) }))
    .filter((x) => x.s >= 4)
    .sort((a, b) => b.s - a.s || a.p.id.localeCompare(b.p.id));
  const personMatches = pScored.slice(0, 3).map((x) => ({
    id: x.p.id,
    display_name: x.p.display_name,
    kind: x.p.kind,
  }));

  return { weddingSignal, uniqueWeddingId, weddingCandidates, personMatches };
}

/** Used when resolution is skipped — no index fetch, no matches. */
export const IDLE_OPERATOR_QUERY_ENTITY_RESOLUTION: AssistantOperatorQueryEntityResolution = {
  didRun: false,
  weddingSignal: "none",
  uniqueWeddingId: null,
  weddingCandidates: [],
  personMatches: [],
  queryResolvedProjectFacts: null,
};
