/**
 * V3 intake — shared contract for **resolver/bootstrap first, orchestrator after records exist**.
 *
 * Pre-orchestrator work: structured extraction + CRM lead rows + optional origin-thread link.
 * `clientOrchestratorV1` is not invoked here; this module is the stable boundary for a future handoff.
 */

/** Normalized output of the intake extraction + calendar-research step. */
export type IntakeStructuredExtraction = {
  couple_names: string;
  /** Canonical primary ceremony / workflow anchor day. */
  wedding_date: string | null;
  /** Inclusive first day when the inquiry is multi-day (optional). */
  event_start_date: string | null;
  /** Inclusive last day when the inquiry is multi-day (optional). */
  event_end_date: string | null;
  location: string | null;
  budget: string | null;
  story_notes: string;
  /** Passed to persona / future reply agents; not the full raw inbound. */
  raw_facts: string;
};

/** Input to CRM/bootstrap after extraction (maps to `createIntakeLeadRecords`). */
export type IntakeLeadCreationInput = {
  photographer_id: string;
  extraction: IntakeStructuredExtraction;
  sender_email: string | undefined;
  raw_message: string;
};

/** Rows created by the intake lead resolver. */
export type IntakeLeadCreationResult = {
  weddingId: string;
  threadId: string;
};

/** Optional linkage from triage’s pre-bootstrap thread to the new wedding. */
export type IntakeOriginThreadLinkInput = {
  photographer_id: string;
  /** From triage `ai/intent.intake` payload; may be undefined. */
  origin_thread_id: string | undefined | null;
  new_wedding_id: string;
};

/**
 * Full result of the intake **bootstrap boundary** (everything before persona / future orchestrator).
 * Suitable for a later step that emits `ai/orchestrator.client.v1` with `weddingId` + `threadId` set.
 */
export type IntakeBootstrapBoundaryOutput = {
  extraction: IntakeStructuredExtraction;
  weddingId: string;
  threadId: string;
  /** True when `origin_thread_id` was provided and linkage was invoked (no-op if missing). */
  originThreadLinked: boolean;
};
