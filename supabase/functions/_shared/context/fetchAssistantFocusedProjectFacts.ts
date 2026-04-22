import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type {
  AssistantFocusedProjectFacts,
  AssistantFocusedProjectRowHints,
  AssistantFocusedProjectSummary,
} from "../../../../src/types/assistantContext.types.ts";

const MAX_WEDDING_PEOPLE = 12;
const MAX_CONTACT_POINTS = 12;

/** Matches Postgres `uuid` / RFC 4122 string form; used for `operator_lookup_project_details` gating. */
const PROJECT_ID_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type ReadAssistantProjectDetailResult =
  | { ok: true; facts: AssistantFocusedProjectFacts }
  | {
      ok: false;
      code: "invalid_project_id" | "not_found" | "database_error";
      message?: string;
    };

export function isValidAssistantProjectIdUuid(s: string): boolean {
  return PROJECT_ID_UUID_RE.test(String(s ?? "").trim());
}

/**
 * Read-only, tenant-scoped project detail by `weddings.id` — same row shape as
 * `fetchAssistantFocusedProjectFacts` but with validation and no throw for not-found
 * (operator tools must return JSON errors, not throw across tool boundaries).
 */
export async function readAssistantProjectDetailById(
  supabase: SupabaseClient,
  photographerId: string,
  rawProjectId: unknown,
): Promise<ReadAssistantProjectDetailResult> {
  if (rawProjectId == null) {
    return { ok: false, code: "invalid_project_id", message: "projectId is required." };
  }
  if (typeof rawProjectId !== "string" && typeof rawProjectId !== "number") {
    return { ok: false, code: "invalid_project_id", message: "projectId must be a string UUID only." };
  }
  const id = String(rawProjectId).trim();
  if (!isValidAssistantProjectIdUuid(id)) {
    return {
      ok: false,
      code: "invalid_project_id",
      message: "projectId must be a canonical UUID (weddings.id) — not a name, place, or free-text query.",
    };
  }
  try {
    const facts = await fetchAssistantFocusedProjectFacts(supabase, photographerId, id);
    return { ok: true, facts };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (
      /\bPGRST116\b/i.test(msg) ||
      /\b0 rows\b/i.test(msg) ||
      /not found/i.test(msg) ||
      /JSON object requested.*rows returned/i.test(msg)
    ) {
      return { ok: false, code: "not_found" };
    }
    const clipped = msg.length > 320 ? msg.slice(0, 320) : msg;
    return { ok: false, code: "database_error", message: clipped };
  }
}

export type AssistantFocusedProjectSummaryAndHints = {
  summary: AssistantFocusedProjectSummary;
  rowHints: AssistantFocusedProjectRowHints;
};

/**
 * Single `weddings` read for operator Slice 2 — summary pointer + non-prompt row hints (venue/dates for tools).
 * Does not load people, tasks, or money (use `readAssistantProjectDetailById` / `fetchAssistantFocusedProjectFacts` for that).
 */
export async function fetchAssistantFocusedProjectSummaryRow(
  supabase: SupabaseClient,
  photographerId: string,
  weddingId: string,
): Promise<AssistantFocusedProjectSummaryAndHints | null> {
  const { data, error } = await supabase
    .from("weddings")
    .select("id, couple_names, stage, project_type, location, wedding_date, event_start_date, event_end_date")
    .eq("photographer_id", photographerId)
    .eq("id", weddingId)
    .single();

  if (error || data == null) {
    return null;
  }
  const w = data as Record<string, unknown>;
  return {
    summary: {
      projectId: String(w.id),
      projectType: String(w.project_type ?? ""),
      stage: String(w.stage ?? ""),
      displayTitle: String(w.couple_names ?? ""),
    },
    rowHints: {
      location: String(w.location ?? ""),
      wedding_date: w.wedding_date != null ? String(w.wedding_date) : null,
      event_start_date: w.event_start_date != null ? String(w.event_start_date) : null,
      event_end_date: w.event_end_date != null ? String(w.event_end_date) : null,
    },
  };
}

function numOrNull(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Load structured CRM facts for the focused wedding (operator assistant). Tenant-scoped, read-only. */
export async function fetchAssistantFocusedProjectFacts(
  supabase: SupabaseClient,
  photographerId: string,
  weddingId: string,
): Promise<AssistantFocusedProjectFacts> {
  const { data: wrow, error: werr } = await supabase
    .from("weddings")
    .select(
      "id, couple_names, stage, project_type, wedding_date, event_start_date, event_end_date, location, package_name, contract_value, balance_due, story_notes, package_inclusions",
    )
    .eq("photographer_id", photographerId)
    .eq("id", weddingId)
    .single();

  if (werr) {
    throw new Error(`fetchAssistantFocusedProjectFacts: wedding row: ${werr.message}`);
  }
  if (!wrow) {
    throw new Error("fetchAssistantFocusedProjectFacts: wedding not found");
  }

  const w = wrow as Record<string, unknown> & { id: string; package_inclusions?: string[] };

  const { data: wpRows, error: wperr } = await supabase
    .from("wedding_people")
    .select("person_id, role_label, is_primary_contact, people ( display_name, kind )")
    .eq("photographer_id", photographerId)
    .eq("wedding_id", weddingId)
    .order("is_primary_contact", { ascending: false })
    .limit(MAX_WEDDING_PEOPLE);

  if (wperr) {
    throw new Error(`fetchAssistantFocusedProjectFacts: wedding_people: ${wperr.message}`);
  }

  const people: AssistantFocusedProjectFacts["people"] = [];
  const personIds: string[] = [];
  for (const r of wpRows ?? []) {
    const row = r as {
      person_id: string;
      role_label: string;
      is_primary_contact: boolean;
      people: { display_name: string; kind: string } | { display_name: string; kind: string }[] | null;
    };
    const p = row.people;
    const nested = Array.isArray(p) ? p[0] : p;
    people.push({
      person_id: String(row.person_id),
      role_label: String(row.role_label ?? ""),
      is_primary_contact: Boolean(row.is_primary_contact),
      display_name: nested ? String(nested.display_name ?? "") : "",
      kind: nested ? String(nested.kind ?? "") : "",
    });
    personIds.push(String(row.person_id));
  }

  const uniquePersonIds = [...new Set(personIds)];

  let contactPoints: AssistantFocusedProjectFacts["contactPoints"] = [];
  if (uniquePersonIds.length > 0) {
    const { data: cpRows, error: cperr } = await supabase
      .from("contact_points")
      .select("person_id, kind, value_raw, is_primary")
      .eq("photographer_id", photographerId)
      .in("person_id", uniquePersonIds)
      .order("is_primary", { ascending: false })
      .limit(MAX_CONTACT_POINTS);

    if (cperr) {
      throw new Error(`fetchAssistantFocusedProjectFacts: contact_points: ${cperr.message}`);
    }
    contactPoints = (cpRows ?? []).map((r) => {
      const x = r as {
        person_id: string;
        kind: string;
        value_raw: string;
        is_primary: boolean;
      };
      return {
        person_id: String(x.person_id),
        kind: String(x.kind ?? ""),
        value_raw: String(x.value_raw ?? ""),
        is_primary: Boolean(x.is_primary),
      };
    });
  }

  const [tasksRes, escRes, twRes] = await Promise.all([
    supabase
      .from("tasks")
      .select("id", { count: "exact", head: true })
      .eq("photographer_id", photographerId)
      .eq("wedding_id", weddingId)
      .eq("status", "open"),
    supabase
      .from("escalation_requests")
      .select("id", { count: "exact", head: true })
      .eq("photographer_id", photographerId)
      .eq("wedding_id", weddingId)
      .eq("status", "open"),
    supabase
      .from("thread_weddings")
      .select("thread_id")
      .eq("photographer_id", photographerId)
      .eq("wedding_id", weddingId),
  ]);

  if (tasksRes.error) {
    throw new Error(`fetchAssistantFocusedProjectFacts: tasks count: ${tasksRes.error.message}`);
  }
  if (escRes.error) {
    throw new Error(`fetchAssistantFocusedProjectFacts: escalations count: ${escRes.error.message}`);
  }
  if (twRes.error) {
    throw new Error(`fetchAssistantFocusedProjectFacts: thread_weddings: ${twRes.error.message}`);
  }

  const threadIds = (twRes.data ?? []).map((r) => String((r as { thread_id: string }).thread_id));

  let pendingApprovalDrafts = 0;
  if (threadIds.length > 0) {
    const { count, error: derr } = await supabase
      .from("drafts")
      .select("id", { count: "exact", head: true })
      .eq("photographer_id", photographerId)
      .in("thread_id", threadIds)
      .eq("status", "pending_approval");
    if (derr) {
      throw new Error(`fetchAssistantFocusedProjectFacts: drafts count: ${derr.message}`);
    }
    pendingApprovalDrafts = count ?? 0;
  }

  const packageInclusions = Array.isArray(w.package_inclusions) ? w.package_inclusions.map((s) => String(s)) : [];

  return {
    weddingId: String(w.id),
    couple_names: String(w.couple_names ?? ""),
    stage: String(w.stage ?? ""),
    project_type: String(w.project_type ?? ""),
    wedding_date: w.wedding_date != null ? String(w.wedding_date) : null,
    event_start_date: w.event_start_date != null ? String(w.event_start_date) : null,
    event_end_date: w.event_end_date != null ? String(w.event_end_date) : null,
    location: String(w.location ?? ""),
    package_name: w.package_name != null ? String(w.package_name) : null,
    contract_value: numOrNull(w.contract_value),
    balance_due: numOrNull(w.balance_due),
    story_notes: w.story_notes != null ? String(w.story_notes) : null,
    package_inclusions: packageInclusions,
    people,
    contactPoints,
    counts: {
      openTasks: tasksRes.count ?? 0,
      openEscalations: escRes.count ?? 0,
      pendingApprovalDrafts,
    },
  };
}
