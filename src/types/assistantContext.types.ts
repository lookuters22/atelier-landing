import type { AgentContext } from "./agent.types.ts";
import type { OperatorAnaTriage } from "../lib/operatorAnaTriage.ts";
import type { OperatorAnaCarryForwardForLlm } from "./operatorAnaCarryForward.types.ts";
import type {
  AuthorizedCaseExceptionRow,
  EffectivePlaybookRule,
  PlaybookRuleContextRow,
} from "./decisionContext.types.ts";

/**
 * Bounded CRM slice for photographer-facing assistant queries (Mode B — V3 memory plan §3).
 * Structured facts only; not a full CRM export.
 */
export type AssistantCrmDigest = {
  recentWeddings: Array<{
    id: string;
    couple_names: string;
    stage: string;
    wedding_date: string | null;
  }>;
  recentPeople: Array<{
    id: string;
    display_name: string;
    kind: string;
  }>;
};

/**
 * One wedding row from the bounded entity-resolution index (operator assistant).
 * Distinguishing fields are surfaced in prompts when the query is ambiguous.
 */
export type AssistantOperatorQueryWeddingCandidate = {
  weddingId: string;
  couple_names: string;
  stage: string;
  wedding_date: string | null;
  location: string;
  project_type: string;
};

/** Structured `weddings` + linked rows for a validated focused project (Mode B, Slice 1). */
export type AssistantFocusedWeddingPersonRow = {
  person_id: string;
  role_label: string;
  is_primary_contact: boolean;
  display_name: string;
  kind: string;
};

export type AssistantFocusedContactPointRow = {
  person_id: string;
  kind: string;
  value_raw: string;
  is_primary: boolean;
};

/** Slice 3 — same Today / Zen sources as `useTodayActions` / `buildTodayActionsFromSources` (read-only). */
export type AssistantOperatorStateSummary = {
  fetchedAt: string;
  /** Documents product alignment for operators / debugging (not shown verbatim in full to the model). */
  sourcesNote: string;
  counts: {
    pendingApprovalDrafts: number;
    openTasks: number;
    openEscalations: number;
    linkedOpenLeads: number;
    /** All unlinked threads in the inbox projection (includes suppressed) — bucket = `deriveInboxThreadBucket`. */
    unlinked: {
      inquiry: number;
      needsFiling: number;
      operatorReview: number;
      suppressed: number;
    };
    /** Matches ZenLobby top tabs (`countTodayActionsByZenTab`). Open tasks are not in a tab but counted separately. */
    zenTabs: {
      review: number;
      drafts: number;
      leads: number;
      needs_filing: number;
    };
  };
  /**
   * Deterministic priority lines from **counts + samples** (F5 queue urgency refinement).
   * Blocking vs triage framing, top-of-feed sample, overdue tasks (UTC due-date vs snapshot day) — no SLA scoring.
   */
  queueHighlights: string[];
  samples: {
    pendingDrafts: Array<{ id: string; title: string; subtitle: string }>;
    openEscalations: Array<{ id: string; title: string; actionKey: string }>;
    openTasks: Array<{ id: string; title: string; dueDate: string; subtitle: string | null }>;
    topActions: Array<{ id: string; title: string; typeLabel: string }>;
    /** Linked pre-booking threads (titles only), newest activity first. */
    linkedLeads: Array<{ threadId: string; title: string; subtitle: string }>;
    /** Recent unlinked threads per inbox bucket (non-suppressed), titles only. */
    unlinkedBuckets: {
      inquiry: Array<{ threadId: string; title: string }>;
      needsFiling: Array<{ threadId: string; title: string }>;
      operatorReview: Array<{ threadId: string; title: string }>;
    };
  };
};

/**
 * Operator prompt slice 2: minimal **pointer** for the UI-focused `weddings` row — not deep CRM.
 * Full details: `operator_lookup_project_details` tool with `summary.projectId`.
 */
export type AssistantFocusedProjectSummary = {
  projectId: string;
  projectType: string;
  stage: string;
  displayTitle: string;
};

/**
 * A single `weddings` read for venue + key dates; **not** rendered in the focused-project prompt block
 * (Slice 2). Used by operator weather (geocode hint) and similar tools. Tenant-scoped.
 */
export type AssistantFocusedProjectRowHints = {
  location: string;
  wedding_date: string | null;
  event_start_date: string | null;
  event_end_date: string | null;
};

export type AssistantFocusedProjectFacts = {
  weddingId: string;
  couple_names: string;
  stage: string;
  project_type: string;
  wedding_date: string | null;
  event_start_date: string | null;
  event_end_date: string | null;
  location: string;
  package_name: string | null;
  contract_value: number | null;
  balance_due: number | null;
  story_notes: string | null;
  package_inclusions: string[];
  people: AssistantFocusedWeddingPersonRow[];
  contactPoints: AssistantFocusedContactPointRow[];
  counts: {
    openTasks: number;
    openEscalations: number;
    pendingApprovalDrafts: number;
  };
};

/**
 * Deterministic named-entity / project match for the operator’s current question (read-only, bounded).
 */
export type AssistantOperatorQueryEntityResolution = {
  /**
   * False when the query was too short to run resolution (no extra index fetch).
   * When true, the bounded wedding + people index was loaded for this call.
   */
  didRun: boolean;
  weddingSignal: "none" | "unique" | "ambiguous";
  uniqueWeddingId: string | null;
  /** Set when `weddingSignal` is **ambiguous** (typically 2–3 rows, bounded). */
  weddingCandidates: AssistantOperatorQueryWeddingCandidate[];
  /** `people.display_name` matches from the bounded people index. */
  personMatches: Array<{
    id: string;
    display_name: string;
    kind: string;
  }>;
  /**
   * Full `weddings` + links for the **query-resolved** project when the match is **unique** and
   * distinct from the UI-focused project (or when there is no focused project). Omitted in memory when null.
   */
  queryResolvedProjectFacts: AssistantFocusedProjectFacts | null;
};

/**
 * Bounded `threads` slice for “last email / latest activity / did they send” questions.
 * No full message bodies; use `last_*_at` from `threads` and scoped thread lists only.
 */
export type AssistantOperatorThreadMessageLookup = {
  didRun: boolean;
  /** Short deterministic reason for which branch ran (for debugging, not a user-facing string). */
  selectionNote: string;
  threads: Array<{
    threadId: string;
    title: string;
    weddingId: string | null;
    channel: string;
    kind: string;
    lastActivityAt: string;
    lastInboundAt: string | null;
    lastOutboundAt: string | null;
  }>;
};

/** One message row excerpt for operator body-level Q&A (read-only, bounded). */
export type AssistantOperatorThreadMessageBodyRow = {
  messageId: string;
  direction: string;
  sender: string;
  sentAt: string;
  bodyExcerpt: string;
  bodyClipped: boolean;
};

/**
 * Bounded `messages.body` excerpts for a **single** thread (tenant-scoped).
 * Loaded when body-level intent matches and the thread list narrowed to one row, or via **operator_lookup_thread_messages**.
 */
export type AssistantOperatorThreadMessageBodiesSnapshot = {
  didRun: boolean;
  selectionNote: string;
  threadId: string | null;
  threadTitle: string | null;
  messages: AssistantOperatorThreadMessageBodyRow[];
  /** True if any body was clipped or the message count hit the cap. */
  truncatedOverall: boolean;
};

/**
 * Time-window **new inquiry arrival** counts (first client `direction=in` per thread), UTC windows.
 * Gated by {@link hasOperatorInquiryCountIntent} to avoid extra reads.
 */
/**
 * Compact, deterministic index over the tenant’s **effective** playbook (after case exceptions).
 * Complements, does not replace, the line-by-line rule list in the operator prompt.
 */
export type AssistantPlaybookCoverageSummary = {
  totalActiveRules: number;
  uniqueTopics: string[];
  uniqueActionKeys: string[];
  /** Sorted by topic; useful for “what areas” questions. */
  topicCounts: Array<{ topic: string; count: number }>;
  scopes: string[];
  channels: string[];
  decisionModes: string[];
  sourceTypes: string[];
  confidenceLabels: string[];
  /** From `action_key` segments (e.g. `wedding_travel` → `wedding`, `travel`), sorted. */
  actionKeyTokenHints: string[];
  /**
   * Frequent content tokens from `topic` + `instruction` (min length, stopword-stripped, freq-ordered, capped).
   * Light lexical hinting only — not an NLP topic model.
   */
  coverageKeywordHints: string[];
  /** Rules with an applied `authorized_case_exceptions` overlay in this build. */
  rulesWithCaseException: number;
};

/** One `calendar_events` row for operator schedule Q&A (read-only snapshot). */
export type AssistantOperatorCalendarEventRow = {
  id: string;
  title: string;
  startTime: string;
  endTime: string;
  eventType: string;
  eventTypeLabel: string;
  weddingId: string | null;
  coupleNames: string | null;
  meetingLink: string | null;
};

/**
 * How `calendar_events` were queried for this assistant turn (deterministic, bounded).
 */
export type AssistantOperatorCalendarLookupMode =
  | "idle"
  | "exact_day"
  | "date_range"
  | "recent_history"
  | "upcoming"
  | "last_event"
  | "next_event";

/**
 * Bounded events from `calendar_events` (tenant-scoped, read-only). No external calendars.
 * `lookupMode` + `lookupBasis` describe the actual query; `window*` is the `start_time` filter applied.
 */
export type AssistantOperatorCalendarSnapshot = {
  didRun: boolean;
  computedAt: string;
  lookupMode: AssistantOperatorCalendarLookupMode;
  /** Short explanation for the model (deterministic, not raw query text). */
  lookupBasis: string;
  windowStartIso: string;
  windowEndIso: string;
  /** Human window, e.g. "30d forward" or "UTC day 2026-06-14" or "ISO week …". */
  windowLabel: string;
  /**
   * Nominal span for logging: for `upcoming`, rolling forward days; for `date_range`, inclusive-ish day count;
   * for `exact_day` always 1; for edge modes 0.
   */
  windowDays: number;
  maxRows: number;
  rowCountReturned: number;
  truncated: boolean;
  timeZoneNote: string;
  semanticsNote: string;
  /** When set, results are limited to this tenant `weddings.id` on `calendar_events.wedding_id`. */
  weddingFilter: { weddingId: string; coupleNames: string | null } | null;
  /** When set, `title` ILIKE filter was applied (substring). */
  titleContains: string | null;
  /** When set, only these `event_type` values were included. */
  eventTypeFilter: string[] | null;
  /** Matches the SQL `ORDER BY start_time` direction used for this fetch. */
  orderAscending: boolean;
  events: AssistantOperatorCalendarEventRow[];
};

export type AssistantOperatorInquiryCountSnapshot = {
  didRun: boolean;
  computedAt: string;
  /** Always documents UTC; studio timezone is not applied in this pass. */
  timezoneNote: string;
  /** How "inquiry" is defined for these counts (pre-booking + unlinked `customer_lead`). */
  semanticsNote: string;
  windows: {
    today: { label: string; startIso: string; endIso: string; count: number };
    yesterday: { label: string; startIso: string; endIso: string; count: number };
    thisWeek: { label: string; startIso: string; endIso: string; count: number };
    lastWeek: { label: string; startIso: string; endIso: string; count: number };
  };
  comparison: { todayMinusYesterday: number | null };
  /** Rows returned from the view after filters (capped). */
  rowCountLoaded: number;
  /** When true, the view scan hit the row cap; counts may be low. */
  truncated: boolean;
};

/**
 * Slice 5 — in-repo app surface catalog attached to every operator assistant call (B9). Grounding only; not dynamic UI introspection.
 * `catalogJson` includes routes, dock, left rails, status vocabulary, short pointers, **`APP_PROCEDURAL_WORKFLOWS`**, and **`APP_WORKFLOW_HONESTY_NOTES`**.
 */
/**
 * Slice 12 — bounded studio-wide aggregates for evidence-based operator questions.
 * Sourced from `weddings` (and open task/escalation head counts) only; no external data.
 */
export type AssistantStudioAnalysisSnapshot = {
  fetchedAt: string;
  window: { monthsBack: number; cutoffDateIso: string };
  /** Projects included after rolling window + fetch cap. */
  projectCount: number;
  /**
   * Deterministic grounding lines (Slice 12 hardening): window, caps, confidence, what each aggregate means.
   * Render before JSON in the operator prompt.
   */
  evidenceNotes: string[];
  stageDistribution: Record<string, number>;
  byStage: Array<{ stage: string; count: number }>;
  projectTypeMix: Array<{ project_type: string; count: number }>;
  /** `package_name` among post-booking stages, with mean contract when present. */
  packageMixBooked: Array<{
    package_name: string;
    count: number;
    avgContractValue: number | null;
  }>;
  contractStats: { count: number; min: number; max: number; sum: number; avg: number } | null;
  balanceStats: { count: number; sum: number } | null;
  openTasksCount: number;
  openEscalationsCount: number;
  locationCoverage: { withLocationCount: number; total: number; note: string };
  rowSamples: Array<{
    id: string;
    couple_names: string;
    stage: string;
    project_type: string;
    wedding_date: string | null;
    package_name: string | null;
    contract_value: number | null;
    balance_due: number | null;
    location: string;
  }>;
};

export type AssistantAppCatalogForContext = {
  version: 1;
  /** UTF-8 length of `catalogJson` (prompt budget; mirrors Slice 4 <8KB JSON guard). */
  serializedUtf8Bytes: number;
  /**
   * Minified JSON: routes, dock, left-rail, status vocabulary, workflow pointers, procedural workflows, honesty notes. Authoritative for tab/route/label names.
   */
  catalogJson: string;
  /** Human-readable excerpt derived from the same catalog (tests / future use; formatter may use JSON in the user message). */
  markdownExcerpt: string;
};

/**
 * Operator-only retrieval trace for observability (Slice 5). No raw query text in logs by default —
 * use digest fields for correlation.
 */
export type AssistantRetrievalLog = {
  mode: "assistant_query";
  /** Deterministic fingerprint of query text (not cryptographic). */
  queryDigest: {
    charLength: number;
    fingerprint: string;
  };
  /** Memory / KB / policy layers touched for this call. */
  scopesQueried: Array<
    | "studio_memory"
    | "project_memory"
    | "person_memory"
    | "playbook"
    | "knowledge_base"
    | "crm_digest"
    | "focused_project_facts"
    | "focused_project_summary"
    | "operator_state_summary"
    | "app_catalog"
    | "studio_analysis_snapshot"
    | "operator_query_entity_resolution"
    | "operator_thread_message_lookup"
    | "operator_thread_message_bodies"
    | "operator_inquiry_count_snapshot"
    | "operator_calendar_snapshot"
    | "studio_profile"
    | "offer_builder"
    | "invoice_setup"
  >;
  /** Requested vs tenant-validated (invalid ids are dropped). */
  focus: {
    weddingIdRequested: string | null;
    weddingIdEffective: string | null;
    personIdRequested: string | null;
    personIdEffective: string | null;
  };
  /** Slice 5: no query-text-derived scope expansion; only explicit UI params. */
  queryTextScopeExpansion: "none";
  memoryHeaderCount: number;
  selectedMemoryIds: string[];
  globalKnowledgeRowCount: number;
  /** Slice 12 — set when a studio analysis snapshot was loaded (in-window project count in snapshot is also in the prompt JSON). */
  studioAnalysisProjectCount: number | null;
  /**
   * Deterministic query-time entity / project match (read-only, bounded). Absent on older log shapes.
   */
  entityResolution?: {
    didRun: boolean;
    weddingSignal: "none" | "unique" | "ambiguous";
    uniqueWeddingId: string | null;
    weddingCandidateCount: number;
    personMatchCount: number;
    queryResolvedProjectFactsLoaded: boolean;
  };
  /**
   * Bounded thread/message lookup (inbox-style questions). Optional on older log shapes.
   */
  threadMessageLookup?: {
    didRun: boolean;
    threadCount: number;
  };
  /** Bounded `messages.body` excerpts for one thread (optional). */
  threadMessageBodies?: {
    didRun: boolean;
    messageCount: number;
    truncated: boolean;
  };
  /** Gated: first-inbound–based inquiry counts in UTC day/week windows. */
  inquiryCountSnapshot?: {
    didRun: boolean;
    truncated: boolean;
    todayCount: number;
    yesterdayCount: number;
  };
  /** Gated: bounded `calendar_events` lookup for schedule questions. */
  calendarSnapshot?: {
    didRun: boolean;
    truncated: boolean;
    rowCount: number;
    lookupMode: AssistantOperatorCalendarLookupMode;
  };
  /** v1: capped `studio_offer_builder_projects` list for operator offer-builder grounding. */
  offerBuilder?: {
    projectCount: number;
    listTruncated: boolean;
  };
  /** v1: `studio_invoice_setup` row present for this tenant. */
  invoiceSetup?: {
    hasRow: boolean;
  };
  /** True when query matched operator queue / workload intent (Slice 3 refinement). */
  operatorQueueIntentMatched?: boolean;
  /** Operator Ana: second-pass read-only tool invocations (same HTTP response as `retrievalLog`). */
  readOnlyLookupTools?: Array<{ name: string; ok: boolean; detail?: string }>;
  /** Always present — compact playbook index for “coverage” questions. */
  playbookCoverage?: {
    totalActiveRules: number;
    uniqueTopicCount: number;
    uniqueActionKeyCount: number;
  };
  /** Read-only `studio_business_profiles` row present for this tenant (Slice: studio profile grounding v1). */
  studioBusinessProfileRowPresent?: boolean;
};

/**
 * Context for **photographer-facing assistant** queries only.
 *
 * **Invariant:** `clientFacingForbidden` is always `true` at the type level so this object must not be
 * routed into client-facing writers (V3 memory plan §3 Mode B).
 */
/**
 * Identity / runtime fields from `photographers.settings` (read-only assistant grounding).
 * Null = missing or unset in settings JSON — not a signal to invent values.
 */
export type AssistantStudioProfileIdentity = {
  studio_name: string | null;
  manager_name: string | null;
  photographer_names: string | null;
  timezone: string | null;
  currency: string | null;
  /** One-line label (+ optional country code) from structured `base_location`, when set. */
  base_location: string | null;
  inquiry_first_step_style: string | null;
};

/**
 * Bounded summaries of `studio_business_profiles` JSON columns (read-only).
 * Strings are human-readable excerpts, not raw dumps.
 */
export type AssistantStudioProfileCapability = {
  service_types: string | null;
  core_services: string | null;
  deliverable_types: string | null;
  geographic_scope: string | null;
  travel_policy: string | null;
  language_support: string | null;
  team_structure: string | null;
  client_types: string | null;
  lead_acceptance_rules: string | null;
  service_availability: string | null;
  booking_scope: string | null;
  extensions_summary: string | null;
  source_type: string | null;
  updated_at: string | null;
};

/**
 * Studio capability boundary (what the business offers / can do) vs playbook (how Ana should behave).
 */
export type AssistantStudioProfile = {
  hasBusinessProfileRow: boolean;
  identity: AssistantStudioProfileIdentity;
  /** Null when there is no `studio_business_profiles` row for this tenant. */
  capability: AssistantStudioProfileCapability | null;
};

/** Default assistant studio profile when fetch fails or is not run (tests). */
export const IDLE_ASSISTANT_STUDIO_PROFILE: AssistantStudioProfile = {
  hasBusinessProfileRow: false,
  identity: {
    studio_name: null,
    manager_name: null,
    photographer_names: null,
    timezone: null,
    currency: null,
    base_location: null,
    inquiry_first_step_style: null,
  },
  capability: null,
};

/**
 * One offer-builder project row — **compact** outline from stored Puck data (read-only), not a full design export.
 */
export type AssistantOfferBuilderProjectSummary = {
  id: string;
  displayName: string;
  /** ISO 8601 — same as `studio_offer_builder_projects.updated_at`. */
  updatedAt: string;
  /**
   * Bounded derived text (see `offerPuckAssistantSummary`) so Ana can reason about *packages* / sections
   * without embedding raw `puck_data` JSON in the prompt.
   */
  compactSummary: string;
};

/**
 * v1: tenant-scoped list of `studio_offer_builder_projects` (capped) for “what offers do we have?” questions.
 */
export type AssistantStudioOfferBuilderRead = {
  projects: AssistantOfferBuilderProjectSummary[];
  totalListed: number;
  truncated: boolean;
  note: string;
};

export const IDLE_ASSISTANT_STUDIO_OFFER_BUILDER: AssistantStudioOfferBuilderRead = {
  projects: [],
  totalListed: 0,
  truncated: false,
  note: "",
};

/**
 * Logo on invoice template — **no** raw `logoDataUrl` in context; only safe summary.
 */
export type AssistantInvoiceLogoSummary = {
  hasLogo: boolean;
  /** From `data:mime;base64,` when parseable. */
  mimeType: string | null;
  /** Full stored data-URL string length (proxy for payload size; not decoded pixels). */
  approxDataUrlChars: number;
  note: string;
};

/**
 * v1: one row per tenant in `studio_invoice_setup` (invoice PDF template fields).
 */
export type AssistantStudioInvoiceSetupRead = {
  hasRow: boolean;
  /** ISO 8601 — `studio_invoice_setup.updated_at` when a row exists. */
  updatedAt: string | null;
  /** Parsed template fields (factual from stored JSON). */
  legalName: string;
  invoicePrefix: string;
  paymentTerms: string;
  accentColor: string;
  /** May be truncated — see `footerNoteTruncated`. */
  footerNote: string;
  footerNoteTruncated: boolean;
  logo: AssistantInvoiceLogoSummary;
  note: string;
};

export const IDLE_ASSISTANT_STUDIO_INVOICE_SETUP: AssistantStudioInvoiceSetupRead = {
  hasRow: false,
  updatedAt: null,
  legalName: "",
  invoicePrefix: "",
  paymentTerms: "",
  accentColor: "",
  footerNote: "",
  footerNoteTruncated: false,
  logo: {
    hasLogo: false,
    mimeType: null,
    approxDataUrlChars: 0,
    note: "",
  },
  note: "",
};

/**
 * S1 — specialist escalation resolver: pinned `escalation_requests` id + same provenance shape as
 * `operator_lookup_escalation` (JSON), for grounded resolver-mode prompts only.
 */
export type AssistantEscalationResolverFocus = {
  pinnedEscalationId: string;
  toolPayload: Record<string, unknown>;
};

/**
 * S2 — specialist offer-builder mode: one pinned `studio_offer_builder_projects` id + grounded row snapshot JSON.
 */
export type AssistantOfferBuilderSpecialistFocus = {
  pinnedProjectId: string;
  toolPayload: Record<string, unknown>;
};

/**
 * S3 — specialist invoice-template mode: tenant `studio_invoice_setup` snapshot (one row per photographer; no secondary id).
 */
export type AssistantInvoiceSetupSpecialistFocus = {
  toolPayload: Record<string, unknown>;
};

/**
 * S4 — deep search / investigation mode: explicit read-first lane; higher read-only tool budget; no extra pinned entity.
 */
export type AssistantInvestigationSpecialistFocus = {
  toolPayload: Record<string, unknown>;
};

/**
 * S5 — rule authoring / audit mode: policy lane; playbook + coverage grounding; staged candidates only.
 */
export type AssistantPlaybookAuditSpecialistFocus = {
  toolPayload: Record<string, unknown>;
};

/**
 * S6 — bulk queue triage mode: intentional multi-item Today/queue workflow; grounded snapshot only.
 */
export type AssistantBulkTriageSpecialistFocus = {
  toolPayload: Record<string, unknown>;
};

export type AssistantContext = {
  readonly clientFacingForbidden: true;
  photographerId: string;
  queryText: string;
  focusedWeddingId: string | null;
  focusedPersonId: string | null;
  /**
   * Deterministic surface area of active effective rules: topics, keys, light keyword hints
   * (for broad “what do my rules cover?” questions). See line list under **Playbook** in the prompt.
   */
  playbookCoverageSummary: AssistantPlaybookCoverageSummary;
  playbookRules: EffectivePlaybookRule[];
  rawPlaybookRules: PlaybookRuleContextRow[];
  authorizedCaseExceptions: AuthorizedCaseExceptionRow[];
  /** Operator widget: `buildAssistantContext` sets this to empty lists (digest not loaded; Slice 4 prompt). */
  crmDigest: AssistantCrmDigest;
  /**
   * Slice 1 full CRM row (people, counts, money, …). **Not** populated from `buildAssistantContext` in Slice 2+;
   * reserved for other paths. Query-time unique match still uses
   * `operatorQueryEntityResolution.queryResolvedProjectFacts`.
   */
  focusedProjectFacts: AssistantFocusedProjectFacts | null;
  /**
   * Slice 2: when `focusedWeddingId` resolves, a **minimal** `weddings` pointer for the operator prompt
   * (use `operator_lookup_project_details` for deep facts).
   */
  focusedProjectSummary: AssistantFocusedProjectSummary | null;
  /**
   * Slice 2: one-row venue + event dates for tools (e.g. weather) — **omitted** from the focused prompt summary text.
   */
  focusedProjectRowHints: AssistantFocusedProjectRowHints | null;
  /** Today / Inbox queue snapshot (Slice 3); same semantics as the operator Today feed. */
  operatorStateSummary: AssistantOperatorStateSummary;
  /**
   * Read-only studio capability / business-scope layer (`studio_business_profiles` + key `photographers.settings`).
   * Grounding for “what we offer / where we work / currency / timezone” — not playbook authority.
   */
  studioProfile: AssistantStudioProfile;
  /**
   * v1: bounded read of offer-builder **projects** (stored in `studio_offer_builder_projects`) — **not** CRM wedding packages;
   * use for *investment guide / offer document* questions. Read-only; compact Puck-derived outlines.
   */
  studioOfferBuilder: AssistantStudioOfferBuilderRead;
  /**
   * v1: read-only invoice PDF template / setup (`studio_invoice_setup`) — **not** a specific client invoice
   * or booking line item; use for *prefix, payment terms, logo-on-template, accent color* questions.
   */
  studioInvoiceSetup: AssistantStudioInvoiceSetupRead;
  /** Slice 5 — static app routes/nav/vocabulary for software-help answers (B9). */
  appCatalog: AssistantAppCatalogForContext;
  /**
   * When true, {@link formatAssistantContextForOperatorLlm} embeds the full `appCatalog` JSON block.
   * Gated by deterministic query intent (see `shouldIncludeAppCatalogInOperatorPrompt`).
   */
  includeAppCatalogInOperatorPrompt: boolean;
  /**
   * Bounded deterministic resolution of couple / location / person names in the current query against
   * a capped `weddings` + `people` index (read-only; no message or calendar fetches in this pass).
   */
  operatorQueryEntityResolution: AssistantOperatorQueryEntityResolution;
  /**
   * Deterministic, capped recent `threads` activity (last inbound/outbound timestamps) for operator
   * questions about email/thread history — gated by query intent; uses focus + entity resolution when available.
   */
  operatorThreadMessageLookup: AssistantOperatorThreadMessageLookup;
  /**
   * Bounded recent message **bodies** for one thread (optional first-pass auto-load or tool).
   * See {@link hasOperatorThreadMessageBodyLookupIntent} and **operator_lookup_thread_messages**.
   */
  operatorThreadMessageBodies: AssistantOperatorThreadMessageBodiesSnapshot;
  /**
   * Gated: UTC window inquiry arrival counts (today / yesterday / this & last ISO week) for operator
   * “how many inquiries…” questions. Not a full BI report.
   */
  operatorInquiryCountSnapshot: AssistantOperatorInquiryCountSnapshot;
  /**
   * Gated: read-only bounded `calendar_events` for schedule questions (upcoming, historical, project-scoped).
   * See `hasOperatorCalendarScheduleIntent` and `buildOperatorCalendarLookupPlan` in `buildAssistantContext`.
   */
  operatorCalendarSnapshot: AssistantOperatorCalendarSnapshot;
  /**
   * Populated for analytical / performance questions about the tenant (Slice 12).
   * Gated by `shouldLoadStudioAnalysisSnapshotForQuery` in `buildAssistantContext`.
   */
  studioAnalysisSnapshot: AssistantStudioAnalysisSnapshot | null;
  memoryHeaders: Array<{
    id: string;
    wedding_id: string | null;
    person_id: string | null;
    scope: "project" | "person" | "studio";
    type: string;
    title: string;
    summary: string;
  }>;
  selectedMemories: AgentContext["selectedMemories"];
  globalKnowledge: Array<Record<string, unknown>>;
  retrievalLog: AssistantRetrievalLog;
  /**
   * Slice 6 — prior-turn referent pointer (advisory is computed per request, never a gate on IDs).
   * `null` when the client did not send a valid carry-forward or there is nothing to show.
   */
  carryForward: OperatorAnaCarryForwardForLlm | null;
  /**
   * Slice A2 — deterministic triage v1 (hint + telemetry only). `reason` is for logs, not the LLM prompt.
   */
  operatorTriage: OperatorAnaTriage;
  /**
   * S1 — when set, Ana runs in **escalation resolver** specialist mode for this single id (explicit client entry).
   */
  escalationResolverFocus: AssistantEscalationResolverFocus | null;
  /**
   * S2 — when set, Ana runs in **offer builder specialist** mode for this single offer project (explicit client entry).
   */
  offerBuilderSpecialistFocus: AssistantOfferBuilderSpecialistFocus | null;
  /**
   * S3 — when set, Ana runs in **invoice setup / PDF template** specialist mode for this tenant (explicit client entry).
   */
  invoiceSetupSpecialistFocus: AssistantInvoiceSetupSpecialistFocus | null;
  /**
   * S4 — when set, Ana runs in **deep search / investigation** mode (read-only tools first; evidence-first replies).
   */
  investigationSpecialistFocus: AssistantInvestigationSpecialistFocus | null;
  /**
   * S5 — when set, Ana runs in **rule authoring / audit** mode (playbook coverage + review-first rule candidates only).
   */
  playbookAuditSpecialistFocus: AssistantPlaybookAuditSpecialistFocus | null;
  /**
   * S6 — when set, Ana runs in **bulk queue / Today triage** mode (bounded snapshot; at most one confirmable proposal per turn).
   */
  bulkTriageSpecialistFocus: AssistantBulkTriageSpecialistFocus | null;
};

export type BuildAssistantContextInput = {
  queryText: string;
  /** When set and owned by tenant, project-scope memories for this wedding are included. */
  focusedWeddingId?: string | null;
  /** When set and owned by tenant, person-scope memories for this person are included. */
  focusedPersonId?: string | null;
  /**
   * S1 — optional pinned escalation UUID (tenant-scoped). Loads provenance into {@link AssistantContext.escalationResolverFocus}.
   */
  escalationResolverEscalationId?: string | null;
  /**
   * S2 — optional pinned offer-builder project UUID (`studio_offer_builder_projects.id`, tenant-scoped).
   */
  offerBuilderSpecialistProjectId?: string | null;
  /**
   * S3 — invoice PDF template specialist mode. Mutually exclusive with {@link escalationResolverEscalationId} and {@link offerBuilderSpecialistProjectId}.
   */
  invoiceSetupSpecialist?: boolean;
  /**
   * S4 — investigation / deep-read mode. Mutually exclusive with S1–S3 specialist entry flags.
   */
  investigationSpecialist?: boolean;
  /**
   * S5 — rule authoring / audit mode. Mutually exclusive with S1–S4 specialist entry flags.
   */
  playbookAuditSpecialist?: boolean;
  /**
   * S6 — bulk Today / queue triage mode. Mutually exclusive with S1–S5 specialist entry flags.
   */
  bulkTriageSpecialist?: boolean;
  /**
   * Slice 6 — optional client round-trip carry-forward from the previous response (`emittedAtEpochMs` + captured focus + data).
   */
  carryForward?: unknown;
};
