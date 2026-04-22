/**
 * Pure helpers for {@link SupportAssistantWidget} contract enforcement (fail closed)
 * and structured display (footer / dev retrieval).
 */
import type { AuthorizedCaseExceptionOverridePayload } from "../types/decisionContext.types.ts";
import { defaultOperatorAssistantTaskDueDateUtcToday } from "./operatorAssistantTaskDueDate.ts";
import { normalizeOfferBuilderChangeProposalsForWidget } from "./operatorAssistantOfferBuilderChangeProposalFromLlm.ts";
import { normalizeStudioProfileChangeProposalsForWidget } from "./operatorAssistantStudioProfileChangeProposalFromLlm.ts";
import type {
  OperatorAssistantProposedActionAuthorizedCaseException,
  OperatorAssistantProposedActionCalendarEventCreate,
  OperatorAssistantProposedActionCalendarEventReschedule,
  OperatorAssistantProposedActionEscalationResolve,
  OperatorAssistantProposedActionInvoiceSetupChangeProposal,
  OperatorAssistantProposedActionMemoryNote,
  OperatorAssistantProposedActionOfferBuilderChangeProposal,
  OperatorAssistantProposedActionPlaybookRuleCandidate,
  OperatorAssistantProposedActionStudioProfileChangeProposal,
  OperatorAssistantProposedActionTask,
} from "../types/operatorAssistantProposedAction.types.ts";
import { normalizeInvoiceSetupChangeProposalsForWidget } from "./operatorAssistantInvoiceSetupChangeProposalFromLlm.ts";

export type OperatorStudioAssistantInvokePayload = {
  reply?: unknown;
  proposedActions?: unknown;
  clientFacingForbidden?: unknown;
  /** Slice 6 — next-turn carry-forward pointer. */
  carryForward?: unknown;
  retrievalLog?: {
    selectedMemoryIds?: string[];
    scopesQueried?: string[];
  };
};

export const OPERATOR_STUDIO_ASSISTANT_CONTRACT_VIOLATION_MESSAGE =
  "We could not verify this reply as operator-only, so it was not shown. Try again.";

export type OperatorStudioAssistantAssistantDisplay =
  | { kind: "contract_violation"; mainText: string }
  | {
      kind: "answer";
      mainText: string;
      operatorRibbon: string;
      devRetrieval: { scopes: string[]; memoryIds: string[] } | null;
      /** Slice 6 — rule candidate proposals; confirm creates a DB candidate row only. */
      playbookRuleProposals: OperatorAssistantProposedActionPlaybookRuleCandidate[];
      /** Slice 7 — task proposals; confirm inserts a `tasks` row (open). */
      taskProposals: OperatorAssistantProposedActionTask[];
      /** Memory proposals; confirm inserts a `memories` row (project | person | studio). */
      memoryNoteProposals: OperatorAssistantProposedActionMemoryNote[];
      /** Slice 11 — case-scoped policy exception; confirm inserts `authorized_case_exceptions` only. */
      authorizedCaseExceptionProposals: OperatorAssistantProposedActionAuthorizedCaseException[];
      /** Studio capability / profile change — confirm enqueues `studio_profile_change_proposals` only; live apply is on Studio profile (review). */
      studioProfileChangeProposals: OperatorAssistantProposedActionStudioProfileChangeProposal[];
      /** Offer-builder metadata (name / document title) — confirm enqueues `offer_builder_change_proposals`; live apply is reviewed on proposals page (not the widget). */
      offerBuilderChangeProposals: OperatorAssistantProposedActionOfferBuilderChangeProposal[];
      /** Invoice PDF template (bounded fields) — confirm enqueues `invoice_setup_change_proposals` only; no live apply in widget. */
      invoiceSetupChangeProposals: OperatorAssistantProposedActionInvoiceSetupChangeProposal[];
      /** F3 — simple `calendar_events` create; confirm inserts a row. */
      calendarEventCreateProposals: OperatorAssistantProposedActionCalendarEventCreate[];
      /** F3 — narrow reschedule; confirm updates start/end only. */
      calendarEventRescheduleProposals: OperatorAssistantProposedActionCalendarEventReschedule[];
      /** S1 — queue dashboard resolution after operator confirms (same path as Today / Record resolution). */
      escalationResolveProposals: OperatorAssistantProposedActionEscalationResolve[];
    };

const OPERATOR_RIBBON_COPY =
  "Internal assistant for your workflow only. Do not paste into client-facing messages.";

function normalizedReply(reply: unknown): string {
  return typeof reply === "string" && reply.trim().length > 0
    ? reply.trim()
    : "No reply returned. Please try again.";
}

/**
 * Structured assistant turn for the widget. Fails closed when `clientFacingForbidden !== true`.
 */
export function buildOperatorStudioAssistantAssistantDisplay(
  payload: OperatorStudioAssistantInvokePayload | null | undefined,
  options: { devMode: boolean },
): OperatorStudioAssistantAssistantDisplay {
  if (payload?.clientFacingForbidden !== true) {
    return { kind: "contract_violation", mainText: OPERATOR_STUDIO_ASSISTANT_CONTRACT_VIOLATION_MESSAGE };
  }

  const reply = normalizedReply(payload.reply);

  const devRetrieval =
    options.devMode && payload.retrievalLog
      ? {
          scopes: [...(payload.retrievalLog.scopesQueried ?? [])],
          memoryIds: [...(payload.retrievalLog.selectedMemoryIds ?? [])],
        }
      : null;

  const playbookRuleProposals = normalizePlaybookRuleProposals(payload.proposedActions);
  const taskProposals = normalizeTaskProposals(payload.proposedActions);
  const memoryNoteProposals = normalizeMemoryNoteProposals(payload.proposedActions);
  const authorizedCaseExceptionProposals = normalizeAuthorizedCaseExceptionProposals(payload.proposedActions);
  const studioProfileChangeProposals = normalizeStudioProfileChangeProposalsForWidget(payload.proposedActions);
  const offerBuilderChangeProposals = normalizeOfferBuilderChangeProposalsForWidget(payload.proposedActions);
  const invoiceSetupChangeProposals = normalizeInvoiceSetupChangeProposalsForWidget(payload.proposedActions);
  const calendarEventCreateProposals = normalizeCalendarEventCreateProposals(payload.proposedActions);
  const calendarEventRescheduleProposals = normalizeCalendarEventRescheduleProposals(payload.proposedActions);
  const escalationResolveProposals = normalizeEscalationResolveProposals(payload.proposedActions);

  return {
    kind: "answer",
    mainText: reply,
    operatorRibbon: OPERATOR_RIBBON_COPY,
    devRetrieval,
    playbookRuleProposals,
    taskProposals,
    memoryNoteProposals,
    authorizedCaseExceptionProposals,
    studioProfileChangeProposals,
    offerBuilderChangeProposals,
    invoiceSetupChangeProposals,
    calendarEventCreateProposals,
    calendarEventRescheduleProposals,
    escalationResolveProposals,
  };
}

function normalizePlaybookRuleProposals(raw: unknown): OperatorAssistantProposedActionPlaybookRuleCandidate[] {
  if (!Array.isArray(raw)) return [];
  const out: OperatorAssistantProposedActionPlaybookRuleCandidate[] = [];
  for (const x of raw) {
    if (!x || typeof x !== "object" || (x as { kind?: string }).kind !== "playbook_rule_candidate") continue;
    const o = x as Record<string, unknown>;
    if (typeof o.proposedActionKey !== "string" || typeof o.topic !== "string" || typeof o.proposedInstruction !== "string") {
      continue;
    }
    if (
      o.proposedDecisionMode !== "auto" &&
      o.proposedDecisionMode !== "draft_only" &&
      o.proposedDecisionMode !== "ask_first" &&
      o.proposedDecisionMode !== "forbidden"
    ) {
      continue;
    }
    if (o.proposedScope !== "global" && o.proposedScope !== "channel") continue;
    const ch = o.proposedChannel;
    if (ch != null && ch !== "email" && ch !== "web" && ch !== "whatsapp_operator" && ch !== "manual" && ch !== "system") {
      continue;
    }
    if (o.proposedScope === "global" && ch != null) continue;
    if (o.proposedScope === "channel" && ch == null) continue;
    const weddingId =
      typeof o.weddingId === "string" && o.weddingId.trim().length > 0 ? o.weddingId.trim() : null;
    out.push({
      kind: "playbook_rule_candidate",
      proposedActionKey: o.proposedActionKey,
      topic: o.topic,
      proposedInstruction: o.proposedInstruction,
      proposedDecisionMode: o.proposedDecisionMode,
      proposedScope: o.proposedScope,
      proposedChannel: o.proposedScope === "channel" ? (ch as OperatorAssistantProposedActionPlaybookRuleCandidate["proposedChannel"]) : null,
      weddingId,
    });
  }
  return out;
}

function normalizeTaskProposals(raw: unknown): OperatorAssistantProposedActionTask[] {
  if (!Array.isArray(raw)) return [];
  const out: OperatorAssistantProposedActionTask[] = [];
  for (const x of raw) {
    if (!x || typeof x !== "object" || (x as { kind?: string }).kind !== "task") continue;
    const o = x as Record<string, unknown>;
    if (typeof o.title !== "string" || o.title.trim().length === 0) continue;
    const dueStr =
      typeof o.dueDate === "string" && o.dueDate.trim().length > 0
        ? o.dueDate.trim()
        : typeof o.due_date === "string" && o.due_date.trim().length > 0
          ? o.due_date.trim()
          : defaultOperatorAssistantTaskDueDateUtcToday();
    const dueMs = Date.parse(dueStr);
    if (!Number.isFinite(dueMs)) continue;
    const d = new Date(dueMs);
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, "0");
    const day = String(d.getUTCDate()).padStart(2, "0");
    const dueDate = `${y}-${m}-${day}`;
    const weddingId =
      typeof o.weddingId === "string" && o.weddingId.trim().length > 0 ? o.weddingId.trim() : null;
    out.push({ kind: "task", title: o.title.trim(), dueDate, weddingId });
  }
  return out;
}

function normalizeMemoryNoteProposals(raw: unknown): OperatorAssistantProposedActionMemoryNote[] {
  if (!Array.isArray(raw)) return [];
  const out: OperatorAssistantProposedActionMemoryNote[] = [];
  for (const x of raw) {
    if (!x || typeof x !== "object" || (x as { kind?: string }).kind !== "memory_note") continue;
    const o = x as Record<string, unknown>;
    if (o.memoryScope !== "project" && o.memoryScope !== "studio" && o.memoryScope !== "person") continue;
    if (typeof o.title !== "string" || o.title.trim().length === 0) continue;
    const title = o.title.trim().slice(0, 120);
    const summ = typeof o.summary === "string" ? o.summary.trim() : "";
    const full = typeof o.fullContent === "string" ? o.fullContent.trim() : "";
    const long = full || summ;
    if (!long) continue;
    const summary = (summ || long).slice(0, 400);
    const fullContent = (full || long).slice(0, 8000);
    let weddingId: string | null = null;
    if (typeof o.weddingId === "string" && o.weddingId.trim().length > 0) {
      weddingId = o.weddingId.trim();
    }
    let personId: string | null = null;
    if (typeof o.personId === "string" && o.personId.trim().length > 0) {
      personId = o.personId.trim();
    }
    if (o.memoryScope === "project" && !weddingId) continue;
    if (o.memoryScope === "project" && personId) continue;
    if (o.memoryScope === "studio" && (weddingId || personId)) continue;
    if (o.memoryScope === "person" && !personId) continue;
    if (o.memoryScope === "person" && weddingId) continue;
    out.push({
      kind: "memory_note",
      memoryScope: o.memoryScope,
      title,
      summary,
      fullContent,
      weddingId: o.memoryScope === "project" ? weddingId : null,
      personId: o.memoryScope === "person" ? personId : null,
    });
  }
  return out;
}

const CASE_EXC_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isCaseExcScopeUuid(s: string): boolean {
  return CASE_EXC_UUID_RE.test(s.trim());
}

function normalizeAuthorizedCaseExceptionProposals(
  raw: unknown,
): OperatorAssistantProposedActionAuthorizedCaseException[] {
  if (!Array.isArray(raw)) return [];
  const out: OperatorAssistantProposedActionAuthorizedCaseException[] = [];
  for (const x of raw) {
    if (!x || typeof x !== "object" || (x as { kind?: string }).kind !== "authorized_case_exception") continue;
    const o = x as Record<string, unknown>;
    if (typeof o.overridesActionKey !== "string" || !o.overridesActionKey.trim()) continue;
    if (typeof o.weddingId !== "string" || !o.weddingId.trim()) continue;
    if (!isCaseExcScopeUuid(o.weddingId)) continue;
    if (!o.overridePayload || typeof o.overridePayload !== "object" || Array.isArray(o.overridePayload)) continue;
    const op = o.overridePayload as Record<string, unknown>;
    const hasMode =
      op.decision_mode === "auto" ||
      op.decision_mode === "draft_only" ||
      op.decision_mode === "ask_first" ||
      op.decision_mode === "forbidden";
    const hasAppend = typeof op.instruction_append === "string" && op.instruction_append.trim().length > 0;
    const hasInstr =
      "instruction_override" in op &&
      (op.instruction_override === null || typeof op.instruction_override === "string");
    if (!hasMode && !hasAppend && !hasInstr) continue;
    if (!hasMode && !hasAppend) {
      if (op.instruction_override === undefined) continue;
    }
    let clientThreadId: string | null = null;
    if (typeof o.clientThreadId === "string" && o.clientThreadId.trim().length > 0) {
      const tid = o.clientThreadId.trim();
      if (!isCaseExcScopeUuid(tid)) continue;
      clientThreadId = tid;
    }
    let targetPlaybookRuleId: string | null = null;
    if (typeof o.targetPlaybookRuleId === "string" && o.targetPlaybookRuleId.trim().length > 0) {
      const rid = o.targetPlaybookRuleId.trim();
      if (!isCaseExcScopeUuid(rid)) continue;
      targetPlaybookRuleId = rid;
    }
    let effectiveUntil: string | null = null;
    if (typeof o.effectiveUntil === "string" && o.effectiveUntil.trim().length > 0) {
      const ms = Date.parse(o.effectiveUntil.trim());
      if (Number.isFinite(ms)) {
        const d = new Date(ms);
        const y = d.getUTCFullYear();
        const m = String(d.getUTCMonth() + 1).padStart(2, "0");
        const day = String(d.getUTCDate()).padStart(2, "0");
        effectiveUntil = `${y}-${m}-${day}T00:00:00.000Z`;
      }
    }
    const notes = typeof o.notes === "string" && o.notes.trim().length > 0 ? o.notes.trim().slice(0, 2000) : null;
    const overridePayload: AuthorizedCaseExceptionOverridePayload = {};
    if (hasMode) {
      overridePayload.decision_mode = op.decision_mode as AuthorizedCaseExceptionOverridePayload["decision_mode"];
    }
    if (hasAppend) {
      overridePayload.instruction_append = String(op.instruction_append).trim();
    }
    if ("instruction_override" in op) {
      overridePayload.instruction_override =
        op.instruction_override === null ? null : typeof op.instruction_override === "string" ? op.instruction_override : undefined;
    }
    out.push({
      kind: "authorized_case_exception",
      overridesActionKey: o.overridesActionKey.trim().slice(0, 200),
      overridePayload,
      weddingId: o.weddingId.trim(),
      clientThreadId,
      targetPlaybookRuleId,
      effectiveUntil,
      notes,
    });
  }
  return out;
}

const CAL_EVENT_TYPES = ["about_call", "timeline_call", "gallery_reveal", "other"] as const;

function normalizeCalendarEventCreateProposals(raw: unknown): OperatorAssistantProposedActionCalendarEventCreate[] {
  if (!Array.isArray(raw)) return [];
  const out: OperatorAssistantProposedActionCalendarEventCreate[] = [];
  for (const x of raw) {
    if (!x || typeof x !== "object" || (x as { kind?: string }).kind !== "calendar_event_create") continue;
    const o = x as Record<string, unknown>;
    const title = typeof o.title === "string" ? o.title.trim() : "";
    if (!title || title.length > 500) continue;
    const startMs = Date.parse(typeof o.startTime === "string" ? o.startTime : String(o.start_time ?? ""));
    const endMs = Date.parse(typeof o.endTime === "string" ? o.endTime : String(o.end_time ?? ""));
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) continue;
    if (endMs - startMs > 24 * 60 * 60 * 1000) continue;
    let eventType: (typeof CAL_EVENT_TYPES)[number] = "other";
    const et = o.eventType ?? o.event_type;
    if (typeof et === "string" && (CAL_EVENT_TYPES as readonly string[]).includes(et)) {
      eventType = et as (typeof CAL_EVENT_TYPES)[number];
    }
    let weddingId: string | null = null;
    const wRaw = o.weddingId ?? o.wedding_id;
    if (typeof wRaw === "string" && wRaw.trim()) {
      if (!CASE_EXC_UUID_RE.test(wRaw.trim())) continue;
      weddingId = wRaw.trim();
    }
    out.push({
      kind: "calendar_event_create",
      title,
      startTime: new Date(startMs).toISOString(),
      endTime: new Date(endMs).toISOString(),
      eventType,
      weddingId,
    });
  }
  return out;
}

function normalizeCalendarEventRescheduleProposals(raw: unknown): OperatorAssistantProposedActionCalendarEventReschedule[] {
  if (!Array.isArray(raw)) return [];
  const out: OperatorAssistantProposedActionCalendarEventReschedule[] = [];
  for (const x of raw) {
    if (!x || typeof x !== "object" || (x as { kind?: string }).kind !== "calendar_event_reschedule") continue;
    const o = x as Record<string, unknown>;
    const calendarEventIdRaw = o.calendarEventId ?? o.calendar_event_id;
    if (typeof calendarEventIdRaw !== "string" || !CASE_EXC_UUID_RE.test(calendarEventIdRaw.trim())) continue;
    const calendarEventId = calendarEventIdRaw.trim();
    const startMs = Date.parse(typeof o.startTime === "string" ? o.startTime : String(o.start_time ?? ""));
    const endMs = Date.parse(typeof o.endTime === "string" ? o.endTime : String(o.end_time ?? ""));
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) continue;
    if (endMs - startMs > 24 * 60 * 60 * 1000) continue;
    out.push({
      kind: "calendar_event_reschedule",
      calendarEventId,
      startTime: new Date(startMs).toISOString(),
      endTime: new Date(endMs).toISOString(),
    });
  }
  return out;
}

const ESC_RESOLVE_MAX_SUMMARY = 2000;
const ESC_RESOLVE_MAX_REPLY = 8000;

function normalizeEscalationResolveProposals(raw: unknown): OperatorAssistantProposedActionEscalationResolve[] {
  if (!Array.isArray(raw)) return [];
  const out: OperatorAssistantProposedActionEscalationResolve[] = [];
  for (const x of raw) {
    if (!x || typeof x !== "object" || (x as { kind?: string }).kind !== "escalation_resolve") continue;
    const o = x as Record<string, unknown>;
    const escalationId = typeof o.escalationId === "string" ? o.escalationId.trim() : "";
    if (!CASE_EXC_UUID_RE.test(escalationId)) continue;
    const resolutionSummary = typeof o.resolutionSummary === "string" ? o.resolutionSummary.trim() : "";
    if (!resolutionSummary || resolutionSummary.length > ESC_RESOLVE_MAX_SUMMARY) continue;
    let photographerReplyRaw: string | null = null;
    if (typeof o.photographerReplyRaw === "string" && o.photographerReplyRaw.trim().length > 0) {
      const reply = o.photographerReplyRaw.trim();
      if (reply.length > ESC_RESOLVE_MAX_REPLY) continue;
      photographerReplyRaw = reply;
    }
    out.push({
      kind: "escalation_resolve",
      escalationId,
      resolutionSummary,
      photographerReplyRaw,
    });
  }
  return out;
}
