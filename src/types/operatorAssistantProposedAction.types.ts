import type { Database } from "./database.types.ts";
import type { AuthorizedCaseExceptionOverridePayload } from "./decisionContext.types.ts";
import type {
  StudioBusinessProfilePatchV1,
  StudioProfileSettingsPatchV1,
} from "./studioProfileChangeProposal.types.ts";
import type { OfferBuilderMetadataPatchV1 } from "./offerBuilderChangeProposal.types.ts";
import type { InvoiceSetupTemplatePatchV1 } from "./invoiceSetupChangeProposal.types.ts";

/**
 * Slice 6 — staged rule row; promotion via `review_playbook_rule_candidate` only (not direct `playbook_rules`).
 */
export type OperatorAssistantProposedActionPlaybookRuleCandidate = {
  kind: "playbook_rule_candidate";
  /** Stable key for the rule (snake_case / slug style). */
  proposedActionKey: string;
  topic: string;
  proposedInstruction: string;
  proposedDecisionMode: Database["public"]["Enums"]["decision_mode"];
  proposedScope: Database["public"]["Enums"]["rule_scope"];
  /** Required when `proposedScope` is `channel` (DB + review RPC invariant). Omitted or null for `global`. */
  proposedChannel?: Database["public"]["Enums"]["thread_channel"] | null;
  /**
   * Optional project anchor. Must be validated server-side (tenant owns wedding).
   * Stays on the candidate row; `review_playbook_rule_candidate` handles promotion.
   */
  weddingId?: string | null;
};

/**
 * Slice 7 — task follow-up; confirm inserts `tasks` with `status: open` (no automation).
 * Maps to `tasks` insert: title, due_date, wedding_id (optional), thread_id null for assistant-created rows.
 */
export type OperatorAssistantProposedActionTask = {
  kind: "task";
  title: string;
  /**
   * YYYY-MM-DD (UTC calendar). After server/widget normalization, always set.
   * The model may omit **dueDate** in JSON; confirm path defaults to today (UTC).
   */
  dueDate: string;
  weddingId?: string | null;
};

/**
 * Durable memory; confirm inserts `memories` with `scope` project | person | studio (CHECK-safe).
 * - `project`: tenant-owned `weddingId` required; no `personId`.
 * - `person`: tenant-owned `personId` required; no `weddingId`.
 * - `studio`: neither FK.
 */
export type OperatorAssistantProposedActionMemoryNote = {
  kind: "memory_note";
  memoryScope: "project" | "studio" | "person";
  title: string;
  summary: string;
  fullContent: string;
  /** Required when `memoryScope` is `project`. */
  weddingId?: string | null;
  /** Required when `memoryScope` is `person` (UUID from tenant `people`). */
  personId?: string | null;
};

/**
 * Slice 11 — one-off case policy bend; confirm inserts `authorized_case_exceptions` only (not `playbook_rules`).
 */
export type OperatorAssistantProposedActionAuthorizedCaseException = {
  kind: "authorized_case_exception";
  /** `playbook_rules.action_key` this exception narrows for the wedding. */
  overridesActionKey: string;
  overridePayload: AuthorizedCaseExceptionOverridePayload;
  /** Case scope is always a tenant-owned project. */
  weddingId: string;
  /** When set, exception applies to this thread only; otherwise all threads on the wedding. */
  clientThreadId?: string | null;
  /** When known, disambiguate which playbook row to target (audit + merge). */
  targetPlaybookRuleId?: string | null;
  /** Optional end time (ISO). Default TTL is applied on confirm when omitted. */
  effectiveUntil?: string | null;
  /** Short note for the exception row. */
  notes?: string | null;
};

/**
 * Bounded studio profile / capability change — confirm enqueues `studio_profile_change_proposals` only (no apply).
 * Patches are allowlisted: `STUDIO_PROFILE_PROPOSAL_SETTINGS_KEYS` and `STUDIO_BIZ_PROFILE_PROPOSAL_KEYS` only.
 */
export type OperatorAssistantProposedActionStudioProfileChangeProposal = {
  kind: "studio_profile_change_proposal";
  rationale: string;
  settings_patch?: StudioProfileSettingsPatchV1;
  studio_business_profile_patch?: StudioBusinessProfilePatchV1;
};

/**
 * Bounded offer-document metadata change — confirm enqueues `offer_builder_change_proposals`; live apply is on the proposals review page via RPC (not auto from the widget).
 * `metadata_patch` allowlist: **name** (hub label) and **root_title** (document title string) only.
 */
export type OperatorAssistantProposedActionOfferBuilderChangeProposal = {
  kind: "offer_builder_change_proposal";
  rationale: string;
  /** `studio_offer_builder_projects.id` — must appear in Context **Offer projects** list. */
  project_id: string;
  metadata_patch: OfferBuilderMetadataPatchV1;
};

/**
 * Bounded PDF invoice template fields — confirm enqueues `invoice_setup_change_proposals` only (no live apply).
 * `template_patch` allowlist: **legalName**, **invoicePrefix**, **paymentTerms**, **accentColor**, **footerNote** — **not** `logoDataUrl` or raw template JSON.
 */
export type OperatorAssistantProposedActionInvoiceSetupChangeProposal = {
  kind: "invoice_setup_change_proposal";
  rationale: string;
  template_patch: InvoiceSetupTemplatePatchV1;
};

/**
 * F3 — simple `calendar_events` create (confirm → insert). Optional project link via `weddingId`.
 */
export type OperatorAssistantProposedActionCalendarEventCreate = {
  kind: "calendar_event_create";
  title: string;
  /** ISO 8601 timestamptz string */
  startTime: string;
  endTime: string;
  eventType: Database["public"]["Enums"]["event_type"];
  weddingId?: string | null;
};

/**
 * F3 — narrow reschedule: only `start_time` / `end_time` on an existing tenant-owned row.
 * `calendarEventId` must match an id from Context (e.g. Calendar lookup) when the operator refers to a listed event.
 */
export type OperatorAssistantProposedActionCalendarEventReschedule = {
  kind: "calendar_event_reschedule";
  calendarEventId: string;
  startTime: string;
  endTime: string;
};

/**
 * S1 — queue dashboard escalation resolution (`dashboard-resolve-escalation`) after operator confirms on the card.
 * Must match the pinned escalation id in resolver mode; server filters stray proposals.
 */
export type OperatorAssistantProposedActionEscalationResolve = {
  kind: "escalation_resolve";
  escalationId: string;
  resolutionSummary: string;
  photographerReplyRaw?: string | null;
};

export type OperatorAssistantProposedAction =
  | OperatorAssistantProposedActionPlaybookRuleCandidate
  | OperatorAssistantProposedActionTask
  | OperatorAssistantProposedActionMemoryNote
  | OperatorAssistantProposedActionAuthorizedCaseException
  | OperatorAssistantProposedActionStudioProfileChangeProposal
  | OperatorAssistantProposedActionOfferBuilderChangeProposal
  | OperatorAssistantProposedActionInvoiceSetupChangeProposal
  | OperatorAssistantProposedActionCalendarEventCreate
  | OperatorAssistantProposedActionCalendarEventReschedule
  | OperatorAssistantProposedActionEscalationResolve;

/** API body for `insert-operator-assistant-calendar-event` (confirm step). */
export type InsertOperatorAssistantCalendarEventBody =
  | {
      operation: "create";
      title: string;
      startTime: string;
      endTime: string;
      eventType: Database["public"]["Enums"]["event_type"];
      weddingId: string | null;
    }
  | {
      operation: "reschedule";
      calendarEventId: string;
      startTime: string;
      endTime: string;
    };

/**
 * API body for `insert-operator-assistant-playbook-rule-candidate` (confirm step).
 * Matches the proposal fields the UI received from the assistant.
 */
export type InsertOperatorAssistantPlaybookRuleCandidateBody = {
  proposedActionKey: string;
  topic: string;
  proposedInstruction: string;
  proposedDecisionMode: Database["public"]["Enums"]["decision_mode"];
  proposedScope: Database["public"]["Enums"]["rule_scope"];
  proposedChannel?: Database["public"]["Enums"]["thread_channel"] | null;
  weddingId?: string | null;
};

/** API body for `insert-operator-assistant-task` (confirm step). */
export type InsertOperatorAssistantTaskBody = {
  title: string;
  /** Omit to default to today (UTC calendar) — same as proposal normalization. */
  dueDate?: string;
  weddingId?: string | null;
};

/** API body for `insert-operator-assistant-memory` (confirm step). */
export type InsertOperatorAssistantMemoryBody = {
  memoryScope: "project" | "studio" | "person";
  title: string;
  summary: string;
  fullContent: string;
  weddingId?: string | null;
  personId?: string | null;
};

/** API body for `insert-operator-assistant-authorized-case-exception` (confirm step). */
export type InsertOperatorAssistantAuthorizedCaseExceptionBody = {
  overridesActionKey: string;
  overridePayload: AuthorizedCaseExceptionOverridePayload;
  weddingId: string;
  clientThreadId?: string | null;
  targetPlaybookRuleId?: string | null;
  effectiveUntil?: string | null;
  notes?: string | null;
};
