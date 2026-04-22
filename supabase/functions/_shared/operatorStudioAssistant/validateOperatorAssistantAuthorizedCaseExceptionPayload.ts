/**
 * Validate case-exception proposals and confirm body (Slice 11). Shapes match {@link AuthorizedCaseExceptionOverridePayload}.
 */
import type { Database } from "../../../../src/types/database.types.ts";
import type { AuthorizedCaseExceptionOverridePayload } from "../../../../src/types/decisionContext.types.ts";
import type {
  InsertOperatorAssistantAuthorizedCaseExceptionBody,
  OperatorAssistantProposedActionAuthorizedCaseException,
} from "../../../../src/types/operatorAssistantProposedAction.types.ts";

const MAX_ACTION_KEY = 200;
const MAX_NOTES = 2000;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(s: string): boolean {
  return UUID_RE.test(s);
}

function trimKey(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  if (!t) return null;
  return t.length > MAX_ACTION_KEY ? t.slice(0, MAX_ACTION_KEY) : t;
}

function normalizeOverridePayload(raw: unknown): { ok: true; value: AuthorizedCaseExceptionOverridePayload } | { ok: false; error: string } {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, error: "overridePayload must be an object" };
  }
  const o = raw as Record<string, unknown>;
  const out: AuthorizedCaseExceptionOverridePayload = {};
  if (o.decision_mode != null) {
    const m = o.decision_mode;
    if (m !== "auto" && m !== "draft_only" && m !== "ask_first" && m !== "forbidden") {
      return { ok: false, error: "overridePayload.decision_mode invalid" };
    }
    out.decision_mode = m as Database["public"]["Enums"]["decision_mode"];
  }
  if ("instruction_override" in o) {
    if (o.instruction_override === null) {
      out.instruction_override = null;
    } else if (typeof o.instruction_override === "string") {
      out.instruction_override = o.instruction_override;
    } else {
      return { ok: false, error: "overridePayload.instruction_override must be string or null" };
    }
  }
  if (o.instruction_append != null) {
    if (typeof o.instruction_append !== "string") {
      return { ok: false, error: "overridePayload.instruction_append must be a string" };
    }
    const t = o.instruction_append.trim();
    if (t.length > 0) out.instruction_append = t;
  }
  if (!payloadHasEffect(out)) {
    return { ok: false, error: "overridePayload must change policy (decision_mode, instruction_append, and/or instruction_override)" };
  }
  return { ok: true, value: out };
}

export function payloadHasEffect(p: AuthorizedCaseExceptionOverridePayload): boolean {
  return Boolean(
    p.decision_mode ||
      (p.instruction_append && String(p.instruction_append).length > 0) ||
      (p.instruction_override !== undefined && p.instruction_override !== null) ||
      (p.instruction_override === ""),
  );
}

export type ValidatedOperatorAssistantAuthorizedCaseExceptionPayload = InsertOperatorAssistantAuthorizedCaseExceptionBody;

export function validateOperatorAssistantAuthorizedCaseExceptionPayload(
  raw: unknown,
): { ok: true; value: ValidatedOperatorAssistantAuthorizedCaseExceptionPayload } | { ok: false; error: string } {
  if (raw == null || typeof raw !== "object") {
    return { ok: false, error: "payload must be an object" };
  }
  const o = raw as Record<string, unknown>;
  const overridesActionKey = trimKey(o.overridesActionKey ?? o.overrides_action_key);
  if (!overridesActionKey) {
    return { ok: false, error: "overridesActionKey is required" };
  }
  if (typeof o.weddingId !== "string" || !isUuid(o.weddingId.trim())) {
    return { ok: false, error: "weddingId must be a valid UUID" };
  }
  const weddingId = o.weddingId.trim();
  const pl = normalizeOverridePayload(o.overridePayload);
  if (!pl.ok) return pl;

  let clientThreadId: string | null = null;
  if (o.clientThreadId != null && o.clientThreadId !== "") {
    if (typeof o.clientThreadId !== "string" || !isUuid(o.clientThreadId.trim())) {
      return { ok: false, error: "clientThreadId must be a valid UUID when set" };
    }
    clientThreadId = o.clientThreadId.trim();
  } else if (o.thread_id != null && o.thread_id !== "") {
    if (typeof o.thread_id !== "string" || !isUuid(String(o.thread_id).trim())) {
      return { ok: false, error: "thread_id must be a valid UUID when set" };
    }
    clientThreadId = String(o.thread_id).trim();
  }

  let targetPlaybookRuleId: string | null = null;
  if (o.targetPlaybookRuleId != null && o.targetPlaybookRuleId !== "") {
    if (typeof o.targetPlaybookRuleId !== "string" || !isUuid(o.targetPlaybookRuleId.trim())) {
      return { ok: false, error: "targetPlaybookRuleId must be a valid UUID when set" };
    }
    targetPlaybookRuleId = o.targetPlaybookRuleId.trim();
  } else if (o.target_playbook_rule_id != null && o.target_playbook_rule_id !== "") {
    if (typeof o.target_playbook_rule_id !== "string" || !isUuid(String(o.target_playbook_rule_id).trim())) {
      return { ok: false, error: "target_playbook_rule_id must be a valid UUID when set" };
    }
    targetPlaybookRuleId = String(o.target_playbook_rule_id).trim();
  }

  let effectiveUntil: string | null = null;
  if (o.effectiveUntil != null && o.effectiveUntil !== "") {
    if (typeof o.effectiveUntil !== "string") return { ok: false, error: "effectiveUntil must be a string" };
    const ms = Date.parse(o.effectiveUntil.trim());
    if (!Number.isFinite(ms)) return { ok: false, error: "effectiveUntil is not a parseable date" };
    effectiveUntil = new Date(ms).toISOString();
  } else if (o.effective_until != null && o.effective_until !== "") {
    if (typeof o.effective_until !== "string") return { ok: false, error: "effective_until must be a string" };
    const ms = Date.parse(String(o.effective_until).trim());
    if (!Number.isFinite(ms)) return { ok: false, error: "effective_until is not a parseable date" };
    effectiveUntil = new Date(ms).toISOString();
  }

  let notes: string | null = null;
  if (typeof o.notes === "string" && o.notes.trim().length > 0) {
    notes = o.notes.trim().length > MAX_NOTES ? o.notes.trim().slice(0, MAX_NOTES) : o.notes.trim();
  }

  return {
    ok: true,
    value: {
      overridesActionKey,
      overridePayload: pl.value,
      weddingId,
      clientThreadId,
      targetPlaybookRuleId,
      effectiveUntil,
      notes,
    },
  };
}

export function tryParseLlmProposedAuthorizedCaseException(
  item: unknown,
):
  | { ok: true; value: OperatorAssistantProposedActionAuthorizedCaseException }
  | { ok: false; reason: string } {
  if (item == null || typeof item !== "object" || (item as { kind?: unknown }).kind !== "authorized_case_exception") {
    return { ok: false, reason: "not an authorized_case_exception" };
  }
  const v = validateOperatorAssistantAuthorizedCaseExceptionPayload(item);
  if (!v.ok) return { ok: false, reason: v.error };
  return {
    ok: true,
    value: {
      kind: "authorized_case_exception",
      overridesActionKey: v.value.overridesActionKey,
      overridePayload: v.value.overridePayload,
      weddingId: v.value.weddingId,
      clientThreadId: v.value.clientThreadId,
      targetPlaybookRuleId: v.value.targetPlaybookRuleId,
      effectiveUntil: v.value.effectiveUntil,
      notes: v.value.notes,
    },
  };
}
