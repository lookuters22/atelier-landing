/**
 * Deterministic assistant-mode memory promotion (V3 memory plan §3 Mode B).
 * Separate from reply-mode {@link selectRelevantMemoryIdsDeterministic} — different caps and gates.
 */
import type { MemoryHeader } from "./fetchMemoryHeaders.ts";

const MIN_TOKEN_LEN = 3;

/** Primary supporting: studio memories (plan cap 10). */
export const ASSISTANT_MAX_STUDIO_MEMORIES = 10;

/** Conditional: project or person when explicitly focused (plan cap 5 each). */
export const ASSISTANT_MAX_PROJECT_MEMORIES = 5;
export const ASSISTANT_MAX_PERSON_MEMORIES = 5;

function normalizeWeddingId(w: string | null | undefined): string | null {
  if (w == null) return null;
  const t = String(w).trim();
  return t.length > 0 ? t : null;
}

function normalizePersonId(p: string | null | undefined): string | null {
  if (p == null) return null;
  const t = String(p).trim();
  return t.length > 0 ? t : null;
}

function normalizeHeaderWeddingId(h: MemoryHeader): string | null {
  const w = h.wedding_id;
  if (w === undefined || w === null || String(w).trim() === "") return null;
  return String(w).trim();
}

function normalizeHeaderPersonId(h: MemoryHeader): string | null {
  const p = h.person_id;
  if (p === undefined || p === null || String(p).trim() === "") return null;
  return String(p).trim();
}

function tokenizeForOverlap(text: string): Set<string> {
  const raw = text.toLowerCase().split(/[^a-z0-9]+/g);
  const set = new Set<string>();
  for (const t of raw) {
    if (t.length >= MIN_TOKEN_LEN) set.add(t);
  }
  return set;
}

function keywordOverlapScore(headerText: string, queryBlob: string): number {
  const hTokens = tokenizeForOverlap(headerText);
  if (hTokens.size === 0) return 0;
  const qTokens = tokenizeForOverlap(queryBlob);
  let n = 0;
  for (const t of hTokens) {
    if (qTokens.has(t)) n++;
  }
  return n;
}

function isAssistantSelectableHeader(
  h: MemoryHeader,
  effectiveWeddingId: string | null,
  effectivePersonId: string | null,
): boolean {
  if (h.scope === "studio") return true;
  if (h.scope === "project") {
    if (!effectiveWeddingId) return false;
    const hw = normalizeHeaderWeddingId(h);
    return hw !== null && hw === effectiveWeddingId;
  }
  if (h.scope === "person") {
    if (!effectivePersonId) return false;
    const hp = normalizeHeaderPersonId(h);
    return hp !== null && hp === effectivePersonId;
  }
  return false;
}

function sortBucket(ids: { id: string; keywordScore: number }[]): string[] {
  const rows = [...ids];
  rows.sort((a, b) => {
    if (b.keywordScore !== a.keywordScore) return b.keywordScore - a.keywordScore;
    return a.id.localeCompare(b.id);
  });
  return rows.map((r) => r.id);
}

export type SelectAssistantMemoryIdsInput = {
  queryText: string;
  memoryHeaders: MemoryHeader[];
  focusedWeddingId: string | null;
  focusedPersonId: string | null;
};

/**
 * Picks memory ids: up to {@link ASSISTANT_MAX_PROJECT_MEMORIES} project (when focused wedding set),
 * {@link ASSISTANT_MAX_PERSON_MEMORIES} person (when focused person set),
 * {@link ASSISTANT_MAX_STUDIO_MEMORIES} studio — keyword-ranked within each bucket, deterministic tie-break.
 */
export function selectAssistantMemoryIdsDeterministic(input: SelectAssistantMemoryIdsInput): string[] {
  const effectiveWeddingId = normalizeWeddingId(input.focusedWeddingId);
  const effectivePersonId = normalizePersonId(input.focusedPersonId);
  const queryBlob = String(input.queryText ?? "");

  const projectRows: { id: string; keywordScore: number }[] = [];
  const personRows: { id: string; keywordScore: number }[] = [];
  const studioRows: { id: string; keywordScore: number }[] = [];

  const seen = new Set<string>();
  for (const h of input.memoryHeaders) {
    const id = String(h.id ?? "").trim();
    if (!id || seen.has(id)) continue;
    if (!isAssistantSelectableHeader(h, effectiveWeddingId, effectivePersonId)) continue;
    seen.add(id);
    const kw = keywordOverlapScore(`${h.type} ${h.title} ${h.summary}`, queryBlob);
    if (h.scope === "project") projectRows.push({ id, keywordScore: kw });
    else if (h.scope === "person") personRows.push({ id, keywordScore: kw });
    else studioRows.push({ id, keywordScore: kw });
  }

  const projectIds = sortBucket(projectRows).slice(0, ASSISTANT_MAX_PROJECT_MEMORIES);
  const personIds = sortBucket(personRows).slice(0, ASSISTANT_MAX_PERSON_MEMORIES);
  const studioIds = sortBucket(studioRows).slice(0, ASSISTANT_MAX_STUDIO_MEMORIES);

  const out: string[] = [];
  const pushUnique = (ids: string[]) => {
    for (const id of ids) {
      if (!out.includes(id)) out.push(id);
    }
  };
  pushUnique(projectIds);
  pushUnique(personIds);
  pushUnique(studioIds);
  return out;
}
