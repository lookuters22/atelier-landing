import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence, useMotionValue } from "framer-motion";
import { useLocation } from "react-router-dom";
import { supabase } from "../lib/supabase";
import {
  deriveOperatorAnaFocusFromPathname,
  operatorAnaFocusBadgeLabel,
} from "../lib/operatorStudioAssistantFocus.ts";
import {
  buildOperatorAnaWidgetConversation,
  extractOperatorAnaWidgetCompletedTurns,
} from "../lib/operatorAnaWidgetConversation.ts";
import type { OperatorAnaWidgetFocusSnapshot } from "../lib/operatorAnaWidgetConversationBounds.ts";
import {
  buildOperatorStudioAssistantAssistantDisplay,
  type OperatorStudioAssistantAssistantDisplay,
  type OperatorStudioAssistantInvokePayload,
} from "../lib/operatorStudioAssistantWidgetResult.ts";
import { logAnaStreamLine, operatorAnaStreamDebugEnabled } from "../lib/operatorAnaStreamDebug.ts";
import {
  computeRevealNewLength,
  type RevealState,
  shouldBypassPacedDrain,
} from "../lib/operatorAnaStreamSmoothReveal.ts";
import { consumeOperatorAssistantSseStream } from "../lib/operatorStudioAssistantStreamClient.ts";
import { getSupabaseEdgeFunctionErrorMessage } from "../lib/supabaseEdgeFunctionErrorMessage.ts";
import {
  addConsumedProposalKey,
  calendarEventCreateProposalKey,
  calendarEventRescheduleProposalKey,
  caseExceptionProposalKey,
  escalationResolveProposalKey,
  isProposalKeyConsumed,
  memoryProposalKey,
  invoiceSetupChangeProposalKey,
  offerBuilderChangeProposalKey,
  ruleProposalKey,
  studioProfileChangeProposalKey,
  taskProposalKey,
} from "../lib/operatorAnaProposalConsumedState.ts";
import { resolveEscalationViaDashboard } from "../lib/escalationResolutionClient.ts";
import { fireDataChanged } from "../lib/events.ts";
import { buildInvoiceSetupChangeProposalV1ForConfirm } from "../lib/operatorAssistantInvoiceSetupChangeProposalFromLlm.ts";
import { buildOfferBuilderChangeProposalV1ForConfirm } from "../lib/operatorAssistantOfferBuilderChangeProposalFromLlm.ts";
import { buildStudioProfileChangeProposalV1ForConfirm } from "../lib/operatorAssistantStudioProfileChangeProposalFromLlm.ts";
import { insertInvoiceSetupChangeProposal } from "../lib/insertInvoiceSetupChangeProposal.ts";
import { insertOfferBuilderChangeProposal } from "../lib/insertOfferBuilderChangeProposal.ts";
import { insertStudioProfileChangeProposal } from "../lib/insertStudioProfileChangeProposal.ts";
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
import type { OperatorAnaCarryForwardClientState } from "../types/operatorAnaCarryForward.types.ts";

type ChatLine =
  | { id: string; role: "user"; text: string; focusSnapshot: OperatorAnaWidgetFocusSnapshot }
  | {
      id: string;
      role: "assistant";
      kind: "in_flight";
      streamingText: string;
      focusSnapshot: OperatorAnaWidgetFocusSnapshot;
    }
  | { id: string; role: "assistant"; display: OperatorStudioAssistantAssistantDisplay; focusSnapshot: OperatorAnaWidgetFocusSnapshot };

function operatorAssistantStreamingV1Enabled(): boolean {
  return import.meta.env.VITE_OPERATOR_ASSISTANT_STREAMING_V1 === "true";
}

function isAssistantInFlightLine(
  m: ChatLine,
): m is { id: string; role: "assistant"; kind: "in_flight"; streamingText: string; focusSnapshot: OperatorAnaWidgetFocusSnapshot } {
  return m.role === "assistant" && "kind" in m && m.kind === "in_flight";
}

function isUserAbortError(e: unknown): boolean {
  if (e instanceof DOMException && e.name === "AbortError") return true;
  if (e instanceof Error && e.name === "AbortError") return true;
  return false;
}

function nextId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function AnaWidgetSendIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
      <path d="M22 2L11 13" />
      <path d="M22 2l-7 20-4-9-9-4 20-7z" />
    </svg>
  );
}

function AnaWidgetCloseIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} aria-hidden>
      <path d="M18 6L6 18M6 6l12 12" />
    </svg>
  );
}

function AssistantDevRetrievalBlock(props: { scopes: string[]; memoryIds: string[] }) {
  const scopes = props.scopes.length ? props.scopes.join(", ") : "-";
  const memories = props.memoryIds.length ? props.memoryIds.join(", ") : "none";
  return (
    <details className="mt-2 rounded-md border border-white/15 bg-white/[0.07] px-2 py-1.5 text-left">
      <summary className="cursor-pointer list-none font-['SaansMono',ui-monospace,monospace] text-[9px] uppercase tracking-wide text-white/60 outline-none [&::-webkit-details-marker]:hidden">
        Retrieval (dev)
      </summary>
      <dl className="mt-1.5 space-y-1 font-['SaansMono',ui-monospace,monospace] text-[9px] leading-snug text-white/65">
        <div>
          <dt className="inline text-white/50">Scopes</dt>
          <dd className="inline pl-1 break-all">{scopes}</dd>
        </div>
        <div>
          <dt className="inline text-white/50">Memories</dt>
          <dd className="inline pl-1 break-all">{memories}</dd>
        </div>
      </dl>
    </details>
  );
}

const ANA_QUERY_EVENT = "ana-widget:open-with-query";
const ANA_ESCALATION_RESOLVER_EVENT = "ana-widget:open-with-escalation-resolver";
const ANA_OFFER_BUILDER_SPECIALIST_EVENT = "ana-widget:open-with-offer-builder-specialist";
const ANA_INVOICE_SETUP_SPECIALIST_EVENT = "ana-widget:open-with-invoice-setup-specialist";
const ANA_INVESTIGATION_SPECIALIST_EVENT = "ana-widget:open-with-investigation-specialist";
const ANA_PLAYBOOK_AUDIT_SPECIALIST_EVENT = "ana-widget:open-with-playbook-audit-specialist";
const ANA_BULK_TRIAGE_SPECIALIST_EVENT = "ana-widget:open-with-bulk-triage-specialist";

export function openAnaWithQuery(query: string) {
  window.dispatchEvent(new CustomEvent(ANA_QUERY_EVENT, { detail: { query } }));
}

/** S1 — open Ana in escalation resolver mode for one tenant-owned `escalation_requests` row (UUID). */
export function openAnaWithEscalation(escalationId: string) {
  const id = String(escalationId ?? "").trim();
  if (!id) return;
  window.dispatchEvent(new CustomEvent(ANA_ESCALATION_RESOLVER_EVENT, { detail: { escalationId: id } }));
}

/** S2 — open Ana in offer-builder specialist mode for one `studio_offer_builder_projects` row (UUID). */
export function openAnaWithOfferBuilderProject(projectId: string) {
  const id = String(projectId ?? "").trim();
  if (!id) return;
  window.dispatchEvent(new CustomEvent(ANA_OFFER_BUILDER_SPECIALIST_EVENT, { detail: { projectId: id } }));
}

/** S3 — open Ana in invoice PDF template specialist mode (tenant `studio_invoice_setup` lane). */
export function openAnaWithInvoiceSetupSpecialist() {
  window.dispatchEvent(new CustomEvent(ANA_INVOICE_SETUP_SPECIALIST_EVENT));
}

/** S4 — open Ana in deep search / investigation mode (read-first, multi-tool evidence lane). */
export function openAnaWithInvestigationMode() {
  window.dispatchEvent(new CustomEvent(ANA_INVESTIGATION_SPECIALIST_EVENT));
}

/** S5 — open Ana in rule authoring / audit mode (playbook coverage + review-first rule candidates only). */
export function openAnaWithPlaybookAuditMode() {
  window.dispatchEvent(new CustomEvent(ANA_PLAYBOOK_AUDIT_SPECIALIST_EVENT));
}

/** S6 — open Ana in bulk Today / queue triage mode (grounded snapshot; one confirmable proposal per turn). */
export function openAnaWithBulkTriageMode() {
  window.dispatchEvent(new CustomEvent(ANA_BULK_TRIAGE_SPECIALIST_EVENT));
}

type PanelDir = { v: "above" | "below"; h: "alignRight" | "alignLeft" };

/** One-line summary of override payload for the confirm card (matches server validation). */
function studioProfileChangeProposalSummaryLine(p: OperatorAssistantProposedActionStudioProfileChangeProposal): string {
  const parts: string[] = [];
  if (p.settings_patch && Object.keys(p.settings_patch).length > 0) {
    parts.push(`Settings keys: ${Object.keys(p.settings_patch).join(", ")}`);
  }
  if (p.studio_business_profile_patch && Object.keys(p.studio_business_profile_patch).length > 0) {
    parts.push(`Business profile keys: ${Object.keys(p.studio_business_profile_patch).join(", ")}`);
  }
  return parts.length > 0 ? parts.join(" · ") : "Studio profile change (bounded patch)";
}

function offerBuilderChangeProposalSummaryLine(p: OperatorAssistantProposedActionOfferBuilderChangeProposal): string {
  const parts: string[] = [];
  if (p.metadata_patch.name != null && p.metadata_patch.name.trim()) {
    parts.push(`Name (hub): ${p.metadata_patch.name.trim()}`);
  }
  if (p.metadata_patch.root_title != null && p.metadata_patch.root_title.trim()) {
    parts.push(`Document title: ${p.metadata_patch.root_title.trim()}`);
  }
  return parts.length > 0 ? parts.join(" · ") : "Offer metadata change (bounded)";
}

function invoiceSetupChangeProposalSummaryLine(p: OperatorAssistantProposedActionInvoiceSetupChangeProposal): string {
  const t = p.template_patch;
  const parts: string[] = [];
  if (t.legalName != null && t.legalName.trim()) parts.push(`Legal name: ${t.legalName.trim()}`);
  if (t.invoicePrefix != null && t.invoicePrefix.trim()) parts.push(`Prefix: ${t.invoicePrefix.trim()}`);
  if (t.paymentTerms != null && t.paymentTerms.trim()) {
    const pt = t.paymentTerms.trim();
    parts.push(`Payment terms: ${pt.slice(0, 80)}${pt.length > 80 ? "…" : ""}`);
  }
  if (t.accentColor != null) parts.push(`Accent: ${t.accentColor}`);
  if (t.footerNote !== undefined) {
    const fn = t.footerNote;
    parts.push(
      fn.trim().length === 0
        ? "Footer: (clear)"
        : `Footer: ${fn.trim().slice(0, 80)}${fn.length > 80 ? "…" : ""}`,
    );
  }
  return parts.length > 0 ? parts.join(" · ") : "Invoice template change (bounded)";
}

function caseExceptionOverrideSummaryLine(p: OperatorAssistantProposedActionAuthorizedCaseException): string {
  const o = p.overridePayload;
  const parts: string[] = [];
  if (o.decision_mode) parts.push(`Decision: ${o.decision_mode}`);
  if (o.instruction_append && o.instruction_append.trim()) {
    const t = o.instruction_append.trim();
    parts.push(t.length > 140 ? `Append: ${t.slice(0, 137)}…` : `Append: ${t}`);
  }
  if ("instruction_override" in o) {
    parts.push(
      o.instruction_override === null ? "Instruction override: cleared" : "Instruction override: set",
    );
  }
  return parts.length > 0 ? parts.join(" · ") : "Policy override (details in row on save)";
}

export function SupportAssistantWidget() {
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState<ChatLine[]>([]);
  const [anaTyping, setAnaTyping] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [confirmingProposalKey, setConfirmingProposalKey] = useState<string | null>(null);
  /** Per assistant message id: proposal keys that already succeeded (no duplicate confirms). */
  const [consumedProposalKeysByMessageId, setConsumedProposalKeysByMessageId] = useState<Record<string, string[]>>(
    {},
  );
  /** P4: last confirmed Ana calendar write — bounded undo via `undo-operator-assistant-write`. */
  const [pendingCalendarUndo, setPendingCalendarUndo] = useState<{
    auditId: string;
    kind: "create" | "reschedule";
  } | null>(null);
  const [undoingCalendarAuditId, setUndoingCalendarAuditId] = useState<string | null>(null);
  /** S1 — pinned escalation id for resolver mode (explicit entry only; cleared when panel closes). */
  const [escalationResolverPin, setEscalationResolverPin] = useState<string | null>(null);
  /** S2 — pinned offer-builder project id (mutually exclusive with S1 in API; cleared when panel closes). */
  const [offerBuilderSpecialistPin, setOfferBuilderSpecialistPin] = useState<string | null>(null);
  /** S3 — invoice template specialist (boolean flag; cleared when panel closes). */
  const [invoiceSetupSpecialist, setInvoiceSetupSpecialist] = useState(false);
  /** S4 — investigation / deep-read mode (cleared when panel closes). */
  const [investigationSpecialist, setInvestigationSpecialist] = useState(false);
  /** S5 — rule authoring / audit mode (cleared when panel closes). */
  const [playbookAuditSpecialist, setPlaybookAuditSpecialist] = useState(false);
  /** S6 — bulk queue / Today triage mode (cleared when panel closes). */
  const [bulkTriageSpecialist, setBulkTriageSpecialist] = useState(false);
  const [dir, setDir] = useState<PanelDir>({ v: "above", h: "alignRight" });

  const listRef = useRef<HTMLDivElement>(null);
  const constraintsRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  /** Cleared when route focus changes or panel closes — matches server carry-forward lifecycle. */
  const pathFocusKeyRef = useRef<string>("");
  const carryForwardRef = useRef<OperatorAnaCarryForwardClientState | null>(null);
  /** Bumps to invalidate in-flight `setIsSubmitting` work when a new submit or unmount/close cancels. */
  const submitGenRef = useRef(0);
  const streamAbortRef = useRef<AbortController | null>(null);
  const revealStateRef = useRef<RevealState | null>(null);
  const cancelPacedReveal = useCallback(() => {
    const st = revealStateRef.current;
    if (st?.rafId != null) {
      cancelAnimationFrame(st.rafId);
    }
    revealStateRef.current = null;
  }, []);

  const pathFocus = deriveOperatorAnaFocusFromPathname(pathname);
  const pathFocusKey = `${pathFocus.weddingId ?? ""}|${pathFocus.personId ?? ""}`;

  useEffect(() => {
    if (pathFocusKeyRef.current === "") {
      pathFocusKeyRef.current = pathFocusKey;
      return;
    }
    if (pathFocusKeyRef.current !== pathFocusKey) {
      carryForwardRef.current = null;
      pathFocusKeyRef.current = pathFocusKey;
    }
  }, [pathFocusKey]);

  useEffect(() => {
    if (!open) {
      submitGenRef.current += 1;
      streamAbortRef.current?.abort();
      cancelPacedReveal();
      setIsSubmitting(false);
      setAnaTyping(false);
      setMessages((m) => m.filter((x) => !isAssistantInFlightLine(x)));
      carryForwardRef.current = null;
      setEscalationResolverPin(null);
      setOfferBuilderSpecialistPin(null);
      setInvoiceSetupSpecialist(false);
      setInvestigationSpecialist(false);
      setPlaybookAuditSpecialist(false);
      setBulkTriageSpecialist(false);
    }
  }, [open, cancelPacedReveal]);

  useEffect(() => {
    return () => {
      submitGenRef.current += 1;
      streamAbortRef.current?.abort();
      cancelPacedReveal();
    };
  }, [cancelPacedReveal]);

  const focusLabel = operatorAnaFocusBadgeLabel(pathFocus);

  async function confirmPlaybookRuleProposal(assistantMessageId: string, p: OperatorAssistantProposedActionPlaybookRuleCandidate) {
    const key = ruleProposalKey(p);
    if (confirmingProposalKey || isProposalKeyConsumed(consumedProposalKeysByMessageId, assistantMessageId, key)) {
      return;
    }
    setConfirmingProposalKey(key);
    try {
      const { data, error } = await supabase.functions.invoke("insert-operator-assistant-playbook-rule-candidate", {
        body: {
          proposedActionKey: p.proposedActionKey,
          topic: p.topic,
          proposedInstruction: p.proposedInstruction,
          proposedDecisionMode: p.proposedDecisionMode,
          proposedScope: p.proposedScope,
          proposedChannel: p.proposedScope === "channel" ? p.proposedChannel : null,
          weddingId: p.weddingId ?? null,
        },
      });
      if (error) {
        const detail = await getSupabaseEdgeFunctionErrorMessage(error, data);
        throw new Error(detail);
      }
      const cid = (data as { candidateId?: string } | null)?.candidateId;
      setConsumedProposalKeysByMessageId((prev) => addConsumedProposalKey(prev, assistantMessageId, key));
      alert(
        cid
          ? `Rule candidate created. Review it under Projects → Workspace → Rule candidates (review), or /workspace/playbook-rule-candidates. ID: ${cid}`
          : "Candidate created.",
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      alert(`Could not create candidate: ${msg}`);
    } finally {
      setConfirmingProposalKey(null);
    }
  }

  async function confirmTaskProposal(assistantMessageId: string, p: OperatorAssistantProposedActionTask) {
    const key = taskProposalKey(p);
    if (confirmingProposalKey || isProposalKeyConsumed(consumedProposalKeysByMessageId, assistantMessageId, key)) {
      return;
    }
    setConfirmingProposalKey(key);
    try {
      const { data, error } = await supabase.functions.invoke("insert-operator-assistant-task", {
        body: {
          title: p.title,
          dueDate: p.dueDate,
          weddingId: p.weddingId ?? null,
        },
      });
      if (error) {
        const detail = await getSupabaseEdgeFunctionErrorMessage(error, data);
        throw new Error(detail);
      }
      const tid = (data as { taskId?: string } | null)?.taskId;
      setConsumedProposalKeysByMessageId((prev) => addConsumedProposalKey(prev, assistantMessageId, key));
      alert(tid ? `Task created. ID: ${tid}` : "Task created.");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      alert(`Could not create task: ${msg}`);
    } finally {
      setConfirmingProposalKey(null);
    }
  }

  async function confirmMemoryNoteProposal(assistantMessageId: string, p: OperatorAssistantProposedActionMemoryNote) {
    const key = memoryProposalKey(p);
    if (confirmingProposalKey || isProposalKeyConsumed(consumedProposalKeysByMessageId, assistantMessageId, key)) {
      return;
    }
    setConfirmingProposalKey(key);
    try {
      const { data, error } = await supabase.functions.invoke("insert-operator-assistant-memory", {
        body: {
          memoryScope: p.memoryScope,
          title: p.title,
          summary: p.summary,
          fullContent: p.fullContent,
          weddingId: p.weddingId ?? null,
          personId: p.personId ?? null,
        },
      });
      if (error) {
        const detail = await getSupabaseEdgeFunctionErrorMessage(error, data);
        throw new Error(detail);
      }
      const mid = (data as { memoryId?: string } | null)?.memoryId;
      setConsumedProposalKeysByMessageId((prev) => addConsumedProposalKey(prev, assistantMessageId, key));
      alert(mid ? `Memory saved. ID: ${mid}` : "Memory saved.");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      alert(`Could not save memory: ${msg}`);
    } finally {
      setConfirmingProposalKey(null);
    }
  }

  async function confirmStudioProfileChangeProposal(
    assistantMessageId: string,
    p: OperatorAssistantProposedActionStudioProfileChangeProposal,
  ) {
    const key = studioProfileChangeProposalKey(p);
    if (confirmingProposalKey || isProposalKeyConsumed(consumedProposalKeysByMessageId, assistantMessageId, key)) {
      return;
    }
    setConfirmingProposalKey(key);
    try {
      const { data: userData, error: userErr } = await supabase.auth.getUser();
      if (userErr || !userData.user?.id) {
        throw new Error("Not signed in");
      }
      const payload = buildStudioProfileChangeProposalV1ForConfirm(p);
      const { id, error } = await insertStudioProfileChangeProposal(supabase, userData.user.id, payload);
      if (error) {
        throw new Error(error);
      }
      setConsumedProposalKeysByMessageId((prev) => addConsumedProposalKey(prev, assistantMessageId, key));
      alert(
        id
          ? `Proposal queued for review. Open Projects → Workspace → Studio profile (review) to inspect. Row id: ${id}`
          : "Proposal queued for review.",
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      alert(`Could not enqueue proposal: ${msg}`);
    } finally {
      setConfirmingProposalKey(null);
    }
  }

  async function confirmOfferBuilderChangeProposal(
    assistantMessageId: string,
    p: OperatorAssistantProposedActionOfferBuilderChangeProposal,
  ) {
    const key = offerBuilderChangeProposalKey(p);
    if (confirmingProposalKey || isProposalKeyConsumed(consumedProposalKeysByMessageId, assistantMessageId, key)) {
      return;
    }
    if (offerBuilderSpecialistPin && p.project_id.trim() !== offerBuilderSpecialistPin) {
      alert("This proposal does not match the pinned offer project. Exit offer mode or use the matching card.");
      return;
    }
    setConfirmingProposalKey(key);
    try {
      const { data: userData, error: userErr } = await supabase.auth.getUser();
      if (userErr || !userData.user?.id) {
        throw new Error("Not signed in");
      }
      const payload = buildOfferBuilderChangeProposalV1ForConfirm(p);
      const { id, error } = await insertOfferBuilderChangeProposal(supabase, userData.user.id, payload);
      if (error) {
        throw new Error(error);
      }
      setConsumedProposalKeysByMessageId((prev) => addConsumedProposalKey(prev, assistantMessageId, key));
      alert(
        id
          ? `Offer change proposal queued for review (project ${p.project_id}). Row id: ${id} — apply from Offer builder when that flow ships.`
          : "Offer change proposal queued for review.",
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      alert(`Could not enqueue offer proposal: ${msg}`);
    } finally {
      setConfirmingProposalKey(null);
    }
  }

  async function confirmInvoiceSetupChangeProposal(
    assistantMessageId: string,
    p: OperatorAssistantProposedActionInvoiceSetupChangeProposal,
  ) {
    const key = invoiceSetupChangeProposalKey(p);
    if (confirmingProposalKey || isProposalKeyConsumed(consumedProposalKeysByMessageId, assistantMessageId, key)) {
      return;
    }
    setConfirmingProposalKey(key);
    try {
      const { data: userData, error: userErr } = await supabase.auth.getUser();
      if (userErr || !userData.user?.id) {
        throw new Error("Not signed in");
      }
      const payload = buildInvoiceSetupChangeProposalV1ForConfirm(p);
      const { id, error } = await insertInvoiceSetupChangeProposal(supabase, userData.user.id, payload);
      if (error) {
        throw new Error(error);
      }
      setConsumedProposalKeysByMessageId((prev) => addConsumedProposalKey(prev, assistantMessageId, key));
      alert(
        id
          ? `Invoice setup proposal queued for review. Row id: ${id} — live apply is not from this chat.`
          : "Invoice setup proposal queued for review.",
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      alert(`Could not enqueue invoice proposal: ${msg}`);
    } finally {
      setConfirmingProposalKey(null);
    }
  }

  async function confirmCalendarEventCreateProposal(
    assistantMessageId: string,
    p: OperatorAssistantProposedActionCalendarEventCreate,
  ) {
    const key = calendarEventCreateProposalKey(p);
    if (confirmingProposalKey || isProposalKeyConsumed(consumedProposalKeysByMessageId, assistantMessageId, key)) {
      return;
    }
    setConfirmingProposalKey(key);
    try {
      const { data, error } = await supabase.functions.invoke("insert-operator-assistant-calendar-event", {
        body: {
          operation: "create",
          title: p.title,
          startTime: p.startTime,
          endTime: p.endTime,
          eventType: p.eventType,
          weddingId: p.weddingId ?? null,
        },
      });
      if (error) {
        const detail = await getSupabaseEdgeFunctionErrorMessage(error, data);
        throw new Error(detail);
      }
      const eid = (data as { calendarEventId?: string } | null)?.calendarEventId;
      const auditEventId = (data as { auditEventId?: string } | null)?.auditEventId;
      if (auditEventId) {
        setPendingCalendarUndo({ auditId: auditEventId, kind: "create" });
      }
      setConsumedProposalKeysByMessageId((prev) => addConsumedProposalKey(prev, assistantMessageId, key));
      alert(
        eid
          ? `Calendar event created. ID: ${eid} — open Calendar in the app to verify times.`
          : "Calendar event created.",
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      alert(`Could not create calendar event: ${msg}`);
    } finally {
      setConfirmingProposalKey(null);
    }
  }

  async function confirmCalendarEventRescheduleProposal(
    assistantMessageId: string,
    p: OperatorAssistantProposedActionCalendarEventReschedule,
  ) {
    const key = calendarEventRescheduleProposalKey(p);
    if (confirmingProposalKey || isProposalKeyConsumed(consumedProposalKeysByMessageId, assistantMessageId, key)) {
      return;
    }
    setConfirmingProposalKey(key);
    try {
      const { data, error } = await supabase.functions.invoke("insert-operator-assistant-calendar-event", {
        body: {
          operation: "reschedule",
          calendarEventId: p.calendarEventId,
          startTime: p.startTime,
          endTime: p.endTime,
        },
      });
      if (error) {
        const detail = await getSupabaseEdgeFunctionErrorMessage(error, data);
        throw new Error(detail);
      }
      const eid = (data as { calendarEventId?: string } | null)?.calendarEventId;
      const auditEventId = (data as { auditEventId?: string } | null)?.auditEventId;
      if (auditEventId) {
        setPendingCalendarUndo({ auditId: auditEventId, kind: "reschedule" });
      }
      setConsumedProposalKeysByMessageId((prev) => addConsumedProposalKey(prev, assistantMessageId, key));
      alert(
        eid
          ? `Event rescheduled. ID: ${eid} — confirm times in Calendar.`
          : "Event rescheduled.",
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      alert(`Could not reschedule event: ${msg}`);
    } finally {
      setConfirmingProposalKey(null);
    }
  }

  async function undoPendingAnaCalendarWrite() {
    const pending = pendingCalendarUndo;
    if (!pending) return;
    setUndoingCalendarAuditId(pending.auditId);
    try {
      const { data, error } = await supabase.functions.invoke("undo-operator-assistant-write", {
        body: { auditId: pending.auditId },
      });
      if (error) {
        const detail = await getSupabaseEdgeFunctionErrorMessage(error, data);
        throw new Error(detail);
      }
      setPendingCalendarUndo(null);
      alert("Last Ana calendar change was undone.");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      alert(`Could not undo calendar change: ${msg}`);
    } finally {
      setUndoingCalendarAuditId(null);
    }
  }

  async function confirmAuthorizedCaseExceptionProposal(
    assistantMessageId: string,
    p: OperatorAssistantProposedActionAuthorizedCaseException,
  ) {
    const key = caseExceptionProposalKey(p);
    if (confirmingProposalKey || isProposalKeyConsumed(consumedProposalKeysByMessageId, assistantMessageId, key)) {
      return;
    }
    setConfirmingProposalKey(key);
    try {
      const { data, error } = await supabase.functions.invoke("insert-operator-assistant-authorized-case-exception", {
        body: {
          overridesActionKey: p.overridesActionKey,
          overridePayload: p.overridePayload,
          weddingId: p.weddingId,
          clientThreadId: p.clientThreadId ?? null,
          targetPlaybookRuleId: p.targetPlaybookRuleId ?? null,
          effectiveUntil: p.effectiveUntil ?? null,
          notes: p.notes ?? null,
        },
      });
      if (error) {
        const detail = await getSupabaseEdgeFunctionErrorMessage(error, data);
        throw new Error(detail);
      }
      const eid = (data as { exceptionId?: string } | null)?.exceptionId;
      setConsumedProposalKeysByMessageId((prev) => addConsumedProposalKey(prev, assistantMessageId, key));
      alert(eid ? `Case exception saved. ID: ${eid}` : "Case exception saved.");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      alert(`Could not save case exception: ${msg}`);
    } finally {
      setConfirmingProposalKey(null);
    }
  }

  async function confirmEscalationResolveProposal(
    assistantMessageId: string,
    p: OperatorAssistantProposedActionEscalationResolve,
  ) {
    const key = escalationResolveProposalKey(p);
    if (confirmingProposalKey || isProposalKeyConsumed(consumedProposalKeysByMessageId, assistantMessageId, key)) {
      return;
    }
    if (escalationResolverPin !== p.escalationId) {
      alert("This resolution does not match the pinned escalation. Exit resolver mode and try again.");
      return;
    }
    const ok = window.confirm(
      "Queue this resolution on the dashboard? Processing runs in the background (same path as Today → Record resolution).",
    );
    if (!ok) return;
    setConfirmingProposalKey(key);
    try {
      const { jobId } = await resolveEscalationViaDashboard({
        escalationId: p.escalationId,
        resolutionSummary: p.resolutionSummary,
        photographerReplyRaw: p.photographerReplyRaw ?? undefined,
      });
      setConsumedProposalKeysByMessageId((prev) => addConsumedProposalKey(prev, assistantMessageId, key));
      fireDataChanged("escalations");
      fireDataChanged("inbox");
      alert(`Resolution queued. Job id: ${jobId}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      alert(`Could not queue resolution: ${msg}`);
    } finally {
      setConfirmingProposalKey(null);
    }
  }

  const dragX = useMotionValue(0);
  const dragY = useMotionValue(0);
  const isDragging = useRef(false);
  const dragStartPos = useRef({ x: 0, y: 0 });

  function computeDir() {
    if (!btnRef.current) return;
    const r = btnRef.current.getBoundingClientRect();
    const v = r.top > 350 ? "above" : "below";
    const h = r.left > 340 ? "alignRight" : "alignLeft";
    setDir({ v: v as PanelDir["v"], h: h as PanelDir["h"] });
  }

  useEffect(() => {
    if (!open) return;
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, anaTyping, open]);

  const pendingQuery = useRef<string | null>(null);

  useEffect(() => {
    function handleAnaQuery(e: Event) {
      const query = (e as CustomEvent).detail?.query;
      if (!query) return;
      setEscalationResolverPin(null);
      setOfferBuilderSpecialistPin(null);
      setInvoiceSetupSpecialist(false);
      setInvestigationSpecialist(false);
      setPlaybookAuditSpecialist(false);
      setBulkTriageSpecialist(false);
      pendingQuery.current = query;
      setOpen(true);
    }
    function handleAnaEscalationResolver(e: Event) {
      const id = (e as CustomEvent).detail?.escalationId;
      if (typeof id !== "string" || !id.trim()) return;
      pendingQuery.current = null;
      setOfferBuilderSpecialistPin(null);
      setInvoiceSetupSpecialist(false);
      setInvestigationSpecialist(false);
      setPlaybookAuditSpecialist(false);
      setBulkTriageSpecialist(false);
      setEscalationResolverPin(id.trim());
      setOpen(true);
    }
    function handleAnaOfferBuilderSpecialist(e: Event) {
      const id = (e as CustomEvent).detail?.projectId;
      if (typeof id !== "string" || !id.trim()) return;
      pendingQuery.current = null;
      setEscalationResolverPin(null);
      setInvoiceSetupSpecialist(false);
      setInvestigationSpecialist(false);
      setPlaybookAuditSpecialist(false);
      setBulkTriageSpecialist(false);
      setOfferBuilderSpecialistPin(id.trim());
      setOpen(true);
    }
    function handleAnaInvoiceSetupSpecialist() {
      pendingQuery.current = null;
      setEscalationResolverPin(null);
      setOfferBuilderSpecialistPin(null);
      setInvestigationSpecialist(false);
      setPlaybookAuditSpecialist(false);
      setBulkTriageSpecialist(false);
      setInvoiceSetupSpecialist(true);
      setOpen(true);
    }
    function handleAnaInvestigationSpecialist() {
      pendingQuery.current = null;
      setEscalationResolverPin(null);
      setOfferBuilderSpecialistPin(null);
      setInvoiceSetupSpecialist(false);
      setPlaybookAuditSpecialist(false);
      setBulkTriageSpecialist(false);
      setInvestigationSpecialist(true);
      setOpen(true);
    }
    function handleAnaPlaybookAuditSpecialist() {
      pendingQuery.current = null;
      setEscalationResolverPin(null);
      setOfferBuilderSpecialistPin(null);
      setInvoiceSetupSpecialist(false);
      setInvestigationSpecialist(false);
      setBulkTriageSpecialist(false);
      setPlaybookAuditSpecialist(true);
      setOpen(true);
    }
    function handleAnaBulkTriageSpecialist() {
      pendingQuery.current = null;
      setEscalationResolverPin(null);
      setOfferBuilderSpecialistPin(null);
      setInvoiceSetupSpecialist(false);
      setInvestigationSpecialist(false);
      setPlaybookAuditSpecialist(false);
      setBulkTriageSpecialist(true);
      setOpen(true);
    }
    window.addEventListener(ANA_QUERY_EVENT, handleAnaQuery);
    window.addEventListener(ANA_ESCALATION_RESOLVER_EVENT, handleAnaEscalationResolver);
    window.addEventListener(ANA_OFFER_BUILDER_SPECIALIST_EVENT, handleAnaOfferBuilderSpecialist);
    window.addEventListener(ANA_INVOICE_SETUP_SPECIALIST_EVENT, handleAnaInvoiceSetupSpecialist);
    window.addEventListener(ANA_INVESTIGATION_SPECIALIST_EVENT, handleAnaInvestigationSpecialist);
    window.addEventListener(ANA_PLAYBOOK_AUDIT_SPECIALIST_EVENT, handleAnaPlaybookAuditSpecialist);
    window.addEventListener(ANA_BULK_TRIAGE_SPECIALIST_EVENT, handleAnaBulkTriageSpecialist);
    return () => {
      window.removeEventListener(ANA_QUERY_EVENT, handleAnaQuery);
      window.removeEventListener(ANA_ESCALATION_RESOLVER_EVENT, handleAnaEscalationResolver);
      window.removeEventListener(ANA_OFFER_BUILDER_SPECIALIST_EVENT, handleAnaOfferBuilderSpecialist);
      window.removeEventListener(ANA_INVOICE_SETUP_SPECIALIST_EVENT, handleAnaInvoiceSetupSpecialist);
      window.removeEventListener(ANA_INVESTIGATION_SPECIALIST_EVENT, handleAnaInvestigationSpecialist);
      window.removeEventListener(ANA_PLAYBOOK_AUDIT_SPECIALIST_EVENT, handleAnaPlaybookAuditSpecialist);
      window.removeEventListener(ANA_BULK_TRIAGE_SPECIALIST_EVENT, handleAnaBulkTriageSpecialist);
    };
  }, []);

  useEffect(() => {
    if (open && pendingQuery.current) {
      const q = pendingQuery.current;
      pendingQuery.current = null;
      setTimeout(() => submitQuestion(q), 60);
    }
  }, [open]);

  async function submitQuestion(overrideText?: string) {
    const text = (overrideText ?? question).trim();
    if (
      !text &&
      !escalationResolverPin &&
      !offerBuilderSpecialistPin &&
      !invoiceSetupSpecialist &&
      !investigationSpecialist &&
      !playbookAuditSpecialist &&
      !bulkTriageSpecialist
    )
      return;
    if (!operatorAssistantStreamingV1Enabled() && isSubmitting) return;

    const myGen = ++submitGenRef.current;
    const endSubmitting = () => {
      if (submitGenRef.current === myGen) {
        setIsSubmitting(false);
        setAnaTyping(false);
      }
    };

    const currentFocus: OperatorAnaWidgetFocusSnapshot = {
      weddingId: pathFocus.weddingId ?? null,
      personId: null,
    };
    const priorTurns = extractOperatorAnaWidgetCompletedTurns(messages);
    const conversation = buildOperatorAnaWidgetConversation(priorTurns, currentFocus);

    const userLine: ChatLine = { id: nextId(), role: "user", text, focusSnapshot: currentFocus };
    setQuestion("");

    const { weddingId: focusedWeddingId } = pathFocus;
    const requestBody: Record<string, unknown> = {
      queryText: text,
      focusedWeddingId: focusedWeddingId ?? null,
      focusedPersonId: null,
      ...(conversation.length > 0 ? { conversation } : {}),
      ...(carryForwardRef.current ? { carryForward: carryForwardRef.current } : {}),
      ...(escalationResolverPin ? { escalationResolverEscalationId: escalationResolverPin } : {}),
      ...(offerBuilderSpecialistPin ? { offerBuilderSpecialistProjectId: offerBuilderSpecialistPin } : {}),
      ...(invoiceSetupSpecialist ? { invoiceSetupSpecialist: true } : {}),
      ...(investigationSpecialist ? { investigationSpecialist: true } : {}),
      ...(playbookAuditSpecialist ? { playbookAuditSpecialist: true } : {}),
      ...(bulkTriageSpecialist ? { bulkTriageSpecialist: true } : {}),
    };

    if (operatorAssistantStreamingV1Enabled()) {
      logAnaStreamLine("streaming branch entered");
      cancelPacedReveal();
      streamAbortRef.current?.abort();
      const ac = new AbortController();
      streamAbortRef.current = ac;
      const inFlightId = nextId();
      setIsSubmitting(true);
      setAnaTyping(false);
      setMessages((m) => {
        const withoutInFlight = m.filter((x) => !isAssistantInFlightLine(x));
        return [
          ...withoutInFlight,
          userLine,
          {
            id: inFlightId,
            role: "assistant" as const,
            kind: "in_flight" as const,
            streamingText: "",
            focusSnapshot: currentFocus,
          },
        ];
      });
      let sawDone = false;
      try {
        const session = (await supabase.auth.getSession()).data.session;
        if (!session?.access_token) {
          throw new Error("Not signed in");
        }
        const base = (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? "";
        const url = `${String(base).replace(/\/$/, "")}/functions/v1/operator-studio-assistant`;
        const streamDebug = operatorAnaStreamDebugEnabled();
        const tStream0 = performance.now();
        if (streamDebug) {
          logAnaStreamLine("start");
        }
        const res = await fetch(url, {
          method: "POST",
          body: JSON.stringify(requestBody),
          signal: ac.signal,
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            apikey: import.meta.env.VITE_SUPABASE_ANON_KEY as string,
            "Content-Type": "application/json",
            Accept: "text/event-stream",
          },
        });
        if (streamDebug) {
          logAnaStreamLine(`response ${res.status} at ${Math.round(performance.now() - tStream0)}ms`);
        }
        if (!res.ok) {
          const t = await res.text();
          let detail = t || res.statusText;
          try {
            const j = JSON.parse(t) as { error?: string };
            if (typeof j.error === "string" && j.error) detail = j.error;
          } catch {
            /* keep detail */
          }
          throw new Error(detail);
        }
        const finalizePacedReveal = () => {
          const st0 = revealStateRef.current;
          if (st0?.rafId != null) {
            cancelAnimationFrame(st0.rafId);
            st0.rafId = null;
          }
          const pending = st0?.pendingFinal;
          if (!st0 || !pending) {
            revealStateRef.current = null;
            return;
          }
          logAnaStreamLine(
            `finalize: displayedAtSwap=${st0.displayedLen} receivedAtSwap=${st0.received.length}`,
          );
          setMessages((m) =>
            m.map((x) =>
              x.id === st0.inFlightId && isAssistantInFlightLine(x)
                ? {
                    id: st0.inFlightId,
                    role: "assistant" as const,
                    display: pending.display,
                    focusSnapshot: pending.focusSnapshot,
                  }
                : x,
            ),
          );
          revealStateRef.current = null;
        };

        const waitPacedDrained = () =>
          new Promise<void>((resolve) => {
            const run = () => {
              if (revealStateRef.current == null) {
                resolve();
                return;
              }
              requestAnimationFrame(run);
            };
            run();
          });

        const tick = (ts: number) => {
          const st = revealStateRef.current;
          if (!st || st.inFlightId !== inFlightId) return;
          const { newDisplayedLen, lastTs: nextLast } = computeRevealNewLength(
            {
              receivedLen: st.received.length,
              displayedLen: st.displayedLen,
              receivedEnded: st.receivedEnded,
              lastTs: st.lastTs,
            },
            ts,
          );
          st.lastTs = nextLast;
          if (newDisplayedLen !== st.displayedLen) {
            st.displayedLen = newDisplayedLen;
            setMessages((prev) =>
              prev.map((x) =>
                x.id === inFlightId && isAssistantInFlightLine(x)
                  ? { ...x, streamingText: st.received.slice(0, st.displayedLen) }
                  : x,
              ),
            );
          }
          if (streamDebug) {
            logAnaStreamLine(
              `tick: displayed=${st.displayedLen} received=${st.received.length} ended=${String(
                st.receivedEnded,
              )} at +${Math.round(performance.now() - tStream0)}ms`,
            );
          }
          if (st.receivedEnded && st.displayedLen >= st.received.length) {
            st.rafId = null;
            finalizePacedReveal();
            return;
          }
          if (st.displayedLen < st.received.length) {
            st.rafId = requestAnimationFrame(tick);
            return;
          }
          st.rafId = null;
        };

        let streamTokenCount = 0;
        for await (const ev of consumeOperatorAssistantSseStream(res, ac.signal)) {
          if (ev.type === "token") {
            const d = (ev.data as { delta?: string } | null)?.delta;
            if (typeof d === "string" && d.length > 0) {
              streamTokenCount += 1;
              if (streamDebug) {
                const ms = Math.round(performance.now() - tStream0);
                if (streamTokenCount === 1) {
                  logAnaStreamLine(`first non-empty token at ${ms}ms`);
                }
                logAnaStreamLine(`token #${streamTokenCount} (+${d.length} chars) at ${ms}ms`);
              }
              const st0 = (revealStateRef.current ??= {
                inFlightId,
                received: "",
                displayedLen: 0,
                lastTs: performance.now(),
                rafId: null,
                receivedEnded: false,
                pendingFinal: null,
              });
              st0.received += d;
              if (st0.rafId == null) {
                st0.rafId = requestAnimationFrame(tick);
              }
            }
          } else if (ev.type === "done") {
            if (streamDebug) {
              const ms = Math.round(performance.now() - tStream0);
              logAnaStreamLine(
                `done at ${ms}ms after ${streamTokenCount} non-empty token(s)` +
                  (streamTokenCount === 0 ? " (zero tokens before done)" : ""),
              );
            }
            sawDone = true;
            const payload = ev.data as OperatorStudioAssistantInvokePayload | null;
            const nextCf = payload?.carryForward;
            carryForwardRef.current =
              nextCf != null && typeof nextCf === "object" && "emittedAtEpochMs" in (nextCf as object)
                ? (nextCf as OperatorAnaCarryForwardClientState)
                : null;
            const display = buildOperatorStudioAssistantAssistantDisplay(payload, { devMode: import.meta.env.DEV });
            const st = revealStateRef.current;
            if (!st) {
              setMessages((m) =>
                m.map((x) =>
                  x.id === inFlightId && isAssistantInFlightLine(x)
                    ? { id: inFlightId, role: "assistant" as const, display, focusSnapshot: currentFocus }
                    : x,
                ),
              );
            } else {
              st.pendingFinal = { display, focusSnapshot: currentFocus };
              st.receivedEnded = true;
              if (shouldBypassPacedDrain(st.received.length)) {
                if (st.rafId != null) {
                  cancelAnimationFrame(st.rafId);
                }
                st.rafId = null;
                finalizePacedReveal();
              } else if (st.rafId == null) {
                st.rafId = requestAnimationFrame(tick);
              }
            }
          } else if (ev.type === "error") {
            if (streamDebug) {
              logAnaStreamLine(
                `error event after ${streamTokenCount} token(s) at ${Math.round(performance.now() - tStream0)}ms`,
              );
            }
            const m0 = (ev.data as { message?: string } | null)?.message;
            throw new Error(typeof m0 === "string" && m0.length > 0 ? m0 : "Stream error");
          }
        }
        if (!sawDone) {
          cancelPacedReveal();
          if (streamDebug) {
            logAnaStreamLine(
              `stream ended before done after ${streamTokenCount} token(s) at ${Math.round(performance.now() - tStream0)}ms`,
            );
          }
          throw new Error("Stream ended before done");
        }
        await waitPacedDrained();
      } catch (err) {
        if (isUserAbortError(err)) {
          cancelPacedReveal();
          return;
        }
        cancelPacedReveal();
        setMessages((m) => m.filter((x) => x.id !== inFlightId));
        const msg = err instanceof Error ? err.message : "Unknown error";
        alert(`Failed to send message: ${msg}`);
      } finally {
        if (streamAbortRef.current === ac) streamAbortRef.current = null;
        endSubmitting();
      }
      return;
    }

    setMessages((m) => [...m, userLine]);
    setIsSubmitting(true);
    setAnaTyping(true);
    try {
      const { data, error } = await supabase.functions.invoke("operator-studio-assistant", { body: requestBody });
      if (error) {
        const detail = await getSupabaseEdgeFunctionErrorMessage(error, data);
        throw new Error(detail);
      }

      const payload = data as OperatorStudioAssistantInvokePayload | null;
      const nextCf = payload?.carryForward;
      carryForwardRef.current =
        nextCf != null && typeof nextCf === "object" && "emittedAtEpochMs" in (nextCf as object)
          ? (nextCf as OperatorAnaCarryForwardClientState)
          : null;

      const display = buildOperatorStudioAssistantAssistantDisplay(payload, { devMode: import.meta.env.DEV });

      setMessages((m) => [
        ...m,
        {
          id: nextId(),
          role: "assistant",
          display,
          focusSnapshot: currentFocus,
        },
      ]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      alert(`Failed to send message: ${msg}`);
    } finally {
      endSubmitting();
    }
  }

  const panelPositionClass = [
    "absolute w-[min(100vw-2rem,320px)]",
    dir.v === "above" ? "bottom-full mb-2" : "top-full mt-2",
    dir.h === "alignRight" ? "right-0" : "left-0",
  ].join(" ");

  /** Streaming path allows a new send to cancel the prior turn; legacy path keeps the old lock. */
  const lockComposerWhileSubmitting = isSubmitting && !operatorAssistantStreamingV1Enabled();

  return (
    <>
      <div ref={constraintsRef} className="pointer-events-none fixed inset-0 z-[79]" />

      <motion.div
        drag
        dragMomentum={false}
        dragElastic={0.1}
        dragConstraints={constraintsRef}
        onDragStart={() => {
          isDragging.current = true;
          dragStartPos.current = { x: dragX.get(), y: dragY.get() };
        }}
        onDragEnd={() => {
          const dx = Math.abs(dragX.get() - dragStartPos.current.x);
          const dy = Math.abs(dragY.get() - dragStartPos.current.y);
          if (dx > 3 || dy > 3) {
            setTimeout(() => {
              isDragging.current = false;
            }, 0);
          } else {
            isDragging.current = false;
          }
          if (open) computeDir();
        }}
        className="ana-support-dock pointer-events-auto fixed bottom-[22px] right-5 z-[60]"
        style={{ touchAction: "none", x: dragX, y: dragY, overflow: "visible" }}
      >
        <AnimatePresence>
          {open && (
            <motion.div
              id="support-assistant-panel"
              className={`ana-widget-glass-panel pointer-events-auto flex max-h-[min(70vh,380px)] flex-col px-3 py-3 ${panelPositionClass}`}
              role="dialog"
              aria-label="Ana studio assistant"
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{ type: "spring", stiffness: 420, damping: 30, mass: 0.85 }}
            >
              {focusLabel && (
                <div
                  className="mb-2 flex items-center gap-1.5 rounded-md border border-white/12 bg-white/[0.08] px-2 py-1.5"
                  role="status"
                  aria-label={focusLabel}
                >
                  <span
                    className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400/90 shadow-[0_0_6px_rgba(52,211,153,0.45)]"
                    aria-hidden
                  />
                  <span className="font-['Saans',ui-sans-serif] text-[11px] leading-tight text-white/90">
                    {focusLabel}
                  </span>
                </div>
              )}
              {escalationResolverPin ? (
                <div
                  className="mb-2 flex flex-wrap items-center justify-between gap-2 rounded-md border border-rose-400/35 bg-rose-500/[0.12] px-2 py-1.5"
                  role="status"
                >
                  <p className="font-['Saans',ui-sans-serif] text-[10px] leading-snug text-rose-50/95">
                    Escalation resolver — pinned{" "}
                    <span className="font-['SaansMono',ui-monospace,monospace] text-[9px] text-white/85">
                      {escalationResolverPin.slice(0, 8)}…
                    </span>
                    . Ana sees grounded row data; resolution still needs your confirm card below.
                  </p>
                  <button
                    type="button"
                    onClick={() => setEscalationResolverPin(null)}
                    className="shrink-0 rounded border border-white/25 bg-white/10 px-2 py-0.5 font-['Saans',ui-sans-serif] text-[10px] text-white/90 hover:bg-white/15"
                  >
                    Exit resolver
                  </button>
                </div>
              ) : null}
              {offerBuilderSpecialistPin ? (
                <div
                  className="mb-2 flex flex-wrap items-center justify-between gap-2 rounded-md border border-amber-400/35 bg-amber-500/[0.12] px-2 py-1.5"
                  role="status"
                >
                  <p className="font-['Saans',ui-sans-serif] text-[10px] leading-snug text-amber-50/95">
                    Offer builder specialist — pinned{" "}
                    <span className="font-['SaansMono',ui-monospace,monospace] text-[9px] text-white/85">
                      {offerBuilderSpecialistPin.slice(0, 8)}…
                    </span>
                    . Grounded outline in context; name/title changes enqueue for review only.
                  </p>
                  <button
                    type="button"
                    onClick={() => setOfferBuilderSpecialistPin(null)}
                    className="shrink-0 rounded border border-white/25 bg-white/10 px-2 py-0.5 font-['Saans',ui-sans-serif] text-[10px] text-white/90 hover:bg-white/15"
                  >
                    Exit offer mode
                  </button>
                </div>
              ) : null}
              {invoiceSetupSpecialist ? (
                <div
                  className="mb-2 flex flex-wrap items-center justify-between gap-2 rounded-md border border-violet-400/35 bg-violet-500/[0.12] px-2 py-1.5"
                  role="status"
                >
                  <p className="font-['Saans',ui-sans-serif] text-[10px] leading-snug text-violet-50/95">
                    Invoice setup specialist — grounded <span className="text-white/90">studio_invoice_setup</span> lane.
                    Bounded template proposals only (no logo binary); apply stays on the review page.
                  </p>
                  <button
                    type="button"
                    onClick={() => setInvoiceSetupSpecialist(false)}
                    className="shrink-0 rounded border border-white/25 bg-white/10 px-2 py-0.5 font-['Saans',ui-sans-serif] text-[10px] text-white/90 hover:bg-white/15"
                  >
                    Exit invoice mode
                  </button>
                </div>
              ) : null}
              {investigationSpecialist ? (
                <div
                  className="mb-2 flex flex-wrap items-center justify-between gap-2 rounded-md border border-cyan-400/35 bg-cyan-600/[0.14] px-2 py-1.5"
                  role="status"
                >
                  <p className="font-['Saans',ui-sans-serif] text-[10px] leading-snug text-cyan-50/95">
                    Investigation mode — extra read-only tool budget; cite Context and tool JSON; say when evidence is
                    missing.
                  </p>
                  <button
                    type="button"
                    onClick={() => setInvestigationSpecialist(false)}
                    className="shrink-0 rounded border border-white/25 bg-white/10 px-2 py-0.5 font-['Saans',ui-sans-serif] text-[10px] text-white/90 hover:bg-white/15"
                  >
                    Exit investigation
                  </button>
                </div>
              ) : null}
              {playbookAuditSpecialist ? (
                <div
                  className="mb-2 flex flex-wrap items-center justify-between gap-2 rounded-md border border-emerald-400/35 bg-emerald-700/[0.14] px-2 py-1.5"
                  role="status"
                >
                  <p className="font-['Saans',ui-sans-serif] text-[10px] leading-snug text-emerald-50/95">
                    Rule audit mode — playbook coverage in Context; new rules only as{" "}
                    <span className="font-['SaansMono',ui-monospace,monospace] text-[9px] text-white/90">
                      playbook_rule_candidate
                    </span>
                    ; promote on Rule candidates (review).
                  </p>
                  <button
                    type="button"
                    onClick={() => setPlaybookAuditSpecialist(false)}
                    className="shrink-0 rounded border border-white/25 bg-white/10 px-2 py-0.5 font-['Saans',ui-sans-serif] text-[10px] text-white/90 hover:bg-white/15"
                  >
                    Exit rule audit
                  </button>
                </div>
              ) : null}
              {bulkTriageSpecialist ? (
                <div
                  className="mb-2 flex flex-wrap items-center justify-between gap-2 rounded-md border border-amber-400/40 bg-amber-600/[0.16] px-2 py-1.5"
                  role="status"
                >
                  <p className="font-['Saans',ui-sans-serif] text-[10px] leading-snug text-amber-50/95">
                    Bulk triage mode — grounded Today / queue snapshot only; one confirmable action proposal per turn.
                  </p>
                  <button
                    type="button"
                    onClick={() => setBulkTriageSpecialist(false)}
                    className="shrink-0 rounded border border-white/25 bg-white/10 px-2 py-0.5 font-['Saans',ui-sans-serif] text-[10px] text-white/90 hover:bg-white/15"
                  >
                    Exit bulk triage
                  </button>
                </div>
              ) : null}

              <div
                ref={listRef}
                className="ana-widget-body flex-1 space-y-4 overflow-y-auto overscroll-contain pr-0.5"
                role="log"
                aria-live="polite"
                aria-relevant="additions"
              >
                {messages.length === 0 && !anaTyping && (
                  <div className="flex h-full min-h-[100px] flex-col items-center justify-center gap-3 py-6">
                    <span className="ana-badge-logo" aria-hidden>
                      a
                    </span>
                    {!escalationResolverPin &&
                    !offerBuilderSpecialistPin &&
                    !invoiceSetupSpecialist &&
                    !investigationSpecialist &&
                    !playbookAuditSpecialist &&
                    !bulkTriageSpecialist ? (
                      <div className="flex flex-wrap items-center justify-center gap-2">
                        <button
                          type="button"
                          onClick={() => setInvestigationSpecialist(true)}
                          className="rounded border border-cyan-400/40 bg-cyan-500/15 px-2.5 py-1 font-['Saans',ui-sans-serif] text-[10px] text-cyan-100/95 hover:bg-cyan-500/25"
                          data-testid="ana-enter-investigation-mode"
                        >
                          Deep search (investigation mode)
                        </button>
                        <button
                          type="button"
                          onClick={() => setPlaybookAuditSpecialist(true)}
                          className="rounded border border-emerald-400/40 bg-emerald-600/15 px-2.5 py-1 font-['Saans',ui-sans-serif] text-[10px] text-emerald-100/95 hover:bg-emerald-600/25"
                          data-testid="ana-enter-playbook-audit-mode"
                        >
                          Rule audit (playbook mode)
                        </button>
                        <button
                          type="button"
                          onClick={() => setBulkTriageSpecialist(true)}
                          className="rounded border border-amber-400/45 bg-amber-600/18 px-2.5 py-1 font-['Saans',ui-sans-serif] text-[10px] text-amber-100/95 hover:bg-amber-600/28"
                          data-testid="ana-enter-bulk-triage-mode"
                        >
                          Bulk triage (queue mode)
                        </button>
                      </div>
                    ) : null}
                  </div>
                )}
                {messages.map((m) => (
                  <motion.div
                    key={m.id}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.2 }}
                  >
                    <p className="ana-widget-role mb-1">{m.role === "user" ? "You" : "Ana"}</p>
                    {m.role === "user" ? (
                      <p className="whitespace-pre-wrap text-[12px] leading-[1.45] text-white/[0.96]">{m.text}</p>
                    ) : isAssistantInFlightLine(m) ? (
                      m.streamingText.length === 0 ? (
                        <span className="inline-flex gap-1" aria-label="Ana is typing">
                          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white/40" />
                          <span
                            className="h-1.5 w-1.5 animate-pulse rounded-full bg-white/40"
                            style={{ animationDelay: "0.15s" }}
                          />
                          <span
                            className="h-1.5 w-1.5 animate-pulse rounded-full bg-white/40"
                            style={{ animationDelay: "0.3s" }}
                          />
                        </span>
                      ) : (
                        <p className="whitespace-pre-wrap text-[12px] leading-[1.45] text-white/[0.96]">{m.streamingText}</p>
                      )
                    ) : m.display.kind === "contract_violation" ? (
                      <p className="whitespace-pre-wrap text-[12px] leading-[1.45] text-amber-200">
                        {m.display.mainText}
                      </p>
                    ) : (
                      <div>
                        <p className="whitespace-pre-wrap text-[12px] leading-[1.45] text-white/[0.96]">
                          {m.display.mainText}
                        </p>
                        <p className="mt-2 border-l border-white/25 pl-2 font-['Saans',ui-sans-serif] text-[10px] leading-relaxed text-white/60">
                          {m.display.operatorRibbon}
                        </p>
                        {m.display.playbookRuleProposals.length > 0 && (
                          <ul className="mt-2 space-y-2">
                            {m.display.playbookRuleProposals.map((p) => {
                              const pk = ruleProposalKey(p);
                              const busy = confirmingProposalKey === pk;
                              const consumed = isProposalKeyConsumed(consumedProposalKeysByMessageId, m.id, pk);
                              return (
                                <li
                                  key={pk}
                                  className="rounded-md border border-amber-400/25 bg-amber-500/[0.07] px-2.5 py-2 text-left"
                                >
                                  <p className="font-['Saans',ui-sans-serif] text-[10px] font-semibold uppercase tracking-wide text-amber-200/90">
                                    Proposed playbook rule
                                  </p>
                                  <p className="mt-1 font-['Saans',ui-sans-serif] text-[11px] text-white/90">{p.topic}</p>
                                  <p className="mt-0.5 line-clamp-4 font-['Saans',ui-sans-serif] text-[10px] leading-snug text-white/70">
                                    {p.proposedInstruction}
                                  </p>
                                  <p className="mt-1.5 font-['SaansMono',ui-monospace,monospace] text-[9px] text-white/50">
                                    {p.proposedActionKey} · {p.proposedDecisionMode} · {p.proposedScope}
                                  </p>
                                  {consumed && (
                                    <p className="mt-1.5 font-['Saans',ui-sans-serif] text-[10px] text-emerald-200/90">
                                      Rule candidate created.
                                    </p>
                                  )}
                                  <button
                                    type="button"
                                    disabled={busy || consumed}
                                    onClick={() => void confirmPlaybookRuleProposal(m.id, p)}
                                    className="mt-2 rounded border border-amber-400/40 bg-amber-500/20 px-2 py-1 font-['Saans',ui-sans-serif] text-[10px] text-amber-100 hover:bg-amber-500/30 disabled:cursor-not-allowed disabled:opacity-50"
                                  >
                                    {consumed ? "Created" : busy ? "Creating…" : "Create rule candidate (review next)"}
                                  </button>
                                </li>
                              );
                            })}
                          </ul>
                        )}
                        {m.display.taskProposals.length > 0 && (
                          <ul className="mt-2 space-y-2">
                            {m.display.taskProposals.map((p) => {
                              const pk = taskProposalKey(p);
                              const busy = confirmingProposalKey === pk;
                              const consumed = isProposalKeyConsumed(consumedProposalKeysByMessageId, m.id, pk);
                              return (
                                <li
                                  key={pk}
                                  className="rounded-md border border-sky-400/25 bg-sky-500/[0.07] px-2.5 py-2 text-left"
                                >
                                  <p className="font-['Saans',ui-sans-serif] text-[10px] font-semibold uppercase tracking-wide text-sky-200/90">
                                    Proposed task
                                  </p>
                                  <p className="mt-1 font-['Saans',ui-sans-serif] text-[11px] text-white/90">{p.title}</p>
                                  <p className="mt-0.5 font-['SaansMono',ui-monospace,monospace] text-[9px] text-white/55">
                                    Due {p.dueDate}
                                    {p.weddingId ? ` · wedding ${p.weddingId}` : ""}
                                  </p>
                                  <p className="mt-1 font-['Saans',ui-sans-serif] text-[9px] leading-snug text-white/50">
                                    Not saved until you confirm — adds an open task you can reschedule or complete from Tasks.
                                  </p>
                                  {consumed && (
                                    <p className="mt-1.5 font-['Saans',ui-sans-serif] text-[10px] text-emerald-200/90">
                                      Task created — open it from your task list to adjust or mark done.
                                    </p>
                                  )}
                                  <button
                                    type="button"
                                    disabled={busy || consumed}
                                    onClick={() => void confirmTaskProposal(m.id, p)}
                                    className="mt-2 rounded border border-sky-400/40 bg-sky-500/20 px-2 py-1 font-['Saans',ui-sans-serif] text-[10px] text-sky-100 hover:bg-sky-500/30 disabled:cursor-not-allowed disabled:opacity-50"
                                  >
                                    {consumed ? "Created" : busy ? "Creating…" : "Create task (confirm)"}
                                  </button>
                                </li>
                              );
                            })}
                          </ul>
                        )}
                        {m.display.memoryNoteProposals.length > 0 && (
                          <ul className="mt-2 space-y-2">
                            {m.display.memoryNoteProposals.map((p) => {
                              const pk = memoryProposalKey(p);
                              const busy = confirmingProposalKey === pk;
                              const consumed = isProposalKeyConsumed(consumedProposalKeysByMessageId, m.id, pk);
                              return (
                                <li
                                  key={pk}
                                  className="rounded-md border border-violet-400/25 bg-violet-500/[0.07] px-2.5 py-2 text-left"
                                >
                                  <p className="font-['Saans',ui-sans-serif] text-[10px] font-semibold uppercase tracking-wide text-violet-200/90">
                                    Proposed memory
                                  </p>
                                  <p className="mt-1 font-['Saans',ui-sans-serif] text-[11px] text-white/90">{p.title}</p>
                                  <p className="mt-0.5 line-clamp-3 font-['Saans',ui-sans-serif] text-[10px] leading-snug text-white/70">
                                    {p.summary}
                                  </p>
                                  <p className="mt-1 font-['SaansMono',ui-monospace,monospace] text-[9px] text-white/50">
                                    {p.memoryScope}
                                    {p.weddingId ? ` · wedding ${p.weddingId}` : ""}
                                    {p.personId ? ` · person ${p.personId}` : ""}
                                  </p>
                                  <p className="mt-1 font-['Saans',ui-sans-serif] text-[9px] leading-snug text-white/50">
                                    Not saved until you confirm — adds a studio/project/person memory you can use in future context.
                                  </p>
                                  {consumed && (
                                    <p className="mt-1.5 font-['Saans',ui-sans-serif] text-[10px] text-emerald-200/90">Memory saved.</p>
                                  )}
                                  <button
                                    type="button"
                                    disabled={busy || consumed}
                                    onClick={() => void confirmMemoryNoteProposal(m.id, p)}
                                    className="mt-2 rounded border border-violet-400/40 bg-violet-500/20 px-2 py-1 font-['Saans',ui-sans-serif] text-[10px] text-violet-100 hover:bg-violet-500/30 disabled:cursor-not-allowed disabled:opacity-50"
                                  >
                                    {consumed ? "Saved" : busy ? "Saving…" : "Save memory (confirm)"}
                                  </button>
                                </li>
                              );
                            })}
                          </ul>
                        )}
                        {m.display.authorizedCaseExceptionProposals.length > 0 && (
                          <ul className="mt-2 space-y-2">
                            {m.display.authorizedCaseExceptionProposals.map((p) => {
                              const pk = caseExceptionProposalKey(p);
                              const busy = confirmingProposalKey === pk;
                              const consumed = isProposalKeyConsumed(consumedProposalKeysByMessageId, m.id, pk);
                              return (
                                <li
                                  key={pk}
                                  className="rounded-md border border-fuchsia-400/25 bg-fuchsia-500/[0.07] px-2.5 py-2 text-left"
                                >
                                  <p className="font-['Saans',ui-sans-serif] text-[10px] font-semibold uppercase tracking-wide text-fuchsia-200/90">
                                    Proposed case exception
                                  </p>
                                  <p className="mt-1 font-['SaansMono',ui-monospace,monospace] text-[10px] text-white/80">
                                    {p.overridesActionKey}
                                  </p>
                                  <p className="mt-0.5 font-['Saans',ui-sans-serif] text-[10px] leading-snug text-white/65">
                                    One-off override for this project (not a global playbook change).
                                  </p>
                                  <p className="mt-1 font-['Saans',ui-sans-serif] text-[10px] leading-snug text-fuchsia-100/90">
                                    {caseExceptionOverrideSummaryLine(p)}
                                  </p>
                                  {p.notes && (
                                    <p className="mt-1 line-clamp-3 font-['Saans',ui-sans-serif] text-[9px] leading-snug text-white/60">
                                      Note: {p.notes}
                                    </p>
                                  )}
                                  <p className="mt-1 font-['SaansMono',ui-monospace,monospace] text-[9px] text-white/50">
                                    wedding {p.weddingId}
                                    {p.clientThreadId ? ` · thread ${p.clientThreadId}` : ""}
                                  </p>
                                  <p className="mt-1 font-['Saans',ui-sans-serif] text-[9px] leading-snug text-white/50">
                                    Not saved until you confirm — inserts one authorized_case_exceptions row for this
                                    project only (no global playbook edit).
                                  </p>
                                  {consumed && (
                                    <p className="mt-1.5 font-['Saans',ui-sans-serif] text-[10px] text-emerald-200/90">
                                      Exception saved.
                                    </p>
                                  )}
                                  <button
                                    type="button"
                                    disabled={busy || consumed}
                                    onClick={() => void confirmAuthorizedCaseExceptionProposal(m.id, p)}
                                    className="mt-2 rounded border border-fuchsia-400/40 bg-fuchsia-500/20 px-2 py-1 font-['Saans',ui-sans-serif] text-[10px] text-fuchsia-100 hover:bg-fuchsia-500/30 disabled:cursor-not-allowed disabled:opacity-50"
                                  >
                                    {consumed ? "Saved" : busy ? "Saving…" : "Save case exception (confirm)"}
                                  </button>
                                </li>
                              );
                            })}
                          </ul>
                        )}
                        {m.display.studioProfileChangeProposals.length > 0 && (
                          <ul className="mt-2 space-y-2">
                            {m.display.studioProfileChangeProposals.map((p) => {
                              const pk = studioProfileChangeProposalKey(p);
                              const busy = confirmingProposalKey === pk;
                              const consumed = isProposalKeyConsumed(consumedProposalKeysByMessageId, m.id, pk);
                              return (
                                <li
                                  key={pk}
                                  className="rounded-md border border-teal-400/30 bg-teal-500/[0.08] px-2.5 py-2 text-left"
                                >
                                  <p className="font-['Saans',ui-sans-serif] text-[10px] font-semibold uppercase tracking-wide text-teal-200/90">
                                    Proposed studio profile change
                                  </p>
                                  <p className="mt-1 line-clamp-4 font-['Saans',ui-sans-serif] text-[10px] leading-snug text-white/80">
                                    {p.rationale}
                                  </p>
                                  <p className="mt-1 font-['Saans',ui-sans-serif] text-[9px] leading-snug text-teal-100/90">
                                    {studioProfileChangeProposalSummaryLine(p)}
                                  </p>
                                  <p className="mt-1 font-['Saans',ui-sans-serif] text-[9px] leading-snug text-white/50">
                                    Queues a review row only — does not change live profile or settings until a future
                                    apply step. Nothing is saved until you confirm below.
                                  </p>
                                  {consumed && (
                                    <p className="mt-1.5 font-['Saans',ui-sans-serif] text-[10px] text-emerald-200/90">
                                      Enqueued for review.
                                    </p>
                                  )}
                                  <button
                                    type="button"
                                    disabled={busy || consumed}
                                    onClick={() => void confirmStudioProfileChangeProposal(m.id, p)}
                                    className="mt-2 rounded border border-teal-400/40 bg-teal-600/25 px-2 py-1 font-['Saans',ui-sans-serif] text-[10px] text-teal-100 hover:bg-teal-600/35 disabled:cursor-not-allowed disabled:opacity-50"
                                  >
                                    {consumed ? "Enqueued" : busy ? "Enqueueing…" : "Enqueue for review (confirm)"}
                                  </button>
                                </li>
                              );
                            })}
                          </ul>
                        )}
                        {m.display.offerBuilderChangeProposals.length > 0 && (
                          <ul className="mt-2 space-y-2">
                            {m.display.offerBuilderChangeProposals.map((p) => {
                              const pk = offerBuilderChangeProposalKey(p);
                              const busy = confirmingProposalKey === pk;
                              const consumed = isProposalKeyConsumed(consumedProposalKeysByMessageId, m.id, pk);
                              const offerProjectIdMismatch =
                                offerBuilderSpecialistPin != null &&
                                p.project_id.trim() !== offerBuilderSpecialistPin;
                              return (
                                <li
                                  key={pk}
                                  className="rounded-md border border-amber-400/30 bg-amber-500/[0.08] px-2.5 py-2 text-left"
                                >
                                  <p className="font-['Saans',ui-sans-serif] text-[10px] font-semibold uppercase tracking-wide text-amber-200/90">
                                    Proposed offer document change
                                  </p>
                                  <p className="mt-1 line-clamp-4 font-['Saans',ui-sans-serif] text-[10px] leading-snug text-white/80">
                                    {p.rationale}
                                  </p>
                                  <p className="mt-1 font-['SaansMono',ui-monospace,monospace] text-[9px] text-white/55">
                                    project {p.project_id}
                                  </p>
                                  <p className="mt-1 font-['Saans',ui-sans-serif] text-[9px] leading-snug text-amber-100/90">
                                    {offerBuilderChangeProposalSummaryLine(p)}
                                  </p>
                                  <p className="mt-1 font-['Saans',ui-sans-serif] text-[9px] leading-snug text-white/50">
                                    Name / title only (no layout or pricing blocks). Queues one review row — does not edit
                                    the live offer until a future apply step. Nothing is saved until you confirm below.
                                  </p>
                                  {offerProjectIdMismatch ? (
                                    <p className="mt-1 font-['Saans',ui-sans-serif] text-[10px] text-amber-200/95">
                                      Project id does not match pinned offer — confirm is disabled.
                                    </p>
                                  ) : null}
                                  {consumed && (
                                    <p className="mt-1.5 font-['Saans',ui-sans-serif] text-[10px] text-emerald-200/90">
                                      Enqueued for review.
                                    </p>
                                  )}
                                  <button
                                    type="button"
                                    disabled={busy || consumed || offerProjectIdMismatch}
                                    onClick={() => void confirmOfferBuilderChangeProposal(m.id, p)}
                                    className="mt-2 rounded border border-amber-400/40 bg-amber-600/25 px-2 py-1 font-['Saans',ui-sans-serif] text-[10px] text-amber-100 hover:bg-amber-600/35 disabled:cursor-not-allowed disabled:opacity-50"
                                  >
                                    {consumed ? "Enqueued" : busy ? "Enqueueing…" : "Enqueue for review (confirm)"}
                                  </button>
                                </li>
                              );
                            })}
                          </ul>
                        )}
                        {m.display.invoiceSetupChangeProposals.length > 0 && (
                          <ul className="mt-2 space-y-2">
                            {m.display.invoiceSetupChangeProposals.map((p) => {
                              const pk = invoiceSetupChangeProposalKey(p);
                              const busy = confirmingProposalKey === pk;
                              const consumed = isProposalKeyConsumed(consumedProposalKeysByMessageId, m.id, pk);
                              return (
                                <li
                                  key={pk}
                                  className="rounded-md border border-sky-400/30 bg-sky-500/[0.08] px-2.5 py-2 text-left"
                                >
                                  <p className="font-['Saans',ui-sans-serif] text-[10px] font-semibold uppercase tracking-wide text-sky-200/90">
                                    Proposed invoice template change
                                  </p>
                                  <p className="mt-1 line-clamp-4 font-['Saans',ui-sans-serif] text-[10px] leading-snug text-white/80">
                                    {p.rationale}
                                  </p>
                                  <p className="mt-1 font-['Saans',ui-sans-serif] text-[9px] leading-snug text-sky-100/90">
                                    {invoiceSetupChangeProposalSummaryLine(p)}
                                  </p>
                                  <p className="mt-1 font-['Saans',ui-sans-serif] text-[9px] leading-snug text-white/50">
                                    Text / branding fields only (no logo data). Queues one review row — does not edit live
                                    invoice template until a future apply step. Nothing is saved until you confirm below.
                                  </p>
                                  {consumed && (
                                    <p className="mt-1.5 font-['Saans',ui-sans-serif] text-[10px] text-emerald-200/90">
                                      Enqueued for review.
                                    </p>
                                  )}
                                  <button
                                    type="button"
                                    disabled={busy || consumed}
                                    onClick={() => void confirmInvoiceSetupChangeProposal(m.id, p)}
                                    className="mt-2 rounded border border-sky-400/40 bg-sky-600/25 px-2 py-1 font-['Saans',ui-sans-serif] text-[10px] text-sky-100 hover:bg-sky-600/35 disabled:cursor-not-allowed disabled:opacity-50"
                                  >
                                    {consumed ? "Enqueued" : busy ? "Enqueueing…" : "Enqueue for review (confirm)"}
                                  </button>
                                </li>
                              );
                            })}
                          </ul>
                        )}
                        {m.display.calendarEventCreateProposals.length > 0 && (
                          <ul className="mt-2 space-y-2">
                            {m.display.calendarEventCreateProposals.map((p) => {
                              const pk = calendarEventCreateProposalKey(p);
                              const busy = confirmingProposalKey === pk;
                              const consumed = isProposalKeyConsumed(consumedProposalKeysByMessageId, m.id, pk);
                              return (
                                <li
                                  key={pk}
                                  className="rounded-md border border-emerald-400/25 bg-emerald-500/[0.07] px-2.5 py-2 text-left"
                                >
                                  <p className="font-['Saans',ui-sans-serif] text-[10px] font-semibold uppercase tracking-wide text-emerald-200/90">
                                    Proposed calendar event
                                  </p>
                                  <p className="mt-1 font-['Saans',ui-sans-serif] text-[11px] text-white/90">{p.title}</p>
                                  <p className="mt-0.5 font-['SaansMono',ui-monospace,monospace] text-[9px] text-white/55">
                                    {p.eventType} · {p.startTime} → {p.endTime}
                                    {p.weddingId ? ` · wedding ${p.weddingId}` : ""}
                                  </p>
                                  <p className="mt-1 font-['Saans',ui-sans-serif] text-[9px] leading-snug text-white/50">
                                    Creates one row in your app calendar (database). Not saved until you confirm.
                                  </p>
                                  {consumed && (
                                    <p className="mt-1.5 font-['Saans',ui-sans-serif] text-[10px] text-emerald-200/90">
                                      Event created.
                                    </p>
                                  )}
                                  <button
                                    type="button"
                                    disabled={busy || consumed}
                                    onClick={() => void confirmCalendarEventCreateProposal(m.id, p)}
                                    className="mt-2 rounded border border-emerald-400/40 bg-emerald-500/20 px-2 py-1 font-['Saans',ui-sans-serif] text-[10px] text-emerald-100 hover:bg-emerald-500/30 disabled:cursor-not-allowed disabled:opacity-50"
                                  >
                                    {consumed ? "Created" : busy ? "Saving…" : "Create calendar event (confirm)"}
                                  </button>
                                </li>
                              );
                            })}
                          </ul>
                        )}
                        {m.display.calendarEventRescheduleProposals.length > 0 && (
                          <ul className="mt-2 space-y-2">
                            {m.display.calendarEventRescheduleProposals.map((p) => {
                              const pk = calendarEventRescheduleProposalKey(p);
                              const busy = confirmingProposalKey === pk;
                              const consumed = isProposalKeyConsumed(consumedProposalKeysByMessageId, m.id, pk);
                              return (
                                <li
                                  key={pk}
                                  className="rounded-md border border-lime-400/25 bg-lime-500/[0.07] px-2.5 py-2 text-left"
                                >
                                  <p className="font-['Saans',ui-sans-serif] text-[10px] font-semibold uppercase tracking-wide text-lime-200/90">
                                    Reschedule calendar event
                                  </p>
                                  <p className="mt-1 font-['SaansMono',ui-monospace,monospace] text-[9px] text-white/55">
                                    Event {p.calendarEventId}
                                  </p>
                                  <p className="mt-0.5 font-['SaansMono',ui-monospace,monospace] text-[9px] text-white/55">
                                    {p.startTime} → {p.endTime}
                                  </p>
                                  <p className="mt-1 font-['Saans',ui-sans-serif] text-[9px] leading-snug text-white/50">
                                    Updates start and end time only. Not saved until you confirm.
                                  </p>
                                  {consumed && (
                                    <p className="mt-1.5 font-['Saans',ui-sans-serif] text-[10px] text-emerald-200/90">
                                      Times updated.
                                    </p>
                                  )}
                                  <button
                                    type="button"
                                    disabled={busy || consumed}
                                    onClick={() => void confirmCalendarEventRescheduleProposal(m.id, p)}
                                    className="mt-2 rounded border border-lime-400/40 bg-lime-500/20 px-2 py-1 font-['Saans',ui-sans-serif] text-[10px] text-lime-100 hover:bg-lime-500/30 disabled:cursor-not-allowed disabled:opacity-50"
                                  >
                                    {consumed ? "Updated" : busy ? "Updating…" : "Reschedule event (confirm)"}
                                  </button>
                                </li>
                              );
                            })}
                          </ul>
                        )}
                        {m.display.escalationResolveProposals.length > 0 && (
                          <ul className="mt-2 space-y-2">
                            {m.display.escalationResolveProposals.map((p) => {
                              const pk = escalationResolveProposalKey(p);
                              const busy = confirmingProposalKey === pk;
                              const consumed = isProposalKeyConsumed(consumedProposalKeysByMessageId, m.id, pk);
                              const idMismatch = escalationResolverPin !== p.escalationId;
                              return (
                                <li
                                  key={pk}
                                  className="rounded-md border border-rose-400/30 bg-rose-500/[0.1] px-2.5 py-2 text-left"
                                >
                                  <p className="font-['Saans',ui-sans-serif] text-[10px] font-semibold uppercase tracking-wide text-rose-200/90">
                                    Proposed escalation resolution
                                  </p>
                                  <p className="mt-1 font-['SaansMono',ui-monospace,monospace] text-[9px] text-white/70">
                                    Escalation {p.escalationId}
                                  </p>
                                  <p className="mt-1 whitespace-pre-wrap font-['Saans',ui-sans-serif] text-[11px] leading-snug text-white/90">
                                    {p.resolutionSummary}
                                  </p>
                                  {p.photographerReplyRaw ? (
                                    <p className="mt-1 whitespace-pre-wrap font-['Saans',ui-sans-serif] text-[10px] leading-snug text-white/75">
                                      Reply / notes: {p.photographerReplyRaw}
                                    </p>
                                  ) : null}
                                  <p className="mt-1 font-['Saans',ui-sans-serif] text-[9px] leading-snug text-white/55">
                                    Queues the same dashboard job as Today → Record resolution. Not sent until you confirm.
                                  </p>
                                  {idMismatch ? (
                                    <p className="mt-1 font-['Saans',ui-sans-serif] text-[10px] text-amber-200/95">
                                      Proposal id does not match pinned escalation — confirm is disabled.
                                    </p>
                                  ) : null}
                                  {consumed && (
                                    <p className="mt-1.5 font-['Saans',ui-sans-serif] text-[10px] text-emerald-200/90">
                                      Resolution queued.
                                    </p>
                                  )}
                                  <button
                                    type="button"
                                    disabled={busy || consumed || idMismatch}
                                    onClick={() => void confirmEscalationResolveProposal(m.id, p)}
                                    className="mt-2 rounded border border-rose-400/45 bg-rose-500/25 px-2 py-1 font-['Saans',ui-sans-serif] text-[10px] text-rose-50 hover:bg-rose-500/35 disabled:cursor-not-allowed disabled:opacity-50"
                                  >
                                    {consumed ? "Queued" : busy ? "Queueing…" : "Queue resolution (confirm)"}
                                  </button>
                                </li>
                              );
                            })}
                          </ul>
                        )}
                        {m.display.devRetrieval && (
                          <AssistantDevRetrievalBlock
                            scopes={m.display.devRetrieval.scopes}
                            memoryIds={m.display.devRetrieval.memoryIds}
                          />
                        )}
                      </div>
                    )}
                  </motion.div>
                ))}
                {anaTyping && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2 }}>
                    <p className="ana-widget-role mb-1">Ana</p>
                    <span className="inline-flex gap-1">
                      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white/40" />
                      <span
                        className="h-1.5 w-1.5 animate-pulse rounded-full bg-white/40"
                        style={{ animationDelay: "0.15s" }}
                      />
                      <span
                        className="h-1.5 w-1.5 animate-pulse rounded-full bg-white/40"
                        style={{ animationDelay: "0.3s" }}
                      />
                    </span>
                  </motion.div>
                )}
              </div>

              {pendingCalendarUndo && (
                <div className="mt-2 shrink-0 rounded-md border border-lime-400/30 bg-lime-500/[0.08] px-2.5 py-2">
                  <p className="font-['Saans',ui-sans-serif] text-[10px] leading-snug text-white/80">
                    {pendingCalendarUndo.kind === "create"
                      ? "The last calendar event you created from Ana can be removed."
                      : "The last calendar reschedule from Ana can be reverted to the previous times."}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={undoingCalendarAuditId != null}
                      onClick={() => void undoPendingAnaCalendarWrite()}
                      className="rounded border border-lime-400/45 bg-lime-500/25 px-2 py-1 font-['Saans',ui-sans-serif] text-[10px] text-lime-100 hover:bg-lime-500/35 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {undoingCalendarAuditId ? "Undoing…" : "Undo"}
                    </button>
                    <button
                      type="button"
                      disabled={undoingCalendarAuditId != null}
                      onClick={() => setPendingCalendarUndo(null)}
                      className="rounded border border-white/20 bg-white/5 px-2 py-1 font-['Saans',ui-sans-serif] text-[10px] text-white/75 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              )}

              <div className="mt-3 shrink-0">
                <div className="ana-widget-input-well focus-within:border-white/25">
                  <textarea
                    id="support-question"
                    value={question}
                    onChange={(e) => setQuestion(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        submitQuestion();
                      }
                    }}
                    rows={1}
                    placeholder={
                      escalationResolverPin
                        ? "Ask about this escalation, or send empty to load default resolver prompt…"
                        : offerBuilderSpecialistPin
                          ? "Ask about this offer document, or send empty for the default specialist prompt…"
                          : invoiceSetupSpecialist
                            ? "Ask about invoice PDF template, or send empty for the default specialist prompt…"
                            : investigationSpecialist
                              ? "Describe what to investigate, or send empty for the default investigation prompt…"
                              : playbookAuditSpecialist
                                ? "Ask about playbook coverage or gaps, or send empty for the default rule-audit prompt…"
                                : bulkTriageSpecialist
                                  ? "Ask how to prioritize the queue, or send empty for the default bulk-triage prompt…"
                                  : "Ask me anything..."
                    }
                    disabled={lockComposerWhileSubmitting}
                    className="w-full resize-none bg-transparent px-3 pt-2.5 pb-1 font-['Saans',ui-sans-serif] text-[12px] text-white/[0.96] placeholder:text-white/45 focus:outline-none disabled:opacity-60"
                  />
                  <div className="flex items-center justify-end px-2 pb-1.5">
                    <button
                      type="button"
                      onClick={() => submitQuestion()}
                      disabled={
                        lockComposerWhileSubmitting ||
                        (!question.trim() &&
                          !escalationResolverPin &&
                          !offerBuilderSpecialistPin &&
                          !invoiceSetupSpecialist &&
                          !investigationSpecialist &&
                          !playbookAuditSpecialist &&
                          !bulkTriageSpecialist)
                      }
                      className="ana-widget-send disabled:opacity-35"
                      aria-label="Send"
                    >
                      <AnaWidgetSendIcon />
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <motion.button
          type="button"
          ref={btnRef}
          title="Ana (studio assistant)"
          onClick={() => {
            if (isDragging.current) return;
            if (!open) computeDir();
            setOpen((o) => !o);
          }}
          className="relative cursor-grab border-0 bg-transparent p-0 active:cursor-grabbing"
          aria-expanded={open}
          aria-controls="support-assistant-panel"
        >
          <span className="ana-badge-port">
            {open ? (
              <>
                <AnaWidgetCloseIcon />
                <span className="text-[12px]">Close</span>
              </>
            ) : (
              <>
                <span className="ana-badge-logo" aria-hidden>
                  a
                </span>
                <span>Ana</span>
              </>
            )}
          </span>
        </motion.button>
      </motion.div>
    </>
  );
}
