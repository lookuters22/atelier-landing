/**
 * Project Manager Worker — Timeline & Weather.
 *
 * Listens for ai/intent.project_management.
 *
 * 1. Fetch the wedding record for date, location, and photographer ownership.
 * 2. Simulate an external sunset/timeline API to flag scheduling risks.
 * 3. Insert a task so the photographer sees the warning on their dashboard.
 */
import { inngest } from "../../_shared/inngest.ts";
import { supabaseAdmin } from "../../_shared/supabase.ts";

type TimelineAnalysis = {
  sunsetTime: string;
  portraitTimeScheduled: number;
  warning: string;
};

function checkSunsetAndTimeline(_date: string, _location: string): TimelineAnalysis {
  return {
    sunsetTime: "19:00",
    portraitTimeScheduled: 30,
    warning:
      "Portrait session is only 30 minutes. Recommend at least 45 minutes before sunset.",
  };
}

export const projectManagerFunction = inngest.createFunction(
  { id: "project-manager-worker", name: "Project Manager Worker — Timeline & Weather" },
  { event: "ai/intent.project_management" },
  async ({ event, step }) => {
    const { wedding_id, raw_message, photographer_id } = event.data;

    if (!photographer_id || typeof photographer_id !== "string") {
      throw new Error("ai/intent.project_management: missing photographer_id (tenant-proof required)");
    }

    const wedding = await step.run("fetch-wedding", async () => {
      const { data, error } = await supabaseAdmin
        .from("weddings")
        .select("id, photographer_id, couple_names, wedding_date, location")
        .eq("id", wedding_id)
        .eq("photographer_id", photographer_id)
        .single();

      if (error || !data) {
        throw new Error(`Wedding not found: ${error?.message ?? wedding_id}`);
      }

      return data as {
        id: string;
        photographer_id: string;
        couple_names: string;
        wedding_date: string;
        location: string;
      };
    });

    const analysis = await step.run("analyze-timeline", () => {
      return checkSunsetAndTimeline(wedding.wedding_date, wedding.location);
    });

    const taskId = await step.run("create-task", async () => {
      const title = `\u26A0\uFE0F Timeline Alert: Extend portrait time for ${wedding.couple_names}`;

      const { data, error } = await supabaseAdmin
        .from("tasks")
        .insert({
          photographer_id: wedding.photographer_id,
          wedding_id,
          title,
          due_date: new Date().toISOString(),
          status: "open",
        })
        .select("id")
        .single();

      if (error) {
        throw new Error(`Failed to create task: ${error.message}`);
      }

      return data.id as string;
    });

    return {
      status: "timeline_task_created",
      wedding_id,
      taskId,
      analysis,
      triggered_by: raw_message.slice(0, 120),
    };
  },
);
