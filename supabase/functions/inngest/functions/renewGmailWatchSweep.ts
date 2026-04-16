/**
 * Daily: renew Gmail watch for accounts expiring within 48h (or never renewed).
 */
import {
  GMAIL_WATCH_RENEW_V1_EVENT,
  GMAIL_WATCH_RENEW_V1_SCHEMA_VERSION,
  inngest,
} from "../../_shared/inngest.ts";
import { supabaseAdmin } from "../../_shared/supabase.ts";

const RENEW_LIMIT = 100;
const HORIZON_MS = 48 * 60 * 60 * 1000;

export const renewGmailWatchSweep = inngest.createFunction(
  {
    id: "renew-gmail-watch-sweep",
    name: "Gmail — daily watch renewal sweep",
  },
  { cron: "0 4 * * *" },
  async ({ step }) => {
    return await step.run("enqueue-watch-renewals", async () => {
      const cutoff = Date.now() + HORIZON_MS;
      const { data: candidates, error } = await supabaseAdmin
        .from("connected_accounts")
        .select("id, photographer_id, gmail_watch_expiration")
        .eq("provider", "google")
        .neq("sync_status", "disconnected")
        .limit(300);

      if (error) {
        return { ok: false as const, error: error.message };
      }
      const list = (candidates ?? [])
        .filter((r) => {
          const exp = r.gmail_watch_expiration as string | null;
          if (!exp) return true;
          return new Date(exp).getTime() <= cutoff;
        })
        .slice(0, RENEW_LIMIT);
      if (list.length === 0) {
        return { ok: true as const, enqueued: 0 };
      }

      await inngest.send(
        list.map((r) => ({
          name: GMAIL_WATCH_RENEW_V1_EVENT,
          data: {
            schemaVersion: GMAIL_WATCH_RENEW_V1_SCHEMA_VERSION,
            photographerId: r.photographer_id as string,
            connectedAccountId: r.id as string,
          },
        })),
      );

      return { ok: true as const, enqueued: list.length };
    });
  },
);
