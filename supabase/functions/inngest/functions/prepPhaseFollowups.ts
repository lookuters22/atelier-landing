/**
 * Phase 7 Step 7B — Prep phase: questionnaire at T−60d and optional 5d reminder.
 *
 * Listens for `crm/stage.updated` when stage becomes `booked`; sleeps until 60 days before
 * `wedding_date`, then drafts / tracks questionnaire outreach via `wedding_milestones`.
 *
 * Phase 10 Step 10C (slice): after the T−60d `sleepUntil`, re-query wedding state and pause flags before drafting.
 *
 * Phase 10 cleanup: `photographer_id` on draft inserts; post–5d sleep wedding reverify before reminder draft.
 */
import type { AgentContext } from "../../../../src/types/agent.types.ts";
import { buildAgentContext } from "../../_shared/memory/buildAgentContext.ts";
import { inngest } from "../../_shared/inngest.ts";
import { draftPersonaResponse } from "../../_shared/persona/personaAgent.ts";
import { supabaseAdmin } from "../../_shared/supabase.ts";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

async function resolveThreadForWedding(
  weddingId: string,
  photographerId: string,
): Promise<string | null> {
  const { data, error } = await supabaseAdmin
    .from("threads")
    .select("id")
    .eq("wedding_id", weddingId)
    .eq("photographer_id", photographerId)
    .order("last_activity_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`resolve-thread: ${error.message}`);
  return (data?.id as string) ?? null;
}

async function setQuestionnaireSent(
  weddingId: string,
  photographerId: string,
): Promise<void> {
  const { data: existing, error: selErr } = await supabaseAdmin
    .from("wedding_milestones")
    .select("wedding_id")
    .eq("wedding_id", weddingId)
    .eq("photographer_id", photographerId)
    .maybeSingle();

  if (selErr) throw new Error(`wedding_milestones select: ${selErr.message}`);

  if (existing) {
    const { error } = await supabaseAdmin
      .from("wedding_milestones")
      .update({ questionnaire_sent: true })
      .eq("wedding_id", weddingId)
      .eq("photographer_id", photographerId);

    if (error) throw new Error(`wedding_milestones update: ${error.message}`);
    return;
  }

  const { error } = await supabaseAdmin.from("wedding_milestones").insert({
    wedding_id: weddingId,
    photographer_id: photographerId,
    questionnaire_sent: true,
  });

  if (error) throw new Error(`wedding_milestones insert: ${error.message}`);
}

export const prepPhaseFunction = inngest.createFunction(
  {
    id: "prep-phase-followups",
    name: "Milestone — prep questionnaire (T−60d + 5d reminder)",
  },
  { event: "crm/stage.updated" },
  async ({ event, step }) => {
    const { weddingId, photographerId, newStage } = event.data;

    if (newStage !== "booked") {
      return { skipped: true as const, reason: "gate_not_booked" };
    }

    const weddingRow = await step.run("fetch-wedding-date", async () => {
      const { data, error } = await supabaseAdmin
        .from("weddings")
        .select("id, wedding_date, couple_names")
        .eq("id", weddingId)
        .eq("photographer_id", photographerId)
        .maybeSingle();

      if (error) throw new Error(`weddings: ${error.message}`);
      return data;
    });

    if (!weddingRow?.wedding_date) {
      return { skipped: true as const, reason: "missing_wedding_date" };
    }

    const schedule = await step.run("compute-sleep-until-60-days-before-wedding", () => {
      const weddingDate = new Date(weddingRow.wedding_date as string);
      const t = weddingDate.getTime();
      if (Number.isNaN(t)) {
        return { shouldSleep: false as const, targetIso: "" };
      }
      const targetMs = t - 60 * MS_PER_DAY;
      const targetIso = new Date(targetMs).toISOString();
      return {
        shouldSleep: (targetMs > Date.now()) as boolean,
        targetIso,
      };
    });

    let coupleSource = weddingRow;

    if (schedule.shouldSleep && schedule.targetIso) {
      await step.sleepUntil("sleep-until-2-months-out", schedule.targetIso);

      const t60Wake = await step.run("reverify-wedding-after-t60d-sleep", async () => {
        const { data: wedding, error } = await supabaseAdmin
          .from("weddings")
          .select(
            "id, wedding_date, couple_names, stage, compassion_pause, strategic_pause, agency_cc_lock",
          )
          .eq("id", weddingId)
          .eq("photographer_id", photographerId)
          .maybeSingle();

        if (error) throw new Error(`weddings: ${error.message}`);
        if (!wedding) {
          return { proceed: false as const, reason: "wedding_missing" as const };
        }
        if (
          wedding.compassion_pause === true ||
          wedding.strategic_pause === true ||
          wedding.agency_cc_lock === true
        ) {
          return { proceed: false as const, reason: "wedding_paused" as const };
        }
        if (wedding.stage !== "booked") {
          return { proceed: false as const, reason: "stage_moved" as const };
        }
        if (!wedding.wedding_date) {
          return { proceed: false as const, reason: "missing_wedding_date" as const };
        }
        return { proceed: true as const, wedding };
      });

      if (!t60Wake.proceed) {
        return { skipped: true as const, reason: t60Wake.reason };
      }
      coupleSource = t60Wake.wedding;
    }

    await step.run("draft-questionnaire-if-needed", async () => {
      const { data: milestone, error: mErr } = await supabaseAdmin
        .from("wedding_milestones")
        .select("questionnaire_sent")
        .eq("wedding_id", weddingId)
        .eq("photographer_id", photographerId)
        .maybeSingle();

      if (mErr) throw new Error(`wedding_milestones: ${mErr.message}`);

      if (milestone?.questionnaire_sent === true) {
        return { questionnaireDrafted: false as const };
      }

      const threadId = await resolveThreadForWedding(weddingId, photographerId);
      if (!threadId) {
        return { questionnaireDrafted: false as const, reason: "no_thread_for_wedding" as const };
      }

      const agentContext: AgentContext = await buildAgentContext(
        supabaseAdmin,
        photographerId,
        weddingId,
        threadId,
        "web",
        "",
      );

      const couple = (coupleSource.couple_names as string) ?? "";
      const facts = [
        "OUTREACH TYPE: Send the pre-wedding questionnaire (prep phase).",
        couple ? `Couple: ${couple}` : "",
        "Draft a warm, professional email that shares or points them to the pre-wedding questionnaire.",
        "Keep it concise and inviting. Do not invent questionnaire URLs or platform names unless present in CRM context.",
      ]
        .filter(Boolean)
        .join("\n");

      const body = await draftPersonaResponse(agentContext, facts);

      const { error: dErr } = await supabaseAdmin.from("drafts").insert({
        thread_id: threadId,
        photographer_id: photographerId,
        status: "pending_approval",
        body,
        instruction_history: [
          {
            step: "prep_phase_questionnaire_draft",
            wedding_id: weddingId,
          },
        ],
      });

      if (dErr) throw new Error(`drafts insert: ${dErr.message}`);

      await setQuestionnaireSent(weddingId, photographerId);

      return { questionnaireDrafted: true as const };
    });

    await step.sleep("wait-5-days-for-questionnaire", "5d");

    const fiveDayWake = await step.run("reverify-wedding-after-5d-sleep", async () => {
      const { data: wedding, error } = await supabaseAdmin
        .from("weddings")
        .select(
          "id, wedding_date, couple_names, stage, compassion_pause, strategic_pause, agency_cc_lock",
        )
        .eq("id", weddingId)
        .eq("photographer_id", photographerId)
        .maybeSingle();

      if (error) throw new Error(`weddings: ${error.message}`);
      if (!wedding) {
        return { proceed: false as const, reason: "wedding_missing" as const };
      }
      if (
        wedding.compassion_pause === true ||
        wedding.strategic_pause === true ||
        wedding.agency_cc_lock === true
      ) {
        return { proceed: false as const, reason: "wedding_paused" as const };
      }
      if (wedding.stage !== "booked") {
        return { proceed: false as const, reason: "stage_moved" as const };
      }
      if (!wedding.wedding_date) {
        return { proceed: false as const, reason: "missing_wedding_date" as const };
      }
      return { proceed: true as const, wedding };
    });

    if (!fiveDayWake.proceed) {
      return { skipped: true as const, reason: fiveDayWake.reason };
    }
    coupleSource = fiveDayWake.wedding;

    await step.run("follow-up-reminder-if-needed", async () => {
      const { data: milestone, error: mErr } = await supabaseAdmin
        .from("wedding_milestones")
        .select("questionnaire_completed")
        .eq("wedding_id", weddingId)
        .eq("photographer_id", photographerId)
        .maybeSingle();

      if (mErr) throw new Error(`wedding_milestones: ${mErr.message}`);

      if (milestone?.questionnaire_completed === true) {
        return { reminderDrafted: false as const, reason: "already_completed" as const };
      }

      const threadId = await resolveThreadForWedding(weddingId, photographerId);
      if (!threadId) {
        return { reminderDrafted: false as const, reason: "no_thread_for_wedding" as const };
      }

      const agentContext: AgentContext = await buildAgentContext(
        supabaseAdmin,
        photographerId,
        weddingId,
        threadId,
        "web",
        "",
      );

      const couple = (coupleSource.couple_names as string) ?? "";
      const facts = [
        "OUTREACH TYPE: Gentle reminder to complete the pre-wedding questionnaire.",
        couple ? `Couple: ${couple}` : "",
        "Draft a polite, brief reminder if they have not yet completed the questionnaire.",
        "Do not shame or pressure. Do not invent links or deadlines.",
      ]
        .filter(Boolean)
        .join("\n");

      const body = await draftPersonaResponse(agentContext, facts);

      const { error: dErr } = await supabaseAdmin.from("drafts").insert({
        thread_id: threadId,
        photographer_id: photographerId,
        status: "pending_approval",
        body,
        instruction_history: [
          {
            step: "prep_phase_questionnaire_reminder_5d",
            wedding_id: weddingId,
          },
        ],
      });

      if (dErr) throw new Error(`drafts insert: ${dErr.message}`);

      return { reminderDrafted: true as const };
    });

    return { ok: true as const };
  },
);
