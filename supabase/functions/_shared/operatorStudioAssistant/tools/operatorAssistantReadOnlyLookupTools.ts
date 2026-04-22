/**
 * Bounded, deterministic read-only tools for operator Ana second-pass retrieval.
 * No writes; tenant-scoped; reuses existing context helpers.
 */
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type {
  AssistantContext,
  AssistantFocusedProjectFacts,
} from "../../../../../src/types/assistantContext.types.ts";
import { fetchAssistantQueryEntityIndex } from "../../context/fetchAssistantQueryEntityIndex.ts";
import {
  resolveOperatorQueryEntitiesFromIndex,
  shouldRunOperatorQueryEntityResolution,
} from "../../context/resolveOperatorQueryEntitiesFromIndex.ts";
import {
  fetchAssistantThreadMessageBodies,
} from "../../context/fetchAssistantThreadMessageBodies.ts";
import { fetchAssistantThreadMessageLookup } from "../../context/fetchAssistantThreadMessageLookup.ts";
import { fetchAssistantInquiryCountSnapshot } from "../../context/fetchAssistantInquiryCountSnapshot.ts";
import {
  readAssistantProjectDetailById,
} from "../../context/fetchAssistantFocusedProjectFacts.ts";
import {
  draftProvenanceToolPayload,
  fetchAssistantDraftProvenance,
} from "../../context/fetchAssistantDraftProvenance.ts";
import {
  fetchAssistantThreadQueueExplanation,
  threadQueueExplanationToolPayload,
} from "../../context/fetchAssistantThreadQueueExplanation.ts";
import {
  escalationProvenanceToolPayload,
  fetchAssistantEscalationProvenance,
} from "../../context/fetchAssistantEscalationProvenance.ts";
import { getOfferProjectRemote } from "../../../../../src/lib/offerProjectsRemote.ts";
import {
  listOfferPuckBlockTypesForAssistant,
  MAX_OFFER_PUCK_ASSISTANT_SUMMARY_DETAILED_CHARS,
  summarizeOfferPuckDataForAssistant,
} from "../../../../../src/lib/offerPuckAssistantSummary.ts";
import { fetchInvoiceSetupRemote } from "../../../../../src/lib/invoiceSetupRemote.ts";
import { mapInvoiceTemplateToAssistantRead, MAX_INVOICE_FOOTER_TOOL_CHARS } from "../../../../../src/lib/invoiceAssistantSummary.ts";

export const MAX_LOOKUP_TOOL_QUERY_CHARS = 200;
export const MAX_LOOKUP_TOOL_CALLS_PER_TURN = 3;
/** S4 — investigation mode allows more read-only lookups in one assistant turn (still bounded). */
export const MAX_LOOKUP_TOOL_CALLS_INVESTIGATION_MODE = 5;
/** S6 — bulk queue triage mode: slightly higher cap to drill into a few threads while staying bounded. */
export const MAX_LOOKUP_TOOL_CALLS_BULK_TRIAGE_MODE = 4;

export function maxOperatorLookupToolCallsPerTurn(ctx: AssistantContext): number {
  if (ctx.investigationSpecialistFocus) return MAX_LOOKUP_TOOL_CALLS_INVESTIGATION_MODE;
  if (ctx.bulkTriageSpecialistFocus) return MAX_LOOKUP_TOOL_CALLS_BULK_TRIAGE_MODE;
  return MAX_LOOKUP_TOOL_CALLS_PER_TURN;
}

/** Static contract JSON for {@link AssistantContext.bulkTriageSpecialistFocus} (S6). */
export function bulkTriageSpecialistToolPayload(): Record<string, unknown> {
  const readOnlyLookupToolNames = OPERATOR_READ_ONLY_LOOKUP_TOOLS.map((t) => t.function.name);
  return {
    didRun: true,
    mode: "bulk_triage_queue_v1",
    groundedInContext: [
      "**Operator queue / Today** block: counts, samples, topActions — same bounded snapshot as the dashboard feed (not a hidden priority engine).",
      "**Queue highlights** when present — deterministic from that snapshot (F5), not ML scoring.",
    ],
    triageBehavior: {
      groupAndPrioritize: "Use only evidence in Context; say when counts are zero or samples are truncated.",
      perItem: "Recommend explicit next steps per row without claiming unseen message bodies.",
      proposals: "At most **one** proposedAction this turn — operator confirms individually; no silent multi-row writes.",
    },
    readOnlyLookupToolNames,
    maxLookupToolCallsThisTurn: MAX_LOOKUP_TOOL_CALLS_BULK_TRIAGE_MODE,
    defaultMaxLookupToolCalls: MAX_LOOKUP_TOOL_CALLS_PER_TURN,
    notInScope: [
      "Autonomous queue draining",
      "Batch RPCs or multi-row updates",
      "Invented urgency ranks beyond the snapshot",
    ],
  };
}

/** Static contract JSON for {@link AssistantContext.investigationSpecialistFocus} (S4). */
export function investigationSpecialistToolPayload(): Record<string, unknown> {
  const readOnlyLookupToolNames = OPERATOR_READ_ONLY_LOOKUP_TOOLS.map((t) => t.function.name);
  return {
    didRun: true,
    mode: "deep_search_investigation_v1",
    readOnlyLookupToolNames,
    maxLookupToolCallsThisTurn: MAX_LOOKUP_TOOL_CALLS_INVESTIGATION_MODE,
    defaultMaxLookupToolCalls: MAX_LOOKUP_TOOL_CALLS_PER_TURN,
    evidenceDiscipline:
      "Cite only Context blocks and read-only tool JSON from this turn. Label **facts** (quoted fields) vs **inference**. If something was not retrieved, say so — do not invent CRM rows, email bodies, counts, or escalations.",
    notInScope:
      "Not bulk triage, not web search, not hidden confidence — only tenant-scoped tools listed in readOnlyLookupToolNames.",
  };
}
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
        "Fetch a bounded list of recent threads with last inbound/outbound activity timestamps (**no** message bodies in this tool). Resolves people/projects from the query using the same index as first pass, and respects the operator’s focused wedding/person from context when relevant. Use when thread/email activity is missing from Context and the question is about who emailed, last contact, or a named inquiry/thread. For **what the email says**, follow with **operator_lookup_thread_messages** using a **threadId** from the result.",
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
      name: "operator_lookup_thread_messages",
      description:
        "Read-only: load **bounded recent message bodies** for **one** thread (**threads.id** UUID). Returns up to **8** most recent messages (chronological in the payload), each **body** excerpt capped at **900** characters — tenant-scoped, not guaranteed full thread history. Use when the operator asks what an email/thread **says** / **what they want** and excerpts are **not** already in the Context block. **threadId** must come from **Recent thread & email activity** or **operator_lookup_threads** — never guess.",
      parameters: {
        type: "object",
        properties: {
          threadId: {
            type: "string",
            description: "Required. The threads.id UUID (this tenant).",
          },
        },
        required: ["threadId"],
        additionalProperties: false,
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
  {
    type: "function" as const,
    function: {
      name: "operator_lookup_draft",
      description:
        "Read-only **draft inspection** for one `drafts.id` UUID. Returns **grounded** row fields: **status**, **decision_mode**, **source_action_key**, **created_at**, thread **title** / **wedding_id** / **kind**, a **body** text preview, and **instruction_history** (JSON, may be truncated) — the stored orchestrator / persona trace when present. **Does not** explain hidden model reasoning. Use when the operator asks *why* a draft exists, *what* triggered it, or *what* it is based on and you have a **draft id** (from **Operator queue** / Today draft samples, Context, or pasted).",
      parameters: {
        type: "object",
        properties: {
          draftId: {
            type: "string",
            description: "Required. The `drafts.id` UUID (this tenant).",
          },
        },
        required: ["draftId"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "operator_lookup_thread_queue",
      description:
        "Read-only **queue / Review explanation** for **one** thread (**threads.id** UUID). Returns grounded **threads** flags (needs_human, automation_mode, v3_operator_automation_hold, etc.), **derivedInboxBucket** (same metadata rules as Today), **openEscalation_requests** rows, **pending_approval drafts** on this thread, optional **v3_thread_workflow_state.workflow** JSON (bounded), and **zenTabHints** aligned with Zen / Today tab mapping. Use when the operator asks *why this is in review*, *what is blocking this thread*, *why it is waiting for me*, or *why it landed in operator review* and you have a **thread id** (from Recent thread activity, **operator_lookup_threads**, Today samples, or pasted).",
      parameters: {
        type: "object",
        properties: {
          threadId: {
            type: "string",
            description: "Required. The threads.id UUID (this tenant).",
          },
        },
        required: ["threadId"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "operator_lookup_escalation",
      description:
        "Read-only **escalation inspection** for one **escalation_requests.id** UUID. Returns **grounded** row fields: **status**, **action_key**, **reason_code**, **question_body** (the recorded blocker/decision text, may be clipped), **decision_justification** JSON (may be truncated), **operator_delivery**, **learning_outcome**, resolution fields when present, **thread** / **wedding** envelope snippets, and optional **playbook_rules** row (topic, **action_key**, **decision_mode**, instruction preview) when **playbook_rule_id** is set. **Does not** reveal hidden model reasoning. Use when the operator asks **why** something **escalated**, **what** this escalation is **asking**, or **what** **triggered** it and you have an **escalation id** (from **Operator queue** / Today escalation **samples**, **operator_lookup_thread_queue** open escalations, Context, or pasted).",
      parameters: {
        type: "object",
        properties: {
          escalationId: {
            type: "string",
            description: "Required. The escalation_requests.id UUID (this tenant).",
          },
        },
        required: ["escalationId"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "operator_lookup_offer_builder",
      description:
        "Read-only **offer-builder project** (investment guide / Puck document) for **one** row in `studio_offer_builder_projects` by **UUID** (`id`). **Not** CRM wedding packages — use `operator_lookup_project_details` for wedding **project** economics. Returns **displayName**, **updatedAt**, a **longer compactSummary** outline (package tiers, cover title, block types), and **blockTypes** — all from stored `puck_data`. Use when the operator asks what is *in* a named offer / premium package / destination offer and the **Offer projects (grounded)** list in Context is not enough; **offerProjectId** must match a row from that list (or a pasted id).",
      parameters: {
        type: "object",
        properties: {
          offerProjectId: {
            type: "string",
            description: "Required. The `studio_offer_builder_projects.id` UUID (this tenant).",
          },
        },
        required: ["offerProjectId"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "operator_lookup_invoice_setup",
      description:
        "Read-only **invoice PDF template** for this tenant (`studio_invoice_setup` — **one** row): **legalName**, **invoicePrefix**, **paymentTerms**, **accentColor**, **footerNote** (longer cap than Context when clipped), **updatedAt**, and **logo** summary (**hasLogo**, MIME, data-URL length) — **never** raw image data. **Not** CRM project invoice amounts or line items — use **operator_lookup_project_details** for booking money. Use when the operator needs a **longer** footer or the same fields repeated for trust; normally **Invoice setup (grounded)** in Context is enough. Pass an **empty** JSON object **{}**.",
      parameters: {
        type: "object",
        properties: {},
        additionalProperties: false,
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
    note: "No message bodies in this tool; use operator_lookup_thread_messages with a threadId for bounded body excerpts.",
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

  if (name === "operator_lookup_thread_messages") {
    const extraKeys = Object.keys(args).filter(
      (k) => k !== "threadId" && args[k] !== undefined && args[k] !== null,
    );
    if (extraKeys.length > 0) {
      return JSON.stringify({
        tool: name,
        error: "invalid_arguments",
        code: "extra_properties",
        onlyAllowed: ["threadId"],
        disallowed: extraKeys,
      });
    }
    const snap = await fetchAssistantThreadMessageBodies(supabase, photographerId, args.threadId);
    return JSON.stringify({
      tool: name,
      result: {
        didRun: snap.didRun,
        selectionNote: snap.selectionNote,
        threadId: snap.threadId,
        threadTitle: snap.threadTitle,
        messageCount: snap.messages.length,
        truncatedOverall: snap.truncatedOverall,
        semanticsNote:
          "Read-only tenant messages for one thread; newest-first fetch reversed to chronological; not full history beyond the cap.",
        messages: snap.messages,
      },
    });
  }

  if (name === "operator_lookup_draft") {
    const extraKeys = Object.keys(args).filter(
      (k) => k !== "draftId" && args[k] !== undefined && args[k] !== null,
    );
    if (extraKeys.length > 0) {
      return JSON.stringify({
        tool: name,
        error: "invalid_arguments",
        code: "extra_properties",
        onlyAllowed: ["draftId"],
        disallowed: extraKeys,
      });
    }
    const snap = await fetchAssistantDraftProvenance(supabase, photographerId, args.draftId);
    return JSON.stringify({ tool: name, result: draftProvenanceToolPayload(snap) });
  }

  if (name === "operator_lookup_thread_queue") {
    const extraKeys = Object.keys(args).filter(
      (k) => k !== "threadId" && args[k] !== undefined && args[k] !== null,
    );
    if (extraKeys.length > 0) {
      return JSON.stringify({
        tool: name,
        error: "invalid_arguments",
        code: "extra_properties",
        onlyAllowed: ["threadId"],
        disallowed: extraKeys,
      });
    }
    const snap = await fetchAssistantThreadQueueExplanation(supabase, photographerId, args.threadId);
    return JSON.stringify({ tool: name, result: threadQueueExplanationToolPayload(snap) });
  }

  if (name === "operator_lookup_escalation") {
    const extraKeys = Object.keys(args).filter(
      (k) => k !== "escalationId" && args[k] !== undefined && args[k] !== null,
    );
    if (extraKeys.length > 0) {
      return JSON.stringify({
        tool: name,
        error: "invalid_arguments",
        code: "extra_properties",
        onlyAllowed: ["escalationId"],
        disallowed: extraKeys,
      });
    }
    const snap = await fetchAssistantEscalationProvenance(supabase, photographerId, args.escalationId);
    return JSON.stringify({ tool: name, result: escalationProvenanceToolPayload(snap) });
  }

  if (name === "operator_lookup_offer_builder") {
    const extraKeys = Object.keys(args).filter(
      (k) => k !== "offerProjectId" && args[k] !== undefined && args[k] !== null,
    );
    if (extraKeys.length > 0) {
      return JSON.stringify({
        tool: name,
        error: "invalid_arguments",
        code: "extra_properties",
        onlyAllowed: ["offerProjectId"],
        disallowed: extraKeys,
      });
    }
    const id = typeof args.offerProjectId === "string" ? args.offerProjectId.trim() : "";
    if (!id) {
      return JSON.stringify({ tool: name, error: "validation_error", code: "missing_offer_project_id" });
    }
    const rec = await getOfferProjectRemote(supabase, photographerId, id);
    if (!rec) {
      return JSON.stringify({
        tool: name,
        error: "not_found",
        message: "No offer-builder project with this id for this tenant.",
      });
    }
    return JSON.stringify({
      tool: name,
      result: {
        offerProjectId: rec.id,
        displayName: rec.name,
        updatedAt: rec.updatedAt,
        blockTypes: listOfferPuckBlockTypesForAssistant(rec.data as unknown),
        detailedSummary: summarizeOfferPuckDataForAssistant(rec.data as unknown, MAX_OFFER_PUCK_ASSISTANT_SUMMARY_DETAILED_CHARS),
        note:
          "Factual: derived from stored Puck JSON only. Not a client-facing PDF; headings/package lines may be edited in Offer builder (Workspace).",
      },
    });
  }

  if (name === "operator_lookup_invoice_setup") {
    const extraKeys = Object.keys(args).filter((k) => args[k] !== undefined && args[k] !== null);
    if (extraKeys.length > 0) {
      return JSON.stringify({
        tool: name,
        error: "invalid_arguments",
        code: "extra_properties",
        onlyAllowed: [],
        disallowed: extraKeys,
        note: "This tool takes no properties; pass {}.",
      });
    }
    const row = await fetchInvoiceSetupRemote(supabase, photographerId);
    if (!row) {
      return JSON.stringify({
        tool: name,
        result: {
          hasRow: false,
          note: "No studio_invoice_setup row for this tenant.",
        },
      });
    }
    const mapped = mapInvoiceTemplateToAssistantRead(row.template, row.updatedAt, MAX_INVOICE_FOOTER_TOOL_CHARS);
    return JSON.stringify({ tool: name, result: mapped });
  }

  return JSON.stringify({ error: "unknown_tool", name });
}
