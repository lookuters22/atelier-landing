import type { AgentContext } from "./agent.types.ts";
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
  samples: {
    pendingDrafts: Array<{ id: string; title: string; subtitle: string }>;
    openEscalations: Array<{ id: string; title: string; actionKey: string }>;
    openTasks: Array<{ id: string; title: string; dueDate: string; subtitle: string | null }>;
    topActions: Array<{ id: string; title: string; typeLabel: string }>;
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
    | "operator_inquiry_count_snapshot"
    | "operator_calendar_snapshot"
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
  /** Operator Ana: second-pass read-only tool invocations (same HTTP response as `retrievalLog`). */
  readOnlyLookupTools?: Array<{ name: string; ok: boolean; detail?: string }>;
  /** Always present — compact playbook index for “coverage” questions. */
  playbookCoverage?: {
    totalActiveRules: number;
    uniqueTopicCount: number;
    uniqueActionKeyCount: number;
  };
};

/**
 * Context for **photographer-facing assistant** queries only.
 *
 * **Invariant:** `clientFacingForbidden` is always `true` at the type level so this object must not be
 * routed into client-facing writers (V3 memory plan §3 Mode B).
 */
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
};

export type BuildAssistantContextInput = {
  queryText: string;
  /** When set and owned by tenant, project-scope memories for this wedding are included. */
  focusedWeddingId?: string | null;
  /** When set and owned by tenant, person-scope memories for this person are included. */
  focusedPersonId?: string | null;
  /**
   * Slice 6 — optional client round-trip carry-forward from the previous response (`emittedAtEpochMs` + captured focus + data).
   */
  carryForward?: unknown;
};
