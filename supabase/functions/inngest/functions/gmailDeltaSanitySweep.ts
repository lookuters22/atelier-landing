/**
 * Hourly: enqueue Gmail delta sync for connected Google accounts (caps per run).
 */
import {
  GMAIL_DELTA_SYNC_V1_EVENT,
  GMAIL_DELTA_SYNC_V1_SCHEMA_VERSION,
  inngest,
} from "../../_shared/inngest.ts";
import { supabaseAdmin } from "../../_shared/supabase.ts";

const SANITY_LIMIT = 50;

export const gmailDeltaSanitySweep = inngest.createFunction(
  {
    id: "gmail-delta-sanity-sweep",
    name: "Gmail — hourly delta sanity sweep",
  },
  { cron: "0 * * * *" },
  async ({ step }) => {
    return await step.run("enqueue-delta-sanity", async () => {
      const { data: rows, error } = await supabaseAdmin
        .from("connected_accounts")
        .select("id, photographer_id")
        .eq("provider", "google")
        .neq("sync_status", "disconnected")
        .not("gmail_last_history_id", "is", null)
        .limit(SANITY_LIMIT);

      if (error) {
        return { ok: false as const, error: error.message };
      }
      const list = rows ?? [];
      if (list.length === 0) {
        return { ok: true as const, enqueued: 0 };
      }

      await inngest.send(
        list.map((r) => ({
          name: GMAIL_DELTA_SYNC_V1_EVENT,
          data: {
            schemaVersion: GMAIL_DELTA_SYNC_V1_SCHEMA_VERSION,
            photographerId: r.photographer_id as string,
            connectedAccountId: r.id as string,
            traceId: crypto.randomUUID(),
          },
        })),
      );

      return { ok: true as const, enqueued: list.length };
    });
  },
);
