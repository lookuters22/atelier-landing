/**
 * Slice 6 — carry-forward pointer: pure transport + advisory hint (advisory only; never hide IDs).
 * No database calls. @see docs/v3/V3_OPERATOR_ANA_FOLLOW_UP_AND_CARRY_FORWARD_SLICE.md
 */
import type { AssistantContext } from "../../../../src/types/assistantContext.types.ts";
import type {
  OperatorAnaAdvisoryConfidence,
  OperatorAnaAdvisoryFollowUp,
  OperatorAnaCarryForwardAdvisoryHint,
  OperatorAnaCarryForwardAdvisoryReason,
  OperatorAnaCarryForwardClientState,
  OperatorAnaCarryForwardData,
  OperatorAnaCarryForwardDomain,
  OperatorAnaCarryForwardForLlm,
  OperatorAnaCarryForwardProjectType,
} from "../../../../src/types/operatorAnaCarryForward.types.ts";

/**
 * Slice 7 — one JSON line per request for pointer visibility; no new analytics platform.
 * `llm_invoked_handler_using_pointer_heuristic` is a bounded guess from this turn’s tool args + the pointer.
 */
export type OperatorAnaCarryForwardTelemetry = {
  type: "operator_ana_carry_forward_telemetry";
  photographerId: string;
  queryFingerprint: string;
  pointer_present: boolean;
  pointer_has_ids: boolean;
  advisory_likely_follow_up: "true" | "false" | "null";
  advisory_reason: string | null;
  advisory_confidence: OperatorAnaAdvisoryConfidence | null;
  last_domain: string | null;
  pointer_age_seconds: number | null;
  /** Conservative: true when this turn’s tool pattern matches pointer reuse, else false. */
  llm_invoked_handler_using_pointer_heuristic: boolean;
  /** Explains the heuristic; not a product guarantee. */
  heuristic_note: string;
};

export type ToolOutcomeForHeuristic = { name: string; ok: boolean; functionArguments?: string };

export const OPERATOR_ANA_CARRY_FORWARD_MAX_AGE_SECONDS = 180;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isLikelyUuid(s: string): boolean {
  return UUID_RE.test(s.trim());
}

function normalizeProjectType(raw: string | null | undefined): OperatorAnaCarryForwardProjectType | null {
  if (raw == null) return null;
  const t = String(raw).trim().toLowerCase();
  if (t === "wedding" || t === "commercial" || t === "video" || t === "other") return t;
  return "other";
}

const EMPTY_DATA: OperatorAnaCarryForwardData = {
  lastDomain: "none",
  lastFocusedProjectId: null,
  lastFocusedProjectType: null,
  lastMentionedPersonId: null,
  lastThreadId: null,
  lastEntityAmbiguous: false,
};

function dataHasSignals(d: OperatorAnaCarryForwardData): boolean {
  if (d.lastDomain !== "none") return true;
  if (d.lastFocusedProjectId) return true;
  if (d.lastFocusedProjectType) return true;
  if (d.lastMentionedPersonId) return true;
  if (d.lastThreadId) return true;
  if (d.lastEntityAmbiguous) return true;
  return false;
}

const DOMAIN_BY_TOOL: Record<string, OperatorAnaCarryForwardDomain> = {
  operator_lookup_projects: "projects",
  operator_lookup_project_details: "projects",
  operator_lookup_threads: "threads",
  operator_lookup_inquiry_counts: "inquiry_counts",
};

function toolDomain(name: string): OperatorAnaCarryForwardDomain {
  return DOMAIN_BY_TOOL[name] ?? "none";
}

/**
 * Shallow-validate the client `carryForward` payload. Unknown keys ignored.
 * Returns `null` when the payload is missing or unusable.
 */
export function tryParseClientCarryForward(raw: unknown): OperatorAnaCarryForwardClientState | null {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  if (o.emittedAtEpochMs == null || typeof o.emittedAtEpochMs !== "number" || !Number.isFinite(o.emittedAtEpochMs)) {
    return null;
  }
  const data = {
    lastDomain: parseDomain(o.lastDomain),
    lastFocusedProjectId: pickUuidOrNull(o.lastFocusedProjectId),
    lastFocusedProjectType: pickProjectType(o.lastFocusedProjectType),
    lastMentionedPersonId: pickUuidOrNull(o.lastMentionedPersonId),
    lastThreadId: pickUuidOrNull(o.lastThreadId),
    lastEntityAmbiguous: Boolean(o.lastEntityAmbiguous),
  };
  return {
    ...data,
    emittedAtEpochMs: o.emittedAtEpochMs,
    capturedFocusWeddingId: pickUuidOrNull(o.capturedFocusWeddingId),
    capturedFocusPersonId: pickUuidOrNull(o.capturedFocusPersonId),
  };
}

function pickUuidOrNull(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  if (!s) return null;
  return isLikelyUuid(s) ? s : null;
}

function pickProjectType(v: unknown): OperatorAnaCarryForwardProjectType | null {
  if (v == null) return null;
  return normalizeProjectType(String(v));
}

function parseDomain(v: unknown): OperatorAnaCarryForwardDomain {
  if (v == null) return "none";
  const s = String(v).trim();
  const allowed: OperatorAnaCarryForwardDomain[] = [
    "projects",
    "threads",
    "calendar",
    "playbook",
    "memories",
    "studio_analysis",
    "app_help",
    "knowledge",
    "inquiry_counts",
    "none",
  ];
  return (allowed as string[]).includes(s) ? (s as OperatorAnaCarryForwardDomain) : "none";
}

export type CarryForwardPruneResult =
  | { kind: "none" }
  | { kind: "age_expired" }
  | { kind: "focus_changed" };

/**
 * Prune ID fields for stale or focus-drift; never touches advisory (caller adds that).
 * Returns fresh empty data on prune, losing prior IDs by design.
 */
export function pruneCarryForwardData(
  data: OperatorAnaCarryForwardData,
  nowMs: number,
  options: { emittedAtEpochMs: number; capturedFocusWeddingId: string | null; capturedFocusPersonId: string | null },
  currentFocus: { weddingId: string | null; personId: string | null },
): { data: OperatorAnaCarryForwardData; prune: CarryForwardPruneResult } {
  const ageSec = Math.max(0, Math.floor((nowMs - options.emittedAtEpochMs) / 1000));
  if (ageSec > OPERATOR_ANA_CARRY_FORWARD_MAX_AGE_SECONDS) {
    return { data: { ...EMPTY_DATA }, prune: { kind: "age_expired" } };
  }
  if (
    options.capturedFocusWeddingId != null &&
    currentFocus.weddingId != null &&
    options.capturedFocusWeddingId !== currentFocus.weddingId
  ) {
    return { data: { ...EMPTY_DATA }, prune: { kind: "focus_changed" } };
  }
  if (
    options.capturedFocusPersonId != null &&
    currentFocus.personId != null &&
    options.capturedFocusPersonId !== currentFocus.personId
  ) {
    return { data: { ...EMPTY_DATA }, prune: { kind: "focus_changed" } };
  }
  return { data: { ...data }, prune: { kind: "none" } };
}

function hadSuccessfulResolverThisTurn(tools: ToolOutcomeForHeuristic[]): boolean {
  return tools.some((t) => t.ok && t.name === "operator_lookup_projects");
}

function tryParseFunctionArgs(
  s: string | undefined,
): Record<string, unknown> | null {
  if (s == null || s === "") return null;
  try {
    const v = JSON.parse(s) as unknown;
    return v != null && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/**
 * If the model re-ran the project name resolver with a successful `operator_lookup_projects` this turn,
 * we treat the turn as a fresh resolution for telemetry (explicit new entity or disambiguation).
 */
export function inferLlmHandlerUsingPointerHeuristic(
  carryForward: OperatorAnaCarryForwardForLlm | null,
  toolOutcomes: ToolOutcomeForHeuristic[],
): { value: boolean; note: string } {
  if (carryForward == null) {
    return { value: false, note: "no_pointer_in_context" };
  }
  if (toolOutcomes.length < 1) {
    return { value: false, note: "no_tool_outcomes" };
  }
  const hadResolver = hadSuccessfulResolverThisTurn(toolOutcomes);
  const wid = carryForward.lastFocusedProjectId;
  for (const t of toolOutcomes) {
    if (!t.ok) continue;
    if (t.name === "operator_lookup_project_details" && wid) {
      const args = tryParseFunctionArgs(t.functionArguments);
      const pid = args != null && typeof args.projectId === "string" ? args.projectId : null;
      if (pid === wid) {
        if (hadResolver) {
          return { value: false, note: "project_details_with_resolver_same_turn" };
        }
        return { value: true, note: "project_details_arg_matches_pointer_no_resolver" };
      }
    }
  }
  if (!hadResolver && toolOutcomes.some((t) => t.ok && t.name === "operator_lookup_threads")) {
    const hasPointerIds = !!(
      carryForward.lastFocusedProjectId || carryForward.lastMentionedPersonId || carryForward.lastThreadId
    );
    if (hasPointerIds) {
      return { value: true, note: "threads_lookup_without_project_resolver_with_pointer_ids" };
    }
  }
  return { value: false, note: "no_project_detail_or_thread_pattern_matches" };
}

export function buildOperatorAnaCarryForwardTelemetry(
  ctx: AssistantContext,
  toolOutcomes: ToolOutcomeForHeuristic[],
): OperatorAnaCarryForwardTelemetry {
  const cf = ctx.carryForward;
  const h = inferLlmHandlerUsingPointerHeuristic(cf, toolOutcomes);
  const adv = cf?.advisoryHint;
  const tri = (v: boolean | null | undefined): "true" | "false" | "null" => {
    if (v === true) return "true";
    if (v === false) return "false";
    return "null";
  };
  return {
    type: "operator_ana_carry_forward_telemetry",
    photographerId: ctx.photographerId,
    queryFingerprint: ctx.retrievalLog.queryDigest.fingerprint,
    pointer_present: cf != null,
    pointer_has_ids: !!(
      cf && (cf.lastFocusedProjectId || cf.lastMentionedPersonId || cf.lastThreadId)
    ),
    advisory_likely_follow_up: tri(adv?.likelyFollowUp),
    advisory_reason: (adv?.reason as OperatorAnaCarryForwardAdvisoryReason | undefined) ?? null,
    advisory_confidence: adv?.confidence ?? null,
    last_domain: cf != null && cf.lastDomain !== "none" ? cf.lastDomain : null,
    pointer_age_seconds: cf != null ? cf.ageSeconds : null,
    llm_invoked_handler_using_pointer_heuristic: h.value,
    heuristic_note: h.note,
  };
}

const SHORT_CUE = /^\s*and\s|what\s+about|tell\s+me\s+more|when\s+is|where\s+is|who\s+is|when\s+are|where\s+are|\bwhen\b|\bwhere\b|\bwho\b|what\s+was\s+it|that\s+one|the\s+couple|the\s+project|\bthey\b|\bthem\b|\b(it|that)\b/i;

const TOPIC_SHIFT =
  /new\s+project|another\s+project|different\s+project|playbook|rule|calendar|task|inquiry\s+count|app\s+help|settings|inbox|pipeline|memory|studio\s+analysis|knowledge/i;

/**
 * Heuristic, advisory only — does not read or clear pointer data fields.
 */
export function computeCarryForwardAdvisoryHint(
  queryText: string,
  prune: CarryForwardPruneResult,
  data: OperatorAnaCarryForwardData,
): OperatorAnaCarryForwardAdvisoryHint {
  if (prune.kind === "age_expired") {
    return { likelyFollowUp: false, reason: "age_expired", confidence: "high" };
  }
  if (prune.kind === "focus_changed") {
    return { likelyFollowUp: false, reason: "focus_changed", confidence: "high" };
  }

  if (!dataHasSignals(data)) {
    return { likelyFollowUp: false, reason: "fresh_session", confidence: "high" };
  }

  const q = String(queryText ?? "").trim();
  if (q.length < 1) {
    return { likelyFollowUp: null, reason: "no_cue_detected", confidence: "low" };
  }

  if (data.lastDomain === "projects" && TOPIC_SHIFT.test(q) && /playbook|rule|calendar|task|memory|knowledge|studio|app\s+help|inbox|pipeline/i.test(q)) {
    return { likelyFollowUp: false, reason: "topic_change_shaped", confidence: "medium" };
  }
  if (data.lastDomain !== "none" && data.lastDomain !== "projects" && TOPIC_SHIFT.test(q)) {
    return { likelyFollowUp: false, reason: "topic_change_shaped", confidence: "medium" };
  }

  if (q.length < 110 && (SHORT_CUE.test(q) || /^(and|ok|so|yes|right)\b/i.test(q))) {
    return { likelyFollowUp: true, reason: "short_cue_detected", confidence: "medium" };
  }

  if (q.length < 32 && /^(and|or|so|ok)\b/i.test(q)) {
    return { likelyFollowUp: true, reason: "short_cue_detected", confidence: "medium" };
  }

  return { likelyFollowUp: null, reason: "no_cue_detected", confidence: "low" };
}

/**
 * After pruning + same data fields, only advisory may differ; IDs stay identical.
 */
export function buildCarryForwardForLlm(
  data: OperatorAnaCarryForwardData,
  advisory: OperatorAnaCarryForwardAdvisoryHint,
  nowMs: number,
  emittedAtEpochMs: number,
): OperatorAnaCarryForwardForLlm {
  const ageSeconds = Math.max(0, Math.floor((nowMs - emittedAtEpochMs) / 1000));
  return {
    ...data,
    ageSeconds,
    advisoryHint: advisory,
  };
}

type ToolOutcome = { name: string; ok: boolean; content: string };

function parseJsonObject(s: string): Record<string, unknown> | null {
  try {
    const v = JSON.parse(s) as unknown;
    return v != null && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/**
 * Derive pointer data from read-only tool JSON returned to the model (and first-pass `ctx` when there are no tools).
 */
export function extractCarryForwardDataFromTurn(ctx: AssistantContext, toolOutcomes: ToolOutcome[]): OperatorAnaCarryForwardData {
  let out = { ...EMPTY_DATA };
  for (const t of toolOutcomes) {
    if (!t.ok) continue;
    const row = parseJsonObject(t.content);
    if (!row) continue;
    out = mergeToolIntoData(out, t.name, row);
  }
  if (toolOutcomes.length === 0) {
    out = mergeContextOnlySignals(ctx, out);
  } else {
    out = fillFromFocusIfMissing(ctx, out);
  }
  return out;
}

function mergeToolIntoData(
  current: OperatorAnaCarryForwardData,
  toolName: string,
  toolJson: Record<string, unknown>,
): OperatorAnaCarryForwardData {
  const dom = toolDomain(toolName);
  const next: OperatorAnaCarryForwardData = { ...current, lastDomain: dom === "none" ? current.lastDomain : dom };

  if (toolName === "operator_lookup_projects" && !toolJson.error) {
    const res = (toolJson.result as Record<string, unknown> | undefined) ?? toolJson;
    const wSig = String(res.weddingSignal ?? "");
    if (wSig === "ambiguous") {
      next.lastEntityAmbiguous = true;
    }
    const uw = res.uniqueWeddingId;
    if (typeof uw === "string" && isLikelyUuid(uw)) {
      next.lastFocusedProjectId = uw;
      const cands = res.weddingCandidates;
      if (Array.isArray(cands) && cands.length) {
        const m = cands.find((c) => (c as { weddingId?: string }).weddingId === uw) as
          | { project_type?: string; weddingId?: string }
          | undefined;
        next.lastFocusedProjectType = m?.project_type != null ? normalizeProjectType(String(m.project_type)) : next.lastFocusedProjectType;
      }
    }
    const pm = res.personMatches;
    if (Array.isArray(pm) && pm.length === 1) {
      const id = (pm[0] as { id?: string })?.id;
      if (typeof id === "string" && isLikelyUuid(id)) {
        next.lastMentionedPersonId = id;
      }
    }
  }

  if (toolName === "operator_lookup_project_details" && toolJson.result) {
    const r = toolJson.result as Record<string, unknown>;
    const pid = r.projectId;
    if (typeof pid === "string" && isLikelyUuid(pid)) {
      next.lastFocusedProjectId = pid;
      next.lastFocusedProjectType = r.projectType != null ? normalizeProjectType(String(r.projectType)) : null;
    }
    next.lastEntityAmbiguous = false;
  }

  if (toolName === "operator_lookup_threads" && !toolJson.error) {
    const r = (toolJson.result as Record<string, unknown> | undefined) ?? toolJson;
    const th = r.threads;
    if (Array.isArray(th)) {
      if (th.length === 1) {
        const tid = (th[0] as { threadId?: string })?.threadId;
        if (typeof tid === "string" && isLikelyUuid(tid)) {
          next.lastThreadId = tid;
        }
        next.lastEntityAmbiguous = next.lastEntityAmbiguous;
      } else if (th.length > 1) {
        next.lastEntityAmbiguous = true;
      }
    }
  }

  return next;
}

function mergeContextOnlySignals(
  ctx: AssistantContext,
  start: OperatorAnaCarryForwardData,
): OperatorAnaCarryForwardData {
  const out: OperatorAnaCarryForwardData = { ...start };
  const e = ctx.operatorQueryEntityResolution;
  if (ctx.includeAppCatalogInOperatorPrompt) {
    out.lastDomain = "app_help";
  } else if (ctx.studioAnalysisSnapshot != null) {
    out.lastDomain = "studio_analysis";
  } else if (ctx.operatorCalendarSnapshot.didRun) {
    out.lastDomain = "calendar";
  } else if (e.didRun) {
    if (e.weddingSignal === "ambiguous" && e.weddingCandidates.length > 0) {
      out.lastEntityAmbiguous = true;
      out.lastDomain = "projects";
    } else if (e.weddingSignal === "unique" && e.uniqueWeddingId) {
      out.lastFocusedProjectId = e.uniqueWeddingId;
      out.lastFocusedProjectType = e.queryResolvedProjectFacts
        ? normalizeProjectType(e.queryResolvedProjectFacts.project_type)
        : ctx.focusedProjectSummary?.projectId === e.uniqueWeddingId
          ? normalizeProjectType(ctx.focusedProjectSummary.projectType)
          : out.lastFocusedProjectType;
      out.lastDomain = "projects";
    } else {
      if (e.personMatches.length === 1) {
        out.lastMentionedPersonId = e.personMatches[0]!.id;
        out.lastDomain = "projects";
      }
    }
  }

  if (ctx.focusedWeddingId && ctx.focusedProjectSummary?.projectId === ctx.focusedWeddingId) {
    if (!out.lastFocusedProjectId) {
      out.lastFocusedProjectId = ctx.focusedWeddingId;
      out.lastFocusedProjectType = normalizeProjectType(ctx.focusedProjectSummary.projectType);
    }
    if (out.lastDomain === "none" && out.lastFocusedProjectId != null) {
      out.lastDomain = "projects";
    }
  }

  if (ctx.focusedWeddingId && out.lastFocusedProjectId == null) {
    out.lastFocusedProjectId = ctx.focusedWeddingId;
    out.lastFocusedProjectType = ctx.focusedProjectSummary
      ? normalizeProjectType(ctx.focusedProjectSummary.projectType)
      : out.lastFocusedProjectType;
    if (out.lastDomain === "none") {
      out.lastDomain = "projects";
    }
  }

  if (ctx.operatorThreadMessageLookup.didRun && ctx.operatorThreadMessageLookup.threads.length > 0) {
    if (out.lastThreadId == null && ctx.operatorThreadMessageLookup.threads.length === 1) {
      out.lastThreadId = ctx.operatorThreadMessageLookup.threads[0]!.threadId;
    }
    if (out.lastThreadId && out.lastDomain === "none") {
      out.lastDomain = "threads";
    }
  }

  if (e.personMatches.length === 1 && out.lastMentionedPersonId == null) {
    out.lastMentionedPersonId = e.personMatches[0]!.id;
  }
  if (ctx.retrievalLog.scopesQueried.includes("operator_inquiry_count_snapshot")) {
    out.lastDomain = "inquiry_counts";
  }
  return out;
}

/** When tools ran but did not yield a project id, fall back to validated UI focus. */
function fillFromFocusIfMissing(
  ctx: AssistantContext,
  out: OperatorAnaCarryForwardData,
): OperatorAnaCarryForwardData {
  const n = { ...out };
  if (
    n.lastFocusedProjectId == null &&
    ctx.focusedWeddingId != null &&
    ctx.focusedProjectSummary?.projectId === ctx.focusedWeddingId
  ) {
    n.lastFocusedProjectId = ctx.focusedWeddingId;
    n.lastFocusedProjectType = normalizeProjectType(ctx.focusedProjectSummary.projectType);
  }
  if (n.lastDomain === "none" && n.lastFocusedProjectId != null) {
    n.lastDomain = "projects";
  }
  return n;
}

/**
 * Build the client response payload for the next request (advisory is omitted — recomputed server-side).
 */
export function buildClientCarryForwardState(
  data: OperatorAnaCarryForwardData,
  nowMs: number,
  currentFocus: { weddingId: string | null; personId: string | null },
): OperatorAnaCarryForwardClientState | null {
  if (!dataHasSignals(data)) {
    return null;
  }
  return {
    ...data,
    emittedAtEpochMs: nowMs,
    capturedFocusWeddingId: currentFocus.weddingId,
    capturedFocusPersonId: currentFocus.personId,
  };
}

/** Renders the carry-forward block for the last user `Context` message (no transport-only keys). */
export function formatCarryForwardBlockForLlm(view: OperatorAnaCarryForwardForLlm): string {
  const payload = {
    lastDomain: view.lastDomain,
    lastFocusedProjectId: view.lastFocusedProjectId,
    lastFocusedProjectType: view.lastFocusedProjectType,
    lastMentionedPersonId: view.lastMentionedPersonId,
    lastThreadId: view.lastThreadId,
    lastEntityAmbiguous: view.lastEntityAmbiguous,
    ageSeconds: view.ageSeconds,
    advisoryHint: view.advisoryHint,
  };
  return [
    "## Carry-forward pointer (from prior turn; structured grounding, not a live lookup)",
    "*(Read-only, round-tripped from your last turn in this client session. **advisoryHint** is a small server-computed nudge, not a gate. When `reason` is `age_expired` or `focus_changed`, id fields are **cleared on purpose** — see the system prompt. Otherwise use the ids for terse follow-ups and pronouns unless the current question names a different entity or domain.)*",
    "```json",
    JSON.stringify(payload, null, 2),
    "```",
  ].join("\n");
}

/**
 * Prune-state view: ids cleared, explicit advisory so the model sees why referents were dropped.
 */
function buildPrunedCarryForwardViewForLlm(
  nowMs: number,
  incomingEmittedAtEpochMs: number,
  reason: "age_expired" | "focus_changed",
): OperatorAnaCarryForwardForLlm {
  const ageSeconds = Math.max(0, Math.floor((nowMs - incomingEmittedAtEpochMs) / 1000));
  return {
    lastDomain: "none",
    lastFocusedProjectId: null,
    lastFocusedProjectType: null,
    lastMentionedPersonId: null,
    lastThreadId: null,
    lastEntityAmbiguous: false,
    ageSeconds,
    advisoryHint: { likelyFollowUp: false, reason, confidence: "high" },
  };
}

/**
 * Prepares the pointer for the operator prompt. Returns `null` when there is no client round-trip
 * (first turn) or when incoming state has nothing to show after pruning (e.g. empty parse) —
 * but **age_expired** and **focus_changed** still render an explicit block with cleared ids.
 */
export function prepareCarryForwardForContext(
  incoming: OperatorAnaCarryForwardClientState | null,
  currentFocus: { weddingId: string | null; personId: string | null },
  queryText: string,
  nowMs: number,
): OperatorAnaCarryForwardForLlm | null {
  if (incoming == null) {
    return null;
  }
  const { data, prune } = pruneCarryForwardData(
    {
      lastDomain: incoming.lastDomain,
      lastFocusedProjectId: incoming.lastFocusedProjectId,
      lastFocusedProjectType: incoming.lastFocusedProjectType,
      lastMentionedPersonId: incoming.lastMentionedPersonId,
      lastThreadId: incoming.lastThreadId,
      lastEntityAmbiguous: incoming.lastEntityAmbiguous,
    },
    nowMs,
    {
      emittedAtEpochMs: incoming.emittedAtEpochMs,
      capturedFocusWeddingId: incoming.capturedFocusWeddingId,
      capturedFocusPersonId: incoming.capturedFocusPersonId,
    },
    currentFocus,
  );
  if (prune.kind === "age_expired" || prune.kind === "focus_changed") {
    return buildPrunedCarryForwardViewForLlm(nowMs, incoming.emittedAtEpochMs, prune.kind);
  }
  const advisory = computeCarryForwardAdvisoryHint(queryText, prune, data);
  if (!dataHasSignals(data)) {
    return null;
  }
  return buildCarryForwardForLlm(data, advisory, nowMs, incoming.emittedAtEpochMs);
}
