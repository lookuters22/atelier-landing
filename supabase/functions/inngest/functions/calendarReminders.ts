/**
 * Phase 6 Step 6C — Meeting reminders (24h + 1h before `calendar_events.start_time`).
 *
 * Triggered by `calendar/event.booked`. Sleeps until T−24h / T−1h, re-verifies the row
 * with tenant isolation, then drafts persona copy into `drafts` (pending_approval).
 *
 * QA HACK: gate+sleepUntil blocks are commented; two `step.sleep(..., "1m")` are used instead. Revert before production.
 */
import type { AgentContext } from "../../../../src/types/agent.types.ts";
import { buildAgentContext } from "../../_shared/memory/buildAgentContext.ts";
import { inngest } from "../../_shared/inngest.ts";
import { draftPersonaResponse } from "../../_shared/persona/personaAgent.ts";
import { supabaseAdmin } from "../../_shared/supabase.ts";

// Production uses gate + sleepUntil(T−24h/T−1h); QA hack uses fixed 1m sleeps (restore MS_PER_DAY/HOUR when reverting).

type VerifyOk = {
  ok: true;
  title: string;
  meetingLink: string | null;
};

type VerifyFail = {
  ok: false;
  reason: "missing" | "time_changed";
};

type VerifyResult = VerifyOk | VerifyFail;

function verifyEventRow(
  row: { start_time: string; title: string; meeting_link: string | null } | null,
  originalStartMs: number,
): VerifyResult {
  if (!row) return { ok: false, reason: "missing" };
  const curMs = new Date(row.start_time).getTime();
  if (curMs !== originalStartMs) return { ok: false, reason: "time_changed" };
  return {
    ok: true,
    title: row.title,
    meetingLink: row.meeting_link,
  };
}

export const calendarRemindersFunction = inngest.createFunction(
  {
    id: "calendar-reminders",
    name: "Calendar — 24h & 1h meeting reminders",
  },
  { event: "calendar/event.booked" },
  async ({ event, step }) => {
    const { eventId, photographerId, weddingId, startTime } = event.data;

    const originalStartMs = await step.run("normalize-start-time", () => {
      const ms = new Date(startTime).getTime();
      return ms;
    });

    if (Number.isNaN(originalStartMs)) {
      return { ok: false as const, error: "invalid_startTime" };
    }

    const threadId = await step.run("resolve-thread-for-drafts", async () => {
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
    });

    if (!threadId) {
      return { skipped: true as const, reason: "no_thread_for_wedding" };
    }

    // QA HACK (revert to gate24 + sleepUntil below): 1m test sleep instead of T−24h.
    // const gate24 = await step.run("gate-24h-reminder", () => {
    //   const at = originalStartMs - MS_PER_DAY;
    //   return {
    //     shouldRun: at > Date.now(),
    //     sleepUntilIso: new Date(at).toISOString(),
    //   };
    // });
    // if (gate24.shouldRun) {
    //   await step.sleepUntil("sleep-24h-reminder", gate24.sleepUntilIso);
    // }
    // if (gate24.shouldRun) {
    await step.sleep("wait-test-reminder-24h", "1m");

    const wake24 = await step.run("verify-wedding-after-sleep-24h", async () => {
      const { data: wedding, error: wErr } = await supabaseAdmin
        .from("weddings")
        .select("id, compassion_pause, strategic_pause, agency_cc_lock")
        .eq("id", weddingId)
        .eq("photographer_id", photographerId)
        .maybeSingle();

      if (wErr) throw new Error(`weddings: ${wErr.message}`);
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
      return { proceed: true as const };
    });

    if (!wake24.proceed && wake24.reason === "wedding_missing") {
      return { skipped: true as const, reason: "wedding_missing" };
    }

    if (wake24.proceed) {
      const v24 = await step.run("verify-event-24h", async () => {
        const { data, error } = await supabaseAdmin
          .from("calendar_events")
          .select("id, start_time, title, meeting_link")
          .eq("id", eventId)
          .eq("photographer_id", photographerId)
          .maybeSingle();

        if (error) throw new Error(error.message);
        return verifyEventRow(data, originalStartMs);
      });

      if (v24.ok) {
        await step.run("draft-24h-reminder", async () => {
          const agentContext: AgentContext = await buildAgentContext(
            supabaseAdmin,
            photographerId,
            weddingId,
            threadId,
            "web",
            "",
          );

          const facts = [
            "REMINDER TYPE: 24 hours before scheduled meeting.",
            `Event title: ${v24.title}`,
            `Start time (ISO): ${new Date(originalStartMs).toISOString()}`,
            "Draft a polite, concise client-facing reminder that the meeting is in about 24 hours.",
            "Do not invent times, links, or details not listed above.",
          ].join("\n");

          const body = await draftPersonaResponse(agentContext, facts);

          const { error } = await supabaseAdmin
            .from("drafts")
            .insert({
              photographer_id: photographerId,
              thread_id: threadId,
              status: "pending_approval",
              body,
              instruction_history: [
                {
                  step: "calendar_reminder_24h",
                  event_id: eventId,
                  wedding_id: weddingId,
                },
              ],
            });

          if (error) throw new Error(`draft insert 24h: ${error.message}`);
        });
      }
    }

    // QA HACK (revert to gate1 + sleepUntil below): 1m test sleep instead of T−1h.
    // const gate1 = await step.run("gate-1h-reminder", () => {
    //   const at = originalStartMs - MS_PER_HOUR;
    //   return {
    //     shouldRun: at > Date.now(),
    //     sleepUntilIso: new Date(at).toISOString(),
    //   };
    // });
    // if (gate1.shouldRun) {
    //   await step.sleepUntil("sleep-1h-reminder", gate1.sleepUntilIso);
    // }
    // if (gate1.shouldRun) {
    await step.sleep("wait-test-reminder-1h", "1m");

    const wake1 = await step.run("verify-wedding-after-sleep-1h", async () => {
      const { data: wedding, error: wErr } = await supabaseAdmin
        .from("weddings")
        .select("id, compassion_pause, strategic_pause, agency_cc_lock")
        .eq("id", weddingId)
        .eq("photographer_id", photographerId)
        .maybeSingle();

      if (wErr) throw new Error(`weddings: ${wErr.message}`);
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
      return { proceed: true as const };
    });

    if (!wake1.proceed && wake1.reason === "wedding_missing") {
      return { skipped: true as const, reason: "wedding_missing" };
    }

    if (wake1.proceed) {
      const v1 = await step.run("verify-event-1h", async () => {
        const { data, error } = await supabaseAdmin
          .from("calendar_events")
          .select("id, start_time, title, meeting_link")
          .eq("id", eventId)
          .eq("photographer_id", photographerId)
          .maybeSingle();

        if (error) throw new Error(error.message);
        return verifyEventRow(data, originalStartMs);
      });

      if (v1.ok) {
        await step.run("draft-1h-reminder", async () => {
          const agentContext: AgentContext = await buildAgentContext(
            supabaseAdmin,
            photographerId,
            weddingId,
            threadId,
            "web",
            "",
          );

          const linkLine =
            v1.meetingLink && v1.meetingLink.length > 0
              ? `Meeting link (include in the message): ${v1.meetingLink}`
              : "Meeting link: not set in the calendar row — keep the message general and do not invent a URL.";

          const facts = [
            "REMINDER TYPE: 1 hour before meeting — we are starting soon.",
            `Event title: ${v1.title}`,
            `Start time (ISO): ${new Date(originalStartMs).toISOString()}`,
            linkLine,
            "Draft a brief, warm client-facing message that the meeting starts in one hour.",
            "If a meeting link is provided above, include it in the body.",
            "Do not invent times or links not listed above.",
          ].join("\n");

          const body = await draftPersonaResponse(agentContext, facts);

          const { error } = await supabaseAdmin
            .from("drafts")
            .insert({
              photographer_id: photographerId,
              thread_id: threadId,
              status: "pending_approval",
              body,
              instruction_history: [
                {
                  step: "calendar_reminder_1h",
                  event_id: eventId,
                  wedding_id: weddingId,
                },
              ],
            });

          if (error) throw new Error(`draft insert 1h: ${error.message}`);
        });
      }
    }

    return { ok: true as const };
  },
);
