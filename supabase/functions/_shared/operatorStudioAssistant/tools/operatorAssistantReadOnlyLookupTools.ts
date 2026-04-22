/**
 * Bounded, deterministic read-only tools for operator Ana second-pass retrieval.
 * No writes; tenant-scoped; reuses existing context helpers.
 */
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { AssistantContext, AssistantFocusedProjectFacts } from "../../../../../src/types/assistantContext.types.ts";
import { fetchAssistantQueryEntityIndex } from "../../context/fetchAssistantQueryEntityIndex.ts";
import {
  resolveOperatorQueryEntitiesFromIndex,
  shouldRunOperatorQueryEntityResolution,
} from "../../context/resolveOperatorQueryEntitiesFromIndex.ts";
import { fetchAssistantThreadMessageLookup } from "../../context/fetchAssistantThreadMessageLookup.ts";
import { fetchAssistantInquiryCountSnapshot } from "../../context/fetchAssistantInquiryCountSnapshot.ts";
import {
  readAssistantProjectDetailById,
} from "../../context/fetchAssistantFocusedProjectFacts.ts";

export const MAX_LOOKUP_TOOL_QUERY_CHARS = 200;
export const MAX_LOOKUP_TOOL_CALLS_PER_TURN = 3;
/** Max characters of `storyNotes` in tool JSON (row may be longer; slice contract: ~400 char excerpt). */
export const MAX_PROJECT_DETAIL_STORY_NOTES_CHARS = 400;

export type OperatorLookupProjectDetailsPayload = {
  projectId: string;
  projectType: string;
  stage: string;
  displayTitle: string;
  weddingDate: string | null;
  location: string;
  eventStartDate: string | null;
  eventEndDate: string | null;
  packageName: string | null;
  packageInclusions: string[];
  contractValue: number | null;
  balanceDue: number | null;
  storyNotes: string | null;
  people: AssistantFocusedProjectFacts["people"];
  contactPoints: AssistantFocusedProjectFacts["contactPoints"];
  openTaskCount: number;
  openEscalationCount: number;
  pendingApprovalDraftCount: number;
  note: string;
};

function clipStory(notes: string | null, max: number): string | null {
  if (notes == null || notes === "") return null;
  return notes.length <= max ? notes : notes.slice(0, max);
}

/** Maps CRM facts to the operator project-details tool contract (all project_type values; not wedding-only). */
export function projectDetailsPayloadFromFocusedFacts(
  f: AssistantFocusedProjectFacts,
): OperatorLookupProjectDetailsPayload {
  return {
    projectId: f.weddingId,
    projectType: f.project_type,
    stage: f.stage,
    displayTitle: f.couple_names,
    weddingDate: f.wedding_date,
    location: f.location,
    eventStartDate: f.event_start_date,
    eventEndDate: f.event_end_date,
    packageName: f.package_name,
    packageInclusions: f.package_inclusions,
    contractValue: f.contract_value,
    balanceDue: f.balance_due,
    storyNotes: clipStory(f.story_notes, MAX_PROJECT_DETAIL_STORY_NOTES_CHARS),
    people: f.people,
    contactPoints: f.contactPoints,
    openTaskCount: f.counts.openTasks,
    openEscalationCount: f.counts.openEscalations,
    pendingApprovalDraftCount: f.counts.pendingApprovalDrafts,
    note:
      "Tenant-scoped `weddings` row + related people, contacts, and counts (read-only). Applies to wedding, commercial, video, and other `project_type` values — use `projectType` and `displayTitle` as-is, not wedding-default wording.",
  };
}

/** OpenAI Chat Completions `tools` schema (read-only lookups). */
export const OPERATOR_READ_ONLY_LOOKUP_TOOLS = [
  {
    type: "function" as const,
    function: {
      name: "operator_lookup_projects",
      description:
        "Resolver only: match operator text (names, couple, place, project fragment) to a bounded list of project candidates in this tenant’s recent CRM index. Use when the operator names or describes a project and you need to disambiguate. Does **not** return full financial/people details; does **not** accept a UUID. For deep facts, call `operator_lookup_project_details` after you have a project id.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Name fragment, couple, or place to match (max 200 characters).",
          },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "operator_lookup_project_details",
      description:
        "Detail fetcher only: load full read-only project facts for one CRM project **by UUID** (`weddings.id`). **Input is only `{ projectId: string }` — a single canonical UUID string.** Do **not** pass names, locations, or natural language; do **not** use this to search or resolve. If you only have a name or vague reference, call `operator_lookup_projects` first, then use the chosen `weddingId` here. Returns stage, `projectType`, display title, dates, money fields, story notes (bounded excerpt), people, contact points, and open-task / escalation / pending-draft counts in one call.",
      parameters: {
        type: "object",
        properties: {
          projectId: {
            type: "string",
            description:
              "Required. The `weddings.id` UUID for this tenant (e.g. from focused context, resolver output, or UI). No other property is allowed.",
          },
        },
        required: ["projectId"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "operator_lookup_threads",
      description:
        "Fetch a bounded list of recent threads with last inbound/outbound activity timestamps (no message bodies). Resolves people/projects from the query using the same index as first pass, and respects the operator’s focused wedding/person from context when relevant. Use when thread/email activity is missing from Context and the question is about who emailed, last contact, or a named inquiry/thread.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description:
              "Sub-query for entity resolution + thread selection (e.g. couple name, inquiry topic). Max 200 characters.",
          },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "operator_lookup_inquiry_counts",
      description:
        "Return UTC-window counts of new inquiry arrivals (today, yesterday, this week, last week) for this tenant — same snapshot semantics as first-pass when the inquiry-analytics question matched. Use only when the operator asks for lead/inquiry counts and those numbers are not already in Context.",
      parameters: {
        type: "object",
        properties: {},
      },
    },
  },
];

function normalizeToolQuery(raw: unknown): string {
  const s = String(raw ?? "")
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .trim();
  return s.length > MAX_LOOKUP_TOOL_QUERY_CHARS ? s.slice(0, MAX_LOOKUP_TOOL_QUERY_CHARS) : s;
}

function safeParseArgs(argsJson: string): Record<string, unknown> {
  try {
    const v = JSON.parse(argsJson) as unknown;
    return v != null && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function slimProjectLookupPayload(res: ReturnType<typeof resolveOperatorQueryEntitiesFromIndex>) {
  return {
    weddingSignal: res.weddingSignal,
    uniqueWeddingId: res.uniqueWeddingId,
    weddingCandidates: res.weddingCandidates.map((c) => ({
      weddingId: c.weddingId,
      couple_names: c.couple_names,
      stage: c.stage,
      wedding_date: c.wedding_date,
      location: c.location,
      project_type: c.project_type,
    })),
    personMatches: res.personMatches,
    note:
      "Tenant-bounded index only; not an all-time CRM search. **Slice 5:** every `weddingCandidates` row includes **project_type** — use it for vocabulary; do not treat rows as wedding by default.",
  };
}

function slimThreadLookupPayload(
  lookup: Awaited<ReturnType<typeof fetchAssistantThreadMessageLookup>>,
) {
  return {
    didRun: lookup.didRun,
    selectionNote: lookup.selectionNote,
    threads: lookup.threads,
    note: "No message bodies; capped thread list.",
  };
}

function slimInquiryPayload(s: Awaited<ReturnType<typeof fetchAssistantInquiryCountSnapshot>>) {
  return {
    didRun: s.didRun,
    computedAt: s.computedAt,
    truncated: s.truncated,
    timezoneNote: s.timezoneNote,
    semanticsNote: s.semanticsNote,
    windows: s.windows,
    comparison: s.comparison,
    rowCountLoaded: s.rowCountLoaded,
  };
}

/**
 * Runs one tool call; returns a short JSON string for the model (UTF-8 text).
 */
export async function executeOperatorReadOnlyLookupTool(
  supabase: SupabaseClient,
  photographerId: string,
  ctx: AssistantContext,
  name: string,
  argsJson: string,
): Promise<string> {
  const args = safeParseArgs(argsJson);

  if (name === "operator_lookup_inquiry_counts") {
    const snap = await fetchAssistantInquiryCountSnapshot(supabase, photographerId, {});
    return JSON.stringify({ tool: name, result: slimInquiryPayload(snap) });
  }

  if (name === "operator_lookup_projects") {
    const query = normalizeToolQuery(args.query);
    if (!shouldRunOperatorQueryEntityResolution(query)) {
      return JSON.stringify({
        tool: name,
        error: "query_too_short",
        minChars: 4,
        note: "Provide a longer name or place fragment.",
      });
    }
    const index = await fetchAssistantQueryEntityIndex(supabase, photographerId);
    const res = resolveOperatorQueryEntitiesFromIndex(query, index.weddings, index.people);
    return JSON.stringify({ tool: name, query, result: slimProjectLookupPayload(res) });
  }

  if (name === "operator_lookup_project_details") {
    const extraKeys = Object.keys(args).filter(
      (k) => k !== "projectId" && args[k] !== undefined && args[k] !== null,
    );
    if (extraKeys.length > 0) {
      return JSON.stringify({
        tool: name,
        error: "invalid_arguments",
        code: "extra_properties",
        onlyAllowed: ["projectId"],
        disallowed: extraKeys,
        note: "This tool accepts only `projectId` (UUID). Use `operator_lookup_projects` to resolve names.",
      });
    }
    const read = await readAssistantProjectDetailById(supabase, photographerId, args.projectId);
    if (!read.ok) {
      if (read.code === "invalid_project_id") {
        return JSON.stringify({
          tool: name,
          error: "validation_error",
          code: read.code,
          message: read.message ?? "Invalid projectId.",
        });
      }
      if (read.code === "not_found") {
        return JSON.stringify({
          tool: name,
          error: "not_found",
          code: "not_found",
          message: "No project with this id in this studio, or id is not visible to this tenant.",
        });
      }
      return JSON.stringify({
        tool: name,
        error: "database_error",
        code: read.code,
        message: read.message ?? "Lookup failed.",
      });
    }
    return JSON.stringify({
      tool: name,
      result: projectDetailsPayloadFromFocusedFacts(read.facts),
    });
  }

  if (name === "operator_lookup_threads") {
    const query = normalizeToolQuery(args.query);
    if (query.length < 3) {
      return JSON.stringify({
        tool: name,
        error: "query_too_short",
        note: "Provide at least 3 characters for thread lookup.",
      });
    }
    const index = await fetchAssistantQueryEntityIndex(supabase, photographerId);
    const resCore = resolveOperatorQueryEntitiesFromIndex(query, index.weddings, index.people);
    const operatorQueryEntityResolution = {
      didRun: true,
      weddingSignal: resCore.weddingSignal,
      uniqueWeddingId: resCore.uniqueWeddingId,
      weddingCandidates: resCore.weddingCandidates,
      personMatches: resCore.personMatches,
      queryResolvedProjectFacts: null as null,
    };
    const lookup = await fetchAssistantThreadMessageLookup(supabase, photographerId, {
      queryText: query,
      weddingIdEffective: ctx.focusedWeddingId,
      personIdEffective: ctx.focusedPersonId,
      operatorQueryEntityResolution,
      force: true,
    });
    return JSON.stringify({ tool: name, query, result: slimThreadLookupPayload(lookup) });
  }

  return JSON.stringify({ error: "unknown_tool", name });
}
