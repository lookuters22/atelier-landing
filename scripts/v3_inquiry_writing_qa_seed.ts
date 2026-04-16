/**
 * QA harness: realistic **inquiry** threads (client-visible) for hosted Inngest writing inspection.
 * All rows tagged in `story_notes` / thread title so they are easy to find and safe to delete later.
 *
 * Does **not** insert `memories` (keeps seed minimal); CRM context comes from `weddings` only.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export type InquiryWritingQaScenarioId =
  | "inquiry_warm_onboarding"
  | "inquiry_date_location_clarify"
  | "inquiry_availability_timeline"
  | "inquiry_budget_sensitive";

export type InquiryWritingQaSeedResult = {
  weddingId: string;
  threadId: string;
  personIds: string[];
  correlation: string;
  rawMessage: string;
  scenarioLabel: string;
};

const QA_MARKER = "V3 QA inquiry-writing hosted — safe to delete after review";

/**
 * `playbook_rules.source_type` for idempotent minimum-investment rows seeded for hosted inquiry-writing QA.
 * Replaced on each `ensureInquiryWritingQaPlaybookMinimums` run — not a second policy system, same table as production.
 */
export const V3_INQUIRY_WRITING_QA_PLAYBOOK_SOURCE = "v3_qa_inquiry_writing_budget_minimum";

/** Instruction body for {@link ensureInquiryWritingQaPlaybookMinimums} — matches `planBudgetStatementInjection` builder expectations. */
export const V3_INQUIRY_WRITING_QA_MINIMUM_INSTRUCTION =
  "QA fixture (hosted inquiry-writing): Minimum starting investment is $10,000 for local weddings and $15,000 for destination weddings.";

/**
 * Ensures the QA tenant has active playbook text that satisfies `planBudgetStatementInjection` / `buildApprovedBudgetParagraphFromPlaybook`.
 * Idempotent: deletes prior rows with {@link V3_INQUIRY_WRITING_QA_PLAYBOOK_SOURCE} for this photographer, then inserts one global rule.
 */
export async function ensureInquiryWritingQaPlaybookMinimums(
  supabase: SupabaseClient,
  photographerId: string,
): Promise<void> {
  const { error: delErr } = await supabase
    .from("playbook_rules")
    .delete()
    .eq("photographer_id", photographerId)
    .eq("source_type", V3_INQUIRY_WRITING_QA_PLAYBOOK_SOURCE);
  if (delErr) throw new Error(`playbook_rules delete (QA fixture): ${delErr.message}`);

  const { error: insErr } = await supabase.from("playbook_rules").insert({
    photographer_id: photographerId,
    scope: "global",
    channel: null,
    action_key: "send_message",
    topic: "qa_minimum_investment_fixture",
    decision_mode: "draft_only",
    instruction: V3_INQUIRY_WRITING_QA_MINIMUM_INSTRUCTION,
    source_type: V3_INQUIRY_WRITING_QA_PLAYBOOK_SOURCE,
    confidence_label: "explicit",
    is_active: true,
  });
  if (insErr) throw new Error(`playbook_rules insert (QA fixture): ${insErr.message}`);
}

async function createPerson(supabase: SupabaseClient, photographerId: string, displayName: string): Promise<string> {
  const { data, error } = await supabase
    .from("people")
    .insert({
      photographer_id: photographerId,
      kind: "individual",
      display_name: displayName,
      canonical_name: displayName.toLowerCase().replace(/\s+/g, "_"),
    })
    .select("id")
    .single();
  if (error || !data?.id) throw new Error("people insert: " + (error?.message ?? ""));
  return data.id as string;
}

/** Client-visible inquiry: single bride recipient (direct couple email thread). */
export async function seedInquiryWritingQaScenario(
  supabase: SupabaseClient,
  photographerId: string,
  scenarioId: InquiryWritingQaScenarioId,
  runId: string,
): Promise<InquiryWritingQaSeedResult> {
  const correlation = `qa-inquiry-${scenarioId}-${runId}`;

  const scenarios: Record<
    InquiryWritingQaScenarioId,
    {
      coupleNames: string;
      location: string;
      weddingDateIso: string;
      threadSummary: string;
      rawMessage: string;
      scenarioLabel: string;
    }
  > = {
    inquiry_warm_onboarding: {
      coupleNames: "Sam & Taylor",
      location: "Napa, CA",
      weddingDateIso: new Date(Date.UTC(2026, 8, 20, 12, 0, 0)).toISOString(),
      threadSummary:
        "QA: warm lead inquiry — couple found the studio online and asked about next steps and a consultation.",
      rawMessage: `Hi there — we're getting married in fall 2026 and love your portfolio. Could we set up a short call to talk through coverage and what working with you looks like? [${correlation}]`,
      scenarioLabel: "Fresh warm inquiry / onboarding",
    },
    inquiry_date_location_clarify: {
      coupleNames: "Morgan & Riley",
      location: "Charleston, SC",
      weddingDateIso: new Date(Date.UTC(2026, 5, 15, 16, 0, 0)).toISOString(),
      threadSummary:
        "QA: couple following up — need to align ceremony date vs venue contract (June 15 vs June 16).",
      rawMessage: `Quick question — we listed June 15 on your form but our venue contract says June 16 for the ceremony start. Which date do you have on file for us, and should we update anything? [${correlation}]`,
      scenarioLabel: "Date / location clarification inquiry",
    },
    inquiry_availability_timeline: {
      coupleNames: "River & Avery",
      location: "Austin, TX",
      weddingDateIso: new Date(Date.UTC(2026, 8, 12, 17, 0, 0)).toISOString(),
      threadSummary: "QA: couple checking photographer availability for a Saturday in September and booking timeline.",
      rawMessage: `Are you available for Saturday, September 12, 2026? We're trying to confirm core vendors in the next two weeks—what would next steps look like if you're open? [${correlation}]`,
      scenarioLabel: "Availability / timeline inquiry",
    },
    inquiry_budget_sensitive: {
      coupleNames: "Casey & Jordan",
      location: "Denver, CO",
      weddingDateIso: new Date(Date.UTC(2026, 10, 7, 15, 0, 0)).toISOString(),
      threadSummary:
        "QA: budget-conscious question — couple asking whether their rough range is realistic without naming studio pricing.",
      rawMessage: `We're trying to keep photography around $8k–$10k if we can — is that generally in the ballpark for what you offer, or should we expect something different? Totally fine either way, just planning. [${correlation}]`,
      scenarioLabel: "Budget-sensitive inquiry (elegant, no awkward leakage)",
    },
  };

  const cfg = scenarios[scenarioId];

  const { data: w, error: wErr } = await supabase
    .from("weddings")
    .insert({
      photographer_id: photographerId,
      couple_names: cfg.coupleNames,
      location: cfg.location,
      wedding_date: cfg.weddingDateIso,
      stage: "inquiry",
      story_notes: `${QA_MARKER} | ${scenarioId} | ${runId}`,
    })
    .select("id")
    .single();
  if (wErr || !w?.id) throw new Error("weddings insert: " + (wErr?.message ?? ""));

  const weddingId = w.id as string;

  const pClient = await createPerson(supabase, photographerId, `Inquiry client ${scenarioId} ${runId}`);

  const { error: wpErr } = await supabase.from("wedding_people").insert({
    photographer_id: photographerId,
    wedding_id: weddingId,
    person_id: pClient,
    role_label: "Bride",
    is_payer: false,
  });
  if (wpErr) throw new Error("wedding_people insert: " + wpErr.message);

  const { data: th, error: thErr } = await supabase
    .from("threads")
    .insert({
      wedding_id: weddingId,
      photographer_id: photographerId,
      title: `QA inquiry writing ${scenarioId} ${runId}`,
      kind: "group",
    })
    .select("id")
    .single();
  if (thErr || !th?.id) throw new Error("threads insert: " + (thErr?.message ?? ""));
  const threadId = th.id as string;

  await supabase.from("thread_weddings").insert({
    photographer_id: photographerId,
    thread_id: threadId,
    wedding_id: weddingId,
    relation: "primary",
  });

  await supabase.from("thread_participants").insert({
    photographer_id: photographerId,
    thread_id: threadId,
    person_id: pClient,
    visibility_role: "bride",
    is_sender: false,
    is_recipient: true,
    is_cc: false,
  });

  const { error: sumErr } = await supabase.from("thread_summaries").insert({
    thread_id: threadId,
    photographer_id: photographerId,
    summary: cfg.threadSummary,
  });
  if (sumErr) throw new Error("thread_summaries insert: " + sumErr.message);

  return {
    weddingId,
    threadId,
    personIds: [pClient],
    correlation,
    rawMessage: cfg.rawMessage,
    scenarioLabel: cfg.scenarioLabel,
  };
}

/** Best-effort cleanup after manual review (no memories row in this harness). */
export async function cleanupInquiryWritingQaLoose(
  supabase: SupabaseClient,
  weddingId: string,
  threadId: string,
  personIds: string[],
): Promise<void> {
  await supabase.from("drafts").delete().eq("thread_id", threadId);
  await supabase.from("escalation_requests").delete().eq("thread_id", threadId);
  await supabase.from("thread_summaries").delete().eq("thread_id", threadId);
  await supabase.from("thread_participants").delete().eq("thread_id", threadId);
  await supabase.from("thread_weddings").delete().eq("thread_id", threadId);
  await supabase.from("threads").delete().eq("id", threadId);
  await supabase.from("wedding_people").delete().eq("wedding_id", weddingId);
  await supabase.from("weddings").delete().eq("id", weddingId);
  if (personIds.length > 0) {
    await supabase.from("people").delete().in("id", personIds);
  }
}
