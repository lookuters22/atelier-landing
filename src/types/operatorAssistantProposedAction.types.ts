import type { Database } from "./database.types.ts";
import type { AuthorizedCaseExceptionOverridePayload } from "./decisionContext.types.ts";

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
  /** ISO date (YYYY-MM-DD) or parseable date string; normalized server-side for `tasks.due_date`. */
  dueDate: string;
  weddingId?: string | null;
};

/**
 * Slice 8 — durable memory; confirm inserts `memories` with `scope` project | studio only (CHECK-safe).
 * `project` requires tenant-owned `weddingId`; `studio` is tenant-wide (no wedding/person FKs).
 */
export type OperatorAssistantProposedActionMemoryNote = {
  kind: "memory_note";
  memoryScope: "project" | "studio";
  title: string;
  summary: string;
  fullContent: string;
  /** Required when `memoryScope` is `project`. */
  weddingId?: string | null;
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

export type OperatorAssistantProposedAction =
  | OperatorAssistantProposedActionPlaybookRuleCandidate
  | OperatorAssistantProposedActionTask
  | OperatorAssistantProposedActionMemoryNote
  | OperatorAssistantProposedActionAuthorizedCaseException;

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
  dueDate: string;
  weddingId?: string | null;
};

/** API body for `insert-operator-assistant-memory` (confirm step). */
export type InsertOperatorAssistantMemoryBody = {
  memoryScope: "project" | "studio";
  title: string;
  summary: string;
  fullContent: string;
  weddingId?: string | null;
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
