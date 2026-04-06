/**
 * Phase 7 Step 7C — Post-wedding: gallery delivery draft + first-anniversary outreach.
 *
 * Listens for `crm/stage.updated` when stage becomes `delivered`; drafts gallery-ready email,
 * then sleeps until one year after `wedding_date` for an anniversary message.
 */
import type { AgentContext } from "../../../../src/types/agent.types.ts";
import { buildAgentContext } from "../../_shared/memory/buildAgentContext.ts";
import { inngest } from "../../_shared/inngest.ts";
import { draftPersonaResponse } from "../../_shared/persona/personaAgent.ts";
import { supabaseAdmin } from "../../_shared/supabase.ts";

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

export const postWeddingFunction = inngest.createFunction(
  {
    id: "post-wedding-flow",
    name: "Milestone — gallery delivery + anniversary",
  },
  { event: "crm/stage.updated" },
  async ({ event, step }) => {
    const { weddingId, photographerId, newStage } = event.data;

    if (newStage !== "delivered") {
      return { skipped: true as const, reason: "gate_not_delivered" };
    }

    await step.run("draft-gallery-delivery", async () => {
      const threadId = await resolveThreadForWedding(weddingId, photographerId);
      if (!threadId) {
        return { drafted: false as const, reason: "no_thread_for_wedding" as const };
      }

      const agentContext: AgentContext = await buildAgentContext(
        supabaseAdmin,
        photographerId,
        weddingId,
        threadId,
        "web",
        "",
      );

      const facts = [
        "OUTREACH TYPE: Gallery delivery — the client's wedding gallery is ready.",
        "Draft a warm, genuine email celebrating that their gallery is ready to view.",
        "Include a gentle, gracious request for a review (e.g. Google or platform they use) without sounding pushy or transactional.",
        "Do not invent gallery URLs, passwords, or platform names unless present in CRM context.",
      ].join("\n");

      const body = await draftPersonaResponse(agentContext, facts);

      const { error } = await supabaseAdmin.from("drafts").insert({
        photographer_id: photographerId,
        thread_id: threadId,
        status: "pending_approval",
        body,
        instruction_history: [
          {
            step: "post_wedding_gallery_ready",
            wedding_id: weddingId,
          },
        ],
      });

      if (error) throw new Error(`drafts insert: ${error.message}`);
      return { drafted: true as const };
    });

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
      return { ok: true as const, partial: true as const, reason: "missing_wedding_date_anniversary_skipped" };
    }

    const schedule = await step.run("compute-anniversary-sleep", () => {
      const weddingDate = new Date(weddingRow.wedding_date as string);
      if (Number.isNaN(weddingDate.getTime())) {
        return { shouldSleep: false as const, targetIso: "" };
      }
      const anniversary = new Date(weddingDate);
      anniversary.setFullYear(anniversary.getFullYear() + 1);
      const targetIso = anniversary.toISOString();
      return {
        shouldSleep: (anniversary.getTime() > Date.now()) as boolean,
        targetIso,
      };
    });

    if (schedule.shouldSleep && schedule.targetIso) {
      await step.sleepUntil("sleep-until-anniversary", schedule.targetIso);
    }

    await step.run("draft-anniversary-if-wedding-exists", async () => {
      const { data: wedding, error: wErr } = await supabaseAdmin
        .from("weddings")
        .select(
          "id, couple_names, stage, compassion_pause, strategic_pause, agency_cc_lock",
        )
        .eq("id", weddingId)
        .eq("photographer_id", photographerId)
        .maybeSingle();

      if (wErr) throw new Error(`weddings: ${wErr.message}`);
      if (!wedding) {
        return { drafted: false as const, reason: "wedding_missing" as const };
      }

      if (
        wedding.compassion_pause === true ||
        wedding.strategic_pause === true ||
        wedding.agency_cc_lock === true
      ) {
        return { drafted: false as const, reason: "wedding_paused" as const };
      }

      const stage = wedding.stage as string;
      if (stage !== "delivered" && stage !== "archived") {
        return { drafted: false as const, reason: "stage_drift" as const };
      }

      const threadId = await resolveThreadForWedding(weddingId, photographerId);
      if (!threadId) {
        return { drafted: false as const, reason: "no_thread_for_wedding" as const };
      }

      const agentContext: AgentContext = await buildAgentContext(
        supabaseAdmin,
        photographerId,
        weddingId,
        threadId,
        "web",
        "",
      );

      const couple = (wedding.couple_names as string) ?? "";
      const facts = [
        "OUTREACH TYPE: First wedding anniversary — warm congratulations.",
        couple ? `Couple: ${couple}` : "",
        "Draft a short, heartfelt 'Happy first anniversary!' message.",
        "Keep it human and celebratory. Do not sell or pitch. Do not invent past details.",
      ]
        .filter(Boolean)
        .join("\n");

      const body = await draftPersonaResponse(agentContext, facts);

      const { error: dErr } = await supabaseAdmin.from("drafts").insert({
        photographer_id: photographerId,
        thread_id: threadId,
        status: "pending_approval",
        body,
        instruction_history: [
          {
            step: "post_wedding_first_anniversary",
            wedding_id: weddingId,
          },
        ],
      });

      if (dErr) throw new Error(`drafts insert: ${dErr.message}`);
      return { drafted: true as const };
    });

    return { ok: true as const };
  },
);
