/**
 * Deterministic case-memory promotion (execute_v3 Step 5C): pick memory ids from header scan + turn text,
 * then hydrate via `fetchSelectedMemoriesFull` (single query). No vector search; no scoring schema.
 *
 * **Truth hierarchy:** `selectedMemories` support orchestrator/verifier reasoning; they do **not** override
 * `playbook_rules`. Only future schema-backed authorized-exception machinery may narrow policy for a case.
 *
 * **Provisional text cues (Tier B):** substring matches for `authorized_exception` / `v3_verify_case_note` / `exception`
 * are **retrieval hints only** — not durable policy semantics. Do not treat them as a full exception system.
 *
 * **Reply-mode scope:** `scope='project'` memories from another project are **never** candidates (hard filter).
 * `scope='person'` is allowed only when `memories.person_id` is in `replyModeParticipantPersonIds` (Slice 4).
 * `scope='studio'` rows are fallback with a sub-cap when a wedding is in scope (Slice 2).
 */
import type { MemoryHeader, MemoryScope } from "./fetchMemoryHeaders.ts";

/** Hard cap on promoted full memory rows per turn (keep orchestrator payload bounded). */
export const MAX_SELECTED_MEMORIES = 5;

/** Studio-scope rows allowed inside {@link MAX_SELECTED_MEMORIES} for reply mode (production memory plan §3). */
export const MAX_STUDIO_MEMORIES_IN_REPLY = 3;

const MIN_TOKEN_LEN = 3;

/** Strong provisional cues (secondary to scope + keywords). Not policy. */
const PROVISIONAL_STRONG_SUBSTRINGS = ["authorized_exception", "v3_verify_case_note"] as const;

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

function normalizeParticipantSet(ids: string[] | undefined): Set<string> {
  const out = new Set<string>();
  if (!ids?.length) return out;
  for (const id of ids) {
    const t = String(id).trim();
    if (t.length > 0) out.add(t);
  }
  return out;
}

/**
 * Reply-mode candidate gate: cross-project `project` excluded; `person` only for in-thread participant ids.
 */
function isReplyModeSelectableHeader(
  h: MemoryHeader,
  effectiveWeddingId: string | null,
  allowedPersonIds: Set<string>,
): boolean {
  if (h.scope === "person") {
    const pid = normalizeHeaderPersonId(h);
    return pid !== null && allowedPersonIds.has(pid);
  }
  if (h.scope === "studio") {
    return true;
  }
  // project
  if (!effectiveWeddingId) {
    return true;
  }
  const headerWeddingId = normalizeHeaderWeddingId(h);
  return headerWeddingId !== null && headerWeddingId === effectiveWeddingId;
}

/**
 * Primary = in-scope project or in-scope person; fallback = studio when wedding is in scope.
 */
function scopePrimaryRank(
  effectiveWeddingId: string | null,
  h: MemoryHeader,
  allowedPersonIds: Set<string>,
): number {
  if (h.scope === "studio") {
    return effectiveWeddingId ? 1 : 0;
  }
  if (h.scope === "person") {
    const pid = normalizeHeaderPersonId(h);
    if (pid !== null && allowedPersonIds.has(pid)) {
      return 2;
    }
    return 0;
  }
  if (h.scope === "project") {
    if (!effectiveWeddingId) {
      return 0;
    }
    const headerWeddingId = normalizeHeaderWeddingId(h);
    if (headerWeddingId !== null && headerWeddingId === effectiveWeddingId) {
      return 2;
    }
    return 0;
  }
  return 0;
}

/**
 * Provisional text-only ranking boost — not authorized-exception policy (requires schema later).
 */
function provisionalTextCueRank(combinedLc: string): number {
  for (const s of PROVISIONAL_STRONG_SUBSTRINGS) {
    if (combinedLc.includes(s)) {
      return 2;
    }
  }
  if (/\bexception\b/.test(combinedLc)) {
    return 1;
  }
  return 0;
}

function tokenizeForOverlap(text: string): Set<string> {
  const raw = text.toLowerCase().split(/[^a-z0-9]+/g);
  const set = new Set<string>();
  for (const t of raw) {
    if (t.length >= MIN_TOKEN_LEN) set.add(t);
  }
  return set;
}

function keywordOverlapScore(headerText: string, turnBlob: string): number {
  const hTokens = tokenizeForOverlap(headerText);
  if (hTokens.size === 0) return 0;
  const turnTokens = tokenizeForOverlap(turnBlob);
  let n = 0;
  for (const t of hTokens) {
    if (turnTokens.has(t)) n++;
  }
  return n;
}

export type SelectRelevantMemoriesInput = {
  /** Resolved tenant id — not used to trust header ids; hydration enforces `.eq(photographer_id)`. */
  photographerId: string;
  weddingId: string | null;
  /** Reserved for future thread-scoped memories when schema supports it. */
  threadId: string | null;
  rawMessage: string;
  threadSummary: string | null;
  memoryHeaders: MemoryHeader[];
  /**
   * Thread participant `people.id` values (same as `AgentContext.replyModeParticipantPersonIds`).
   * Person-scope headers are candidates only when `person_id` is in this set.
   */
  replyModeParticipantPersonIds: string[];
};

type RankedRow = {
  id: string;
  scope: MemoryScope;
  scopePrimary: number;
  provisionalCue: number;
  keywordScore: number;
};

/**
 * Returns up to {@link MAX_SELECTED_MEMORIES} memory ids in deterministic priority order.
 * Only ids present in `memoryHeaders` can appear (cross-tenant rows cannot enter via this path).
 *
 * **Invariant:** With `weddingId` set, no `scope='project'` memory whose `wedding_id` differs from `weddingId`
 * may appear. No `scope='person'` memory unless `person_id ∈ replyModeParticipantPersonIds`.
 * With `weddingId` set, at most {@link MAX_STUDIO_MEMORIES_IN_REPLY} `scope='studio'` ids are returned
 * (within {@link MAX_SELECTED_MEMORIES}). When `weddingId` is null, the studio sub-cap is not applied.
 */
export function selectRelevantMemoryIdsDeterministic(input: SelectRelevantMemoriesInput): string[] {
  const effectiveWeddingId =
    typeof input.weddingId === "string" && input.weddingId.trim().length > 0 ? input.weddingId.trim() : null;

  const allowedPersonIds = normalizeParticipantSet(input.replyModeParticipantPersonIds);

  const turnBlob = `${input.rawMessage}\n${input.threadSummary ?? ""}`;

  const seen = new Set<string>();
  const rows: RankedRow[] = [];

  for (const h of input.memoryHeaders) {
    const id = String(h.id ?? "").trim();
    if (!id || seen.has(id)) continue;
    if (!isReplyModeSelectableHeader(h, effectiveWeddingId, allowedPersonIds)) {
      continue;
    }
    seen.add(id);

    const scopePrimary = scopePrimaryRank(effectiveWeddingId, h, allowedPersonIds);
    const combined = `${h.type}\n${h.title}\n${h.summary}`.toLowerCase();
    const provisionalCue = provisionalTextCueRank(combined);
    const keywordScore = keywordOverlapScore(`${h.type} ${h.title} ${h.summary}`, turnBlob);

    rows.push({ id, scope: h.scope, scopePrimary, provisionalCue, keywordScore });
  }

  rows.sort((a, b) => {
    if (b.scopePrimary !== a.scopePrimary) return b.scopePrimary - a.scopePrimary;
    if (b.provisionalCue !== a.provisionalCue) return b.provisionalCue - a.provisionalCue;
    if (b.keywordScore !== a.keywordScore) return b.keywordScore - a.keywordScore;
    return a.id.localeCompare(b.id);
  });

  const out: string[] = [];
  let studioPicked = 0;
  /** Bounded studio fallback only when replying in a known project; unscoped threads keep legacy breadth. */
  const studioCap = effectiveWeddingId != null ? MAX_STUDIO_MEMORIES_IN_REPLY : MAX_SELECTED_MEMORIES;

  for (const r of rows) {
    if (out.length >= MAX_SELECTED_MEMORIES) break;
    if (r.scope === "studio" && studioPicked >= studioCap) {
      continue;
    }
    out.push(r.id);
    if (r.scope === "studio") {
      studioPicked += 1;
    }
  }

  return out;
}
