import type { AgentContext } from "./agent.types.ts";
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
    "studio_memory" | "project_memory" | "person_memory" | "playbook" | "knowledge_base" | "crm_digest"
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
  playbookRules: EffectivePlaybookRule[];
  rawPlaybookRules: PlaybookRuleContextRow[];
  authorizedCaseExceptions: AuthorizedCaseExceptionRow[];
  crmDigest: AssistantCrmDigest;
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
};

export type BuildAssistantContextInput = {
  queryText: string;
  /** When set and owned by tenant, project-scope memories for this wedding are included. */
  focusedWeddingId?: string | null;
  /** When set and owned by tenant, person-scope memories for this person are included. */
  focusedPersonId?: string | null;
};
