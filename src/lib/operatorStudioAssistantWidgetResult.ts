/**
 * Pure helpers for {@link SupportAssistantWidget} contract enforcement (fail closed)
 * and structured display (footer / dev retrieval).
 */
import type { AuthorizedCaseExceptionOverridePayload } from "../types/decisionContext.types.ts";
import type {
  OperatorAssistantProposedActionAuthorizedCaseException,
  OperatorAssistantProposedActionMemoryNote,
  OperatorAssistantProposedActionPlaybookRuleCandidate,
  OperatorAssistantProposedActionTask,
} from "../types/operatorAssistantProposedAction.types.ts";

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
      /** Slice 8 — memory proposals; confirm inserts a `memories` row (project | studio). */
      memoryNoteProposals: OperatorAssistantProposedActionMemoryNote[];
      /** Slice 11 — case-scoped policy exception; confirm inserts `authorized_case_exceptions` only. */
      authorizedCaseExceptionProposals: OperatorAssistantProposedActionAuthorizedCaseException[];
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

  return {
    kind: "answer",
    mainText: reply,
    operatorRibbon: OPERATOR_RIBBON_COPY,
    devRetrieval,
    playbookRuleProposals,
    taskProposals,
    memoryNoteProposals,
    authorizedCaseExceptionProposals,
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
    if (typeof o.dueDate !== "string" || o.dueDate.trim().length === 0) continue;
    const dueMs = Date.parse(o.dueDate.trim());
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
    if (o.memoryScope !== "project" && o.memoryScope !== "studio") continue;
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
    if (o.memoryScope === "project" && !weddingId) continue;
    if (o.memoryScope === "studio" && weddingId) continue;
    out.push({
      kind: "memory_note",
      memoryScope: o.memoryScope,
      title,
      summary,
      fullContent,
      weddingId: o.memoryScope === "project" ? weddingId : null,
    });
  }
  return out;
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
      clientThreadId = o.clientThreadId.trim();
    }
    let targetPlaybookRuleId: string | null = null;
    if (typeof o.targetPlaybookRuleId === "string" && o.targetPlaybookRuleId.trim().length > 0) {
      targetPlaybookRuleId = o.targetPlaybookRuleId.trim();
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
