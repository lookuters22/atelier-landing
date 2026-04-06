/**
 * After Slice A2 inserts the deterministic orchestrator **stub** body, optionally replace it with
 * real client-facing prose via {@link draftPersonaStructuredResponse} (JSON: `email_draft` + `committed_terms`) and
 * {@link auditDraftTerms} backstop (same writer boundary as WhatsApp `draftPersonaResponse` for non-orchestrator flows).
 *
 * - **Default:** rewrite when `ANTHROPIC_API_KEY` is set (unset `ORCHESTRATOR_CLIENT_V1_PERSONA_DRAFT_BODY` → try persona).
 * - **Force stub:** `ORCHESTRATOR_CLIENT_V1_PERSONA_DRAFT_BODY=0` or `false` (parity / QA harness).
 * - **Force persona:** `ORCHESTRATOR_CLIENT_V1_PERSONA_DRAFT_BODY=1` (requires API key).
 */
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type {
  DecisionContext,
  OrchestratorDraftAttemptResult,
  OrchestratorProposalCandidate,
  PlaybookRuleContextRow,
} from "../../../../src/types/decisionContext.types.ts";
import { parsePhotographerSettings, readPhotographerSettings } from "../../../../src/lib/photographerSettings.ts";
import { formatCompactContinuityForPersonaWriter } from "../memory/buildPersonaRawFacts.ts";
import { draftPersonaStructuredResponse, type PersonaWriterStructuredOutput } from "../persona/personaAgent.ts";
import { auditDraftTerms, buildAuthoritativeCommercialContext } from "./auditDraftCommercialTerms.ts";
import { buildUnknownPolicySignals } from "./commercialPolicySignals.ts";
import { buildOrchestratorStubDraftBody } from "./attemptOrchestratorDraft.ts";
import { recordV3OutputAuditorEscalation } from "./recordV3OutputAuditorEscalation.ts";

/** Include enough rows for policy coverage; orchestrator rationale alone has no verified numbers. */
const PLAYBOOK_RULES_MAX = 50;
const PLAYBOOK_INSTRUCTION_MAX = 400;

function playbookExcerptsFromRules(rules: PlaybookRuleContextRow[], maxLines: number): string[] {
  return rules
    .filter((r) => r.is_active !== false)
    .slice(0, maxLines)
    .map((r) => {
      const topic = r.topic ?? "rule";
      const ins = (r.instruction ?? "").trim().slice(0, PLAYBOOK_INSTRUCTION_MAX);
      return `${topic}: ${ins}`;
    });
}

/**
 * Business-profile identity only (typed `photographers.settings` contract keys).
 * **V3 policy substance** must come from `playbook_rules` + orchestrator `DecisionContext` — not from arbitrary JSON blobs.
 */
export async function fetchStudioIdentityExcerptForPersonaWriter(
  supabase: Parameters<typeof readPhotographerSettings>[0],
  photographerId: string,
): Promise<string | null> {
  let loaded: Awaited<ReturnType<typeof readPhotographerSettings>>;
  try {
    loaded = await readPhotographerSettings(supabase, photographerId);
  } catch (e) {
    console.warn(
      "[orchestrator persona] fetchStudioIdentityExcerptForPersonaWriter:",
      e instanceof Error ? e.message : e,
    );
    return null;
  }
  if (!loaded) return null;

  const contract = parsePhotographerSettings(loaded.raw);
  const lines: string[] = [];
  const studioBits = [
    contract.studio_name ? `studio_name: ${contract.studio_name}` : null,
    contract.currency ? `currency: ${contract.currency}` : null,
    contract.manager_name ? `manager_name: ${contract.manager_name}` : null,
    contract.timezone ? `timezone: ${contract.timezone}` : null,
  ].filter(Boolean);
  if (studioBits.length > 0) {
    lines.push("Studio identity (business profile / contract keys on photographers.settings):", ...studioBits.map((s) => `- ${s}`));
  }

  const text = lines.join("\n").trim();
  return text.length > 0 ? text : null;
}

/** Narrow case-memory lines for writer (headers only; matches harness `v3_verify_case_note` or first rows). */
function formatCaseMemoryHeadersForWriterFacts(dc: DecisionContext): string | null {
  const headers = dc.memoryHeaders ?? [];
  const tagged = headers.filter((h) => h.type === "v3_verify_case_note");
  const pick = tagged.length > 0 ? tagged.slice(0, 2) : headers.slice(0, 2);
  if (pick.length === 0) return null;
  const lines = pick.map((h) => `- [${h.type}] ${h.title}: ${h.summary.trim().slice(0, 220)}`);
  return ["Case memory headers (supporting context — if conflict with playbook_rules, prefer playbook):", ...lines].join("\n");
}

/** Scoped CRM row fields for writer grounding (must match `buildAgentContext` loadCrmSnapshot). */
function formatAuthoritativeCrmFromSnapshot(snap: Record<string, unknown>): string | null {
  if (!snap || Object.keys(snap).length === 0) return null;
  const rows: string[] = [];
  const pick = (key: string) => {
    const v = snap[key];
    if (v === null || v === undefined) return;
    if (typeof v === "string" && v.trim() === "") return;
    const display = typeof v === "number" ? String(v) : String(v).trim();
    rows.push(`- ${key}: ${display}`);
  };
  pick("couple_names");
  pick("wedding_date");
  pick("location");
  pick("stage");
  pick("package_name");
  pick("contract_value");
  if (rows.length === 0) return null;
  return [
    "=== Authoritative CRM (verified tenant record) ===",
    "These fields come from the scoped `weddings` row for this orchestrator turn. Use them as the canonical record for couple name, wedding date, location, stage, package_name (when set), and contract value.",
    "If client inbound wording conflicts with wedding_date or location here (e.g. wrong month or region), prefer this block for the reply—do not invent a different calendar date, city, or region.",
    ...rows,
  ].join("\n");
}

export function buildOrchestratorFactsForPersonaWriter(
  chosen: OrchestratorProposalCandidate,
  rawMessage: string,
  playbookRules: PlaybookRuleContextRow[],
  studioIdentityExcerpt: string | null,
  decisionContext: DecisionContext,
): string {
  const lines: string[] = [
    `Approved orchestrator action: ${chosen.action_family} (${chosen.action_key}).`,
    `Orchestrator rationale (generic — does not verify pricing/policy numbers): ${chosen.rationale}`,
    "",
  ];

  const crmBlock = formatAuthoritativeCrmFromSnapshot(decisionContext.crmSnapshot ?? {});
  if (crmBlock) {
    lines.push(crmBlock, "");
  }

  const continuity = formatCompactContinuityForPersonaWriter(
    decisionContext.threadSummary ?? null,
    decisionContext.recentMessages ?? [],
  );
  if (continuity) {
    lines.push(continuity, "");
  }

  lines.push("Client inbound (verbatim):", rawMessage.trim());

  if (studioIdentityExcerpt && studioIdentityExcerpt.trim().length > 0) {
    lines.push("", "=== Business profile (identity only — not policy) ===", studioIdentityExcerpt);
  }

  const mem = formatCaseMemoryHeadersForWriterFacts(decisionContext);
  if (mem) {
    lines.push("", "=== Case memory (headers) ===", mem);
  }

  const excerpts = playbookExcerptsFromRules(playbookRules, PLAYBOOK_RULES_MAX);
  if (excerpts.length > 0) {
    lines.push("", "=== Verified policy: active playbook_rules (primary source for fees, retainers, insurance stance) ===");
    for (const ex of excerpts) lines.push(`- ${ex}`);
  } else {
    lines.push("", "=== Verified policy: playbook_rules (none in snapshot) ===");
  }

  const unknownSignals = buildUnknownPolicySignals(playbookRules, rawMessage);
  if (unknownSignals.length > 0) {
    lines.push("", "=== Explicit unknown / do-not-assert signals ===");
    for (const s of unknownSignals) lines.push(`- ${s}`);
  }

  if (chosen.blockers_or_missing_facts.length > 0) {
    lines.push("", `Open notes / missing facts: ${chosen.blockers_or_missing_facts.join("; ")}`);
  }

  lines.push(
    "",
    "=== Orchestrator grounding guardrails (offerings & products) ===",
    "- **Interpretation policy for this turn (V3):** Client-suggested package names, collection tiers, deliverables, or product labels in the inbound are **not** verified studio offerings merely because the client said them.",
    "- **Verified offering context** = **Authoritative CRM** (especially `package_name` when present) + **Verified policy: playbook_rules** + explicit studio lines under Business profile (identity only) / case memory headers—not unverified client labels alone.",
    "- The deterministic orchestrator has already chosen an action (above). Do **not** treat adoption of a client product name as grounded unless it appears in that verified context; when grounding is absent, the reply must stay **non-confirming**: neutral phrasing (e.g. \"the option you're considering\"), brief clarification, or a constrained answer that does **not** restate the client-invented name as a booked or official studio SKU.",
    "- Do not upgrade routing or outcomes here—the Writer only composes prose consistent with the approved action and these rules.",
    "",
    "=== Verification rules for the reply (mandatory) ===",
    "- **Authoritative CRM** (when present) is the canonical source for wedding_date, location, couple_names, stage, package_name, and contract_value. Prefer it over conflicting casual phrasing in the client inbound.",
    "- **Packages & products:** Do not invent, confirm, or repeat client-suggested collection/package/product names as factual studio offerings unless the same name (or clear equivalent) appears in **Authoritative CRM** or **Verified policy: playbook_rules**. Client inbound alone does **not** verify an offering.",
    "- State specific numbers (percentages, retainers, payment-milestone percentages, travel miles/km, fees, insurance coverage, or legal commitments) only if they appear under **Verified policy: playbook_rules** above. Do not mirror the client's suggested percentages or mileage as facts when those figures are absent from that verified block.",
    "- **Miles/km vs percent:** Never convert a distance (e.g. \"50 miles\") into a percentage, or mix up two different numbers from the client message—each numeric claim needs matching verified playbook text.",
    "- Do not treat business profile identity as pricing policy.",
    "- If an **Explicit unknown** line appears, follow it: hedge, confirm, or defer — never invent.",
    "- If the client asks to confirm a term not covered by playbook rules, do not invent — acknowledge and confirm from the contract or team.",
    "",
    "Write a single client-facing reply email body. Do not mention internal orchestrator, drafts, or approval machinery.",
  );
  return lines.join("\n");
}

export function shouldRewriteOrchestratorDraftWithPersona(): boolean {
  const explicit = Deno.env.get("ORCHESTRATOR_CLIENT_V1_PERSONA_DRAFT_BODY")?.trim().toLowerCase();
  if (explicit === "0" || explicit === "false") return false;
  if (explicit === "1" || explicit === "true") return true;
  return Boolean(Deno.env.get("ANTHROPIC_API_KEY")?.trim());
}

export type PersonaDraftRewriteResult =
  | { applied: true; draftId: string; auditPassed: true }
  | {
      applied: true;
      draftId: string;
      auditPassed: false;
      violations: string[];
      escalationId: string | null;
    }
  | { applied: false; reason: string };

export async function maybeRewriteOrchestratorDraftWithPersona(
  supabase: SupabaseClient,
  params: {
    decisionContext: DecisionContext;
    draftAttempt: OrchestratorDraftAttemptResult;
    rawMessage: string;
    playbookRules: PlaybookRuleContextRow[];
    photographerId: string;
    replyChannel: "email" | "web";
    threadId: string | null;
  },
): Promise<PersonaDraftRewriteResult> {
  if (!params.draftAttempt.draftCreated || !params.draftAttempt.draftId || !params.draftAttempt.chosenCandidate) {
    return { applied: false, reason: "no_orchestrator_draft" };
  }
  if (!shouldRewriteOrchestratorDraftWithPersona()) {
    return { applied: false, reason: "persona_writer_disabled_or_no_api_key" };
  }

  const chosen = params.draftAttempt.chosenCandidate;
  const studioId = await fetchStudioIdentityExcerptForPersonaWriter(supabase, params.photographerId);
  const facts = buildOrchestratorFactsForPersonaWriter(
    chosen,
    params.rawMessage,
    params.playbookRules,
    studioId,
    params.decisionContext,
  );

  let structured: PersonaWriterStructuredOutput;
  try {
    structured = await draftPersonaStructuredResponse(params.decisionContext, facts);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[clientOrchestratorV1] persona draft rewrite failed:", msg);
    return { applied: false, reason: `persona_error:${msg}` };
  }

  const authoritative = buildAuthoritativeCommercialContext(params.decisionContext, params.playbookRules);
  const audit = auditDraftTerms(structured.committed_terms, authoritative, structured.email_draft);

  const { data: row, error: fetchErr } = await supabase
    .from("drafts")
    .select("instruction_history")
    .eq("id", params.draftAttempt.draftId)
    .single();

  if (fetchErr) {
    return { applied: false, reason: `fetch_instruction_history:${fetchErr.message}` };
  }

  const prior = Array.isArray(row?.instruction_history) ? (row!.instruction_history as unknown[]) : [];
  const personaStep = {
    step: "persona_writer_after_client_orchestrator_v1",
    source: "personaAgent.draftPersonaStructuredResponse",
    model: "claude-sonnet-4-5-20250929",
    committed_terms: structured.committed_terms,
  };

  if (audit.isValid === false) {
    const stub = buildOrchestratorStubDraftBody(
      chosen,
      params.rawMessage,
      params.replyChannel,
      params.playbookRules,
    );
    const body =
      stub +
      "\n\n[V3 output auditor] Persona draft rejected — stub restored. Operator escalation filed for ungrounded commercial terms.";

    let escalationId: string | null = null;
    if (params.threadId) {
      const esc = await recordV3OutputAuditorEscalation(supabase, {
        photographerId: params.photographerId,
        threadId: params.threadId,
        weddingId: params.decisionContext.weddingId ?? null,
        violations: audit.violations,
        draftId: params.draftAttempt.draftId,
      });
      escalationId = esc?.id ?? null;
    }

    const nextHistory = [
      ...prior,
      personaStep,
      {
        step: "v3_output_auditor_commercial_terms",
        passed: false,
        violations: audit.violations,
        escalation_id: escalationId,
      },
    ];

    const { error: upErr } = await supabase
      .from("drafts")
      .update({
        body,
        instruction_history: nextHistory,
      })
      .eq("id", params.draftAttempt.draftId);

    if (upErr) {
      return { applied: false, reason: `draft_update_failed:${upErr.message}` };
    }

    return {
      applied: true,
      draftId: params.draftAttempt.draftId,
      auditPassed: false,
      violations: audit.violations,
      escalationId,
    };
  }

  const nextHistory = [
    ...prior,
    personaStep,
    {
      step: "v3_output_auditor_commercial_terms",
      passed: true,
    },
  ];

  const { error: upErr } = await supabase
    .from("drafts")
    .update({
      body: structured.email_draft,
      instruction_history: nextHistory,
    })
    .eq("id", params.draftAttempt.draftId);

  if (upErr) {
    return { applied: false, reason: `draft_update_failed:${upErr.message}` };
  }

  return { applied: true, draftId: params.draftAttempt.draftId, auditPassed: true };
}
