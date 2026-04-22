import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { AssistantContext, AssistantRetrievalLog } from "../../../../src/types/assistantContext.types.ts";
import type { OperatorAnaCarryForwardClientState } from "../../../../src/types/operatorAnaCarryForward.types.ts";
import type { OperatorAnaWebConversationMessage } from "../../../../src/lib/operatorAnaWidgetConversationBounds.ts";
import type { OperatorAssistantProposedAction } from "../../../../src/types/operatorAssistantProposedAction.types.ts";
import { buildAssistantContext } from "../context/buildAssistantContext.ts";
import { completeOperatorStudioAssistantLlm, completeOperatorStudioAssistantLlmStreaming } from "./completeOperatorStudioAssistantLlm.ts";
import type { ReadOnlyLookupToolOutcome } from "./parseOperatorStudioAssistantLlmResponse.ts";
import {
  buildClientCarryForwardState,
  buildOperatorAnaCarryForwardTelemetry,
  extractCarryForwardDataFromTurn,
} from "./operatorAssistantCarryForward.ts";
import { OperatorStudioAssistantValidationError } from "./operatorStudioAssistantHttp.ts";
import { validateAndNormalizeOperatorStudioAssistantConversation } from "./validateOperatorStudioAssistantConversation.ts";

const SPECIALIST_PIN_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function normalizeEscalationResolverPin(raw: unknown): string | null {
  if (raw == null) return null;
  const t = String(raw).trim();
  if (!t) return null;
  if (!SPECIALIST_PIN_UUID_RE.test(t)) {
    throw new OperatorStudioAssistantValidationError("escalationResolverEscalationId must be a UUID when set");
  }
  return t;
}

function normalizeOfferBuilderSpecialistPin(raw: unknown): string | null {
  if (raw == null) return null;
  const t = String(raw).trim();
  if (!t) return null;
  if (!SPECIALIST_PIN_UUID_RE.test(t)) {
    throw new OperatorStudioAssistantValidationError("offerBuilderSpecialistProjectId must be a UUID when set");
  }
  return t;
}

/** When S3 is active, drops **invoice_setup_change_proposal** unless grounded read **selectionNote** is **ok** (saved row). */
export function applyInvoiceSetupSpecialistProposalGate(
  ctx: AssistantContext,
  actions: OperatorAssistantProposedAction[],
): OperatorAssistantProposedAction[] {
  if (!ctx.invoiceSetupSpecialistFocus) {
    return actions;
  }
  const payload = ctx.invoiceSetupSpecialistFocus.toolPayload;
  let selectionNote: string | null = null;
  if (payload && typeof payload === "object") {
    const p = payload as { selectionNote?: string };
    if (typeof p.selectionNote === "string") selectionNote = p.selectionNote;
  }
  const allow = selectionNote === "ok";

  return actions.filter((a) => {
    if (a.kind !== "invoice_setup_change_proposal") return true;
    return allow;
  });
}

/** When S2 pin is active, drops **offer_builder_change_proposal** unless snapshot ok and **project_id** matches pin. */
export function applyOfferBuilderSpecialistProposalGate(
  ctx: AssistantContext,
  actions: OperatorAssistantProposedAction[],
): OperatorAssistantProposedAction[] {
  const pin = ctx.offerBuilderSpecialistFocus?.pinnedProjectId ?? null;
  if (!pin) {
    return actions;
  }
  const payload = ctx.offerBuilderSpecialistFocus?.toolPayload;
  let selectionNote: string | null = null;
  if (payload && typeof payload === "object") {
    const p = payload as { selectionNote?: string };
    if (typeof p.selectionNote === "string") selectionNote = p.selectionNote;
  }
  const allow = selectionNote === "ok";

  return actions.filter((a) => {
    if (a.kind !== "offer_builder_change_proposal") return true;
    if (!allow) return false;
    return a.project_id.trim() === pin;
  });
}

/** Drops stray **escalation_resolve** proposals unless resolver mode + open pinned row + id match (S1). */
export function applyEscalationResolverProposalGate(
  ctx: AssistantContext,
  actions: OperatorAssistantProposedAction[],
): OperatorAssistantProposedAction[] {
  const pin = ctx.escalationResolverFocus?.pinnedEscalationId ?? null;
  const payload = ctx.escalationResolverFocus?.toolPayload;
  let status: string | null = null;
  let selectionNote: string | null = null;
  if (payload && typeof payload === "object") {
    const p = payload as { selectionNote?: string; escalation?: { status?: string } };
    if (typeof p.selectionNote === "string") selectionNote = p.selectionNote;
    if (p.escalation && typeof p.escalation.status === "string") status = p.escalation.status;
  }
  const allowResolve = pin != null && selectionNote === "ok" && status === "open";

  if (!pin) {
    return actions.filter((a) => a.kind !== "escalation_resolve");
  }
  return actions.filter((a) => {
    if (a.kind !== "escalation_resolve") return true;
    if (!allowResolve) return false;
    return a.escalationId === pin;
  });
}

/**
 * S5 — only **playbook_rule_candidate** proposals pass; all other kinds are dropped (review-first reusable policy lane).
 */
export function applyPlaybookAuditSpecialistProposalGate(
  ctx: AssistantContext,
  actions: OperatorAssistantProposedAction[],
): OperatorAssistantProposedAction[] {
  if (!ctx.playbookAuditSpecialistFocus) {
    return actions;
  }
  return actions.filter((a) => a.kind === "playbook_rule_candidate");
}

/**
 * S6 — at most **one** proposed action per turn (no multi-confirm batch from a single reply).
 */
export function applyBulkTriageSpecialistProposalGate(
  ctx: AssistantContext,
  actions: OperatorAssistantProposedAction[],
): OperatorAssistantProposedAction[] {
  if (!ctx.bulkTriageSpecialistFocus) {
    return actions;
  }
  if (actions.length <= 1) {
    return actions;
  }
  return actions.slice(0, 1);
}

export type OperatorStudioAssistantRequestBody = {
  queryText?: string;
  focusedWeddingId?: string | null;
  focusedPersonId?: string | null;
  /** S1 — optional pinned escalation UUID (explicit resolver mode entry from the client). */
  escalationResolverEscalationId?: string | null;
  /** S2 — optional pinned offer-builder project UUID (`studio_offer_builder_projects.id`). Mutually exclusive with S1 pin. */
  offerBuilderSpecialistProjectId?: string | null;
  /** S3 — invoice PDF template specialist mode. Mutually exclusive with S1 and S2. */
  invoiceSetupSpecialist?: boolean;
  /** S4 — deep search / investigation mode. Mutually exclusive with S1–S3, S5, and S6. */
  investigationSpecialist?: boolean;
  /** S5 — rule authoring / audit mode. Mutually exclusive with S1–S4 and S6. */
  playbookAuditSpecialist?: boolean;
  /** S6 — bulk Today / queue triage mode. Mutually exclusive with S1–S5. */
  bulkTriageSpecialist?: boolean;
  /** Optional bounded client-only session; validated and passed as LLM `messages[]`, not stored. */
  conversation?: unknown;
  /** Slice 6 — client round-trip carry-forward from the previous response. */
  carryForward?: unknown;
};

export type OperatorStudioAssistantResponseBody = {
  reply: string;
  /** Slice 6–11 — rule, task, memory, and/or case-exception proposals (confirm via the matching insert edge functions). */
  proposedActions?: OperatorAssistantProposedAction[];
  clientFacingForbidden: true;
  retrievalLog: AssistantRetrievalLog;
  /** Slice 6 — pointer to send on the next request (null if nothing to carry). */
  carryForward?: OperatorAnaCarryForwardClientState | null;
};

export type OperatorStudioAssistantValidatedRequest = {
  queryText: string;
  conversation: OperatorAnaWebConversationMessage[];
};

/**
 * Shared validation for JSON and non-SSE error responses. Callers may run this before starting an SSE body
 * so invalid requests never return `text/event-stream`.
 */
export function parseAndValidateOperatorStudioAssistantRequest(
  body: OperatorStudioAssistantRequestBody,
): OperatorStudioAssistantValidatedRequest {
  const escalationPin = normalizeEscalationResolverPin(body.escalationResolverEscalationId ?? null);
  const offerBuilderPin = normalizeOfferBuilderSpecialistPin(body.offerBuilderSpecialistProjectId ?? null);
  const invoiceSetupSpecialist = body.invoiceSetupSpecialist === true;
  const investigationSpecialist = body.investigationSpecialist === true;
  const playbookAuditSpecialist = body.playbookAuditSpecialist === true;
  const bulkTriageSpecialist = body.bulkTriageSpecialist === true;
  const specialistCount =
    (escalationPin ? 1 : 0) +
    (offerBuilderPin ? 1 : 0) +
    (invoiceSetupSpecialist ? 1 : 0) +
    (investigationSpecialist ? 1 : 0) +
    (playbookAuditSpecialist ? 1 : 0) +
    (bulkTriageSpecialist ? 1 : 0);
  if (specialistCount > 1) {
    throw new OperatorStudioAssistantValidationError(
      "At most one of escalationResolverEscalationId, offerBuilderSpecialistProjectId, invoiceSetupSpecialist, investigationSpecialist, playbookAuditSpecialist, and bulkTriageSpecialist may be set",
    );
  }
  let queryText = String(body.queryText ?? "").trim();
  if (!queryText && escalationPin) {
    queryText =
      "[Escalation resolver mode] Help me interpret this pinned escalation and, when I agree, draft resolution text to queue on the dashboard.";
  }
  if (!queryText && offerBuilderPin) {
    queryText =
      "[Offer builder specialist mode] I'm focused on this one offer document. Help me understand the grounded outline, suggest bounded name/title changes if useful, and only use offer_builder_change_proposal when I agree — no layout or Puck JSON edits.";
  }
  if (!queryText && invoiceSetupSpecialist) {
    queryText =
      "[Invoice setup specialist mode] I'm focused on invoice PDF template settings for my studio. Help with grounded legal name, prefix, payment terms, accent color, and footer — bounded invoice_setup_change_proposal only (no logo binary or arbitrary JSON).";
  }
  if (!queryText && investigationSpecialist) {
    queryText =
      "[Investigation mode] I need to investigate across threads, projects, queue, or escalations using only grounded reads. Walk me through evidence step by step; cite tool results and say when something was not retrieved.";
  }
  if (!queryText && playbookAuditSpecialist) {
    queryText =
      "[Rule audit mode] Help me review effective playbook coverage (topics and action keys), gaps, and overlaps using only the Context playbook blocks. For new reusable studio-wide rules, use playbook_rule_candidate proposals only — I will confirm in chat and promote candidates on Rule candidates (review). Do not describe direct playbook_rules edits.";
  }
  if (!queryText && bulkTriageSpecialist) {
    queryText =
      "[Bulk triage mode] Help me work through my Today / operator queue using only the grounded queue snapshot (counts, samples, highlights). Group what matters first, then suggest explicit next steps item by item. If you propose an action, only one confirmable proposal this turn — no batch automation.";
  }
  if (!queryText) {
    throw new OperatorStudioAssistantValidationError("queryText is required");
  }
  const conv = validateAndNormalizeOperatorStudioAssistantConversation(body.conversation);
  if (!conv.ok) {
    throw new OperatorStudioAssistantValidationError(conv.error);
  }
  return { queryText, conversation: conv.value };
}

/**
 * Authenticated operator assistant turn: {@link buildAssistantContext} + operator-only LLM completion.
 */
export async function handleOperatorStudioAssistantPost(
  supabase: SupabaseClient,
  photographerId: string,
  body: OperatorStudioAssistantRequestBody,
): Promise<OperatorStudioAssistantResponseBody> {
  const { queryText, conversation } = parseAndValidateOperatorStudioAssistantRequest(body);

  const ctx = await buildAssistantContext(supabase, photographerId, {
    queryText,
    focusedWeddingId: body.focusedWeddingId ?? null,
    focusedPersonId: body.focusedPersonId ?? null,
    carryForward: body.carryForward,
    escalationResolverEscalationId: body.escalationResolverEscalationId ?? null,
    offerBuilderSpecialistProjectId: body.offerBuilderSpecialistProjectId ?? null,
    invoiceSetupSpecialist: body.invoiceSetupSpecialist === true,
    investigationSpecialist: body.investigationSpecialist === true,
    playbookAuditSpecialist: body.playbookAuditSpecialist === true,
    bulkTriageSpecialist: body.bulkTriageSpecialist === true,
  });

  let reply: string;
  let proposedActions: OperatorAssistantProposedAction[] | undefined;
  let readOnlyLookupToolTrace: AssistantRetrievalLog["readOnlyLookupTools"] | undefined;
  let readOnlyLookupToolOutcomes: ReadOnlyLookupToolOutcome[] | undefined;
  try {
    const out = await completeOperatorStudioAssistantLlm(ctx, { conversation, supabase });
    reply = out.reply;
    const gatedEsc = applyEscalationResolverProposalGate(ctx, out.proposedActions);
    const gatedOb = applyOfferBuilderSpecialistProposalGate(ctx, gatedEsc);
    const gatedInv = applyInvoiceSetupSpecialistProposalGate(ctx, gatedOb);
    const gatedAudit = applyPlaybookAuditSpecialistProposalGate(ctx, gatedInv);
    const gated = applyBulkTriageSpecialistProposalGate(ctx, gatedAudit);
    proposedActions = gated.length > 0 ? gated : undefined;
    readOnlyLookupToolTrace = out.readOnlyLookupToolTrace;
    readOnlyLookupToolOutcomes = out.readOnlyLookupToolOutcomes;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn(
      JSON.stringify({
        type: "operator_studio_assistant_llm_failed",
        photographerId,
        reason: msg,
        retrievalFingerprint: ctx.retrievalLog.queryDigest.fingerprint,
      }),
    );
    reply = [
      "[Studio assistant - retrieval succeeded, reply generation failed]",
      `Reason: ${msg}`,
      "",
      "Retrieval summary:",
      `- Memory ids: ${ctx.retrievalLog.selectedMemoryIds.join(", ") || "(none)"}`,
      `- KB rows: ${ctx.retrievalLog.globalKnowledgeRowCount}`,
      `- Scopes: ${ctx.retrievalLog.scopesQueried.join(", ")}`,
    ].join("\n");
  }

  const retrievalLog: AssistantRetrievalLog = readOnlyLookupToolTrace
    ? { ...ctx.retrievalLog, readOnlyLookupTools: readOnlyLookupToolTrace }
    : ctx.retrievalLog;

  const outArr = (readOnlyLookupToolOutcomes ?? []) as ReadOnlyLookupToolOutcome[];
  const cfTelemetry = buildOperatorAnaCarryForwardTelemetry(ctx, outArr);
  console.log(JSON.stringify(cfTelemetry));
  const extracted = extractCarryForwardDataFromTurn(
    ctx,
    outArr as Array<{ name: string; ok: boolean; content: string }>,
  );
  const carryForward = buildClientCarryForwardState(extracted, Date.now(), {
    weddingId: ctx.focusedWeddingId,
    personId: ctx.focusedPersonId,
  });

  return {
    reply,
    proposedActions,
    clientFacingForbidden: true,
    retrievalLog,
    carryForward: carryForward ?? null,
  };
}

export type OnOperatorStudioAssistantStreamToken = (delta: string) => void;

export type HandleOperatorStudioAssistantPostStreamingOptions = {
  /** When set, forwards to {@link completeOperatorStudioAssistantLlmStreaming} for OpenAI `fetch` cancellation. */
  signal?: AbortSignal;
  /** When set, skips a second `parseAndValidate` after the edge already validated (same request). */
  prevalidated?: OperatorStudioAssistantValidatedRequest;
};

/**
 * Same as {@link handleOperatorStudioAssistantPost} but streams reply text via `onToken` and does **not** use the
 * long fallback message on LLM failure — callers (SSE) must surface failures as a terminal `error` event.
 */
export async function handleOperatorStudioAssistantPostStreaming(
  supabase: SupabaseClient,
  photographerId: string,
  body: OperatorStudioAssistantRequestBody,
  onToken: OnOperatorStudioAssistantStreamToken,
  options: HandleOperatorStudioAssistantPostStreamingOptions = {},
): Promise<OperatorStudioAssistantResponseBody> {
  const { queryText, conversation } = options.prevalidated
    ? options.prevalidated
    : parseAndValidateOperatorStudioAssistantRequest(body);

  const ctx = await buildAssistantContext(supabase, photographerId, {
    queryText,
    focusedWeddingId: body.focusedWeddingId ?? null,
    focusedPersonId: body.focusedPersonId ?? null,
    carryForward: body.carryForward,
    escalationResolverEscalationId: body.escalationResolverEscalationId ?? null,
    offerBuilderSpecialistProjectId: body.offerBuilderSpecialistProjectId ?? null,
    invoiceSetupSpecialist: body.invoiceSetupSpecialist === true,
    investigationSpecialist: body.investigationSpecialist === true,
    playbookAuditSpecialist: body.playbookAuditSpecialist === true,
    bulkTriageSpecialist: body.bulkTriageSpecialist === true,
  });

  let out: Awaited<ReturnType<typeof completeOperatorStudioAssistantLlmStreaming>>;
  try {
    out = await completeOperatorStudioAssistantLlmStreaming(
      ctx,
      { conversation, supabase, signal: options.signal },
      onToken,
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn(
      JSON.stringify({
        type: "operator_studio_assistant_llm_failed",
        photographerId,
        reason: msg,
        retrievalFingerprint: ctx.retrievalLog.queryDigest.fingerprint,
      }),
    );
    throw e;
  }
  const reply = out.reply;
  const gatedEsc = applyEscalationResolverProposalGate(ctx, out.proposedActions);
  const gatedOb = applyOfferBuilderSpecialistProposalGate(ctx, gatedEsc);
  const gatedInv = applyInvoiceSetupSpecialistProposalGate(ctx, gatedOb);
  const gatedAudit = applyPlaybookAuditSpecialistProposalGate(ctx, gatedInv);
  const gated = applyBulkTriageSpecialistProposalGate(ctx, gatedAudit);
  const proposedActions = gated.length > 0 ? gated : undefined;
  const readOnlyLookupToolTrace = out.readOnlyLookupToolTrace;
  const readOnlyLookupToolOutcomes = out.readOnlyLookupToolOutcomes;

  const retrievalLog: AssistantRetrievalLog = readOnlyLookupToolTrace
    ? { ...ctx.retrievalLog, readOnlyLookupTools: readOnlyLookupToolTrace }
    : ctx.retrievalLog;

  const outArr = (readOnlyLookupToolOutcomes ?? []) as ReadOnlyLookupToolOutcome[];
  const cfTelemetry = buildOperatorAnaCarryForwardTelemetry(ctx, outArr);
  console.log(JSON.stringify(cfTelemetry));
  const extracted = extractCarryForwardDataFromTurn(ctx, outArr as Array<{ name: string; ok: boolean; content: string }>);
  const carryForward = buildClientCarryForwardState(extracted, Date.now(), {
    weddingId: ctx.focusedWeddingId,
    personId: ctx.focusedPersonId,
  });

  return {
    reply,
    proposedActions,
    clientFacingForbidden: true,
    retrievalLog,
    carryForward: carryForward ?? null,
  };
}
