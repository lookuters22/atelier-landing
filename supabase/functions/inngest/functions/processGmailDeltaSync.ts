/**
 * Gmail history.list delta: inbound inserts on canonical threads (unknown threads materialize immediately + neutralize import_candidates).
 * Checkpoint `gmail_last_history_id` advances only after full success (single Inngest step).
 */
import { ensureValidGoogleAccessToken } from "../../_shared/gmail/ensureGoogleAccess.ts";
import { isStoredHistoryIdAtOrAfterNotification } from "../../_shared/gmail/gmailPubSubPush.ts";
import {
  GMAIL_DELTA_SYNC_V1_EVENT,
  INBOX_THREAD_REQUIRES_TRIAGE_V1_EVENT,
  INBOX_THREAD_REQUIRES_TRIAGE_V1_SCHEMA_VERSION,
  inngest,
} from "../../_shared/inngest.ts";
import type { DeltaProcessOneResult } from "../../_shared/gmail/gmailDeltaSyncCore.ts";
import { getGmailProfile } from "../../_shared/gmail/gmailWatchHistory.ts";
import {
  runGmailCatchupRecentWindow,
  runGmailIncrementalHistoryList,
} from "../../_shared/gmail/gmailDeltaSyncCore.ts";
import { supabaseAdmin } from "../../_shared/supabase.ts";

/** Throws if the row update fails so the Inngest step retries instead of returning success without a persisted checkpoint. */
async function updateConnectedAccountOrThrow(
  connectedAccountId: string,
  fields: Record<string, unknown>,
  context: string,
): Promise<void> {
  const { error } = await supabaseAdmin
    .from("connected_accounts")
    .update(fields)
    .eq("id", connectedAccountId);
  if (error) {
    throw new Error(`[gmail.delta_sync] ${context}: ${error.message}`);
  }
}

async function enqueueInboxThreadRequiresTriage(
  photographerId: string,
  processed: DeltaProcessOneResult[],
  traceId?: string,
): Promise<void> {
  const batch: Array<{
    name: typeof INBOX_THREAD_REQUIRES_TRIAGE_V1_EVENT;
    id: string;
    data: {
      schemaVersion: typeof INBOX_THREAD_REQUIRES_TRIAGE_V1_SCHEMA_VERSION;
      photographerId: string;
      threadId: string;
      triggerMessageId: string;
      source: "gmail_delta";
      traceId?: string;
    };
  }> = [];
  for (const p of processed) {
    if (p.action !== "inserted_inbound" && p.action !== "inserted_inbound_new_thread") continue;
    batch.push({
      name: INBOX_THREAD_REQUIRES_TRIAGE_V1_EVENT,
      id: `gmail_triage:${p.threadId}:${p.messageId}`,
      data: {
        schemaVersion: INBOX_THREAD_REQUIRES_TRIAGE_V1_SCHEMA_VERSION,
        photographerId,
        threadId: p.threadId,
        triggerMessageId: p.messageId,
        source: "gmail_delta",
        ...(traceId ? { traceId } : {}),
      },
    });
  }
  if (batch.length === 0) return;
  await inngest.send(batch);
}

export const processGmailDeltaSync = inngest.createFunction(
  {
    id: "process-gmail-delta-sync",
    name: "Gmail — Pub/Sub delta (history.list)",
  },
  { event: GMAIL_DELTA_SYNC_V1_EVENT },
  async ({ event, step }) => {
    const sv = event.data.schemaVersion;
    if (sv !== 1 && sv !== 2) {
      return { ok: false as const, error: "schema_version_mismatch" };
    }

    const { photographerId, connectedAccountId, catchupAfterHistory404 } = event.data;
    const traceId = typeof event.data.traceId === "string" && event.data.traceId.trim().length > 0
      ? event.data.traceId.trim()
      : undefined;

    return await step.run("gmail-delta-sync", async () => {
      console.log(
        "[gmail.delta_sync]",
        JSON.stringify({
          trace_id: traceId ?? null,
          phase: "worker_start",
          t: new Date().toISOString(),
          photographerId,
          connectedAccountId,
          catchupAfterHistory404: Boolean(catchupAfterHistory404),
        }),
      );

      const { data: account, error: aErr } = await supabaseAdmin
        .from("connected_accounts")
        .select(
          "id, photographer_id, token_expires_at, sync_status, gmail_last_history_id, gmail_watch_expiration",
        )
        .eq("id", connectedAccountId)
        .eq("photographer_id", photographerId)
        .maybeSingle();

      if (aErr || !account) {
        console.warn("[gmail.delta_sync] account_not_found", aErr?.message ?? "");
        return { ok: false as const, error: "account_not_found" };
      }

      console.log(
        "[gmail.delta_sync] checkpoint",
        "gmail_last_history_id=",
        account.gmail_last_history_id ?? "(null)",
      );

      const { data: tok, error: tErr } = await supabaseAdmin
        .from("connected_account_oauth_tokens")
        .select("access_token, refresh_token")
        .eq("connected_account_id", connectedAccountId)
        .maybeSingle();

      if (tErr || !tok?.access_token) {
        const now = new Date().toISOString();
        await supabaseAdmin
          .from("connected_accounts")
          .update({
            sync_status: "error",
            sync_error_summary: "OAuth tokens missing for Gmail delta — reconnect in Settings.",
            gmail_delta_sync_last_error: "oauth_tokens_missing",
            gmail_delta_sync_last_error_at: now,
            updated_at: now,
          })
          .eq("id", connectedAccountId);
        return { ok: false as const, error: "tokens_not_found" };
      }

      const ensured = await ensureValidGoogleAccessToken(
        {
          id: account.id as string,
          photographer_id: account.photographer_id as string,
          token_expires_at: account.token_expires_at as string | null,
        },
        { access_token: tok.access_token, refresh_token: tok.refresh_token },
      );
      const accessToken = ensured.accessToken;

      const nowIso = () => new Date().toISOString();

      if (catchupAfterHistory404) {
        const catchupOnly = await runGmailCatchupRecentWindow(supabaseAdmin, {
          photographerId,
          connectedAccountId,
          accessToken,
          traceId,
        });
        if (!catchupOnly.ok) {
          await supabaseAdmin
            .from("connected_accounts")
            .update({
              gmail_delta_sync_last_error: catchupOnly.error.slice(0, 500),
              gmail_delta_sync_last_error_at: nowIso(),
              updated_at: nowIso(),
            })
            .eq("id", connectedAccountId);
          return { ok: false as const, error: catchupOnly.error };
        }
        await enqueueInboxThreadRequiresTriage(photographerId, catchupOnly.processed, traceId);
        const profile = await getGmailProfile(accessToken);
        await updateConnectedAccountOrThrow(
          connectedAccountId,
          {
            gmail_last_history_id: profile.historyId,
            gmail_sync_degraded: false,
            gmail_delta_sync_last_error: null,
            gmail_delta_sync_last_error_at: null,
            sync_error_summary: null,
            updated_at: nowIso(),
          },
          "persist_checkpoint_catchup_after_404",
        );
        return {
          ok: true as const,
          catchup404: true as const,
          messageIds: catchupOnly.messageIds,
          stagedCandidates: 0,
        };
      }

      let startHistoryId = account.gmail_last_history_id as string | null;
      if (!startHistoryId || startHistoryId.trim().length === 0) {
        const profile = await getGmailProfile(accessToken);
        await updateConnectedAccountOrThrow(
          connectedAccountId,
          {
            gmail_last_history_id: profile.historyId,
            gmail_sync_degraded: false,
            gmail_delta_sync_last_error: null,
            gmail_delta_sync_last_error_at: null,
            updated_at: nowIso(),
          },
          "persist_checkpoint_bootstrap",
        );
        return { ok: true as const, bootstrapped: true, historyId: profile.historyId };
      }

      const notificationHistoryId =
        typeof event.data.notificationHistoryId === "string" && event.data.notificationHistoryId.trim().length > 0
          ? event.data.notificationHistoryId.trim()
          : undefined;
      if (
        notificationHistoryId &&
        typeof account.gmail_last_history_id === "string" &&
        account.gmail_last_history_id.trim().length > 0 &&
        isStoredHistoryIdAtOrAfterNotification(account.gmail_last_history_id, notificationHistoryId)
      ) {
        console.log(
          "[gmail.delta_sync]",
          JSON.stringify({
            trace_id: traceId ?? null,
            phase: "noop_notification_already_applied",
            t: new Date().toISOString(),
            notificationHistoryId,
            gmail_last_history_id: account.gmail_last_history_id,
          }),
        );
        return {
          ok: true as const,
          noop: true as const,
          reason: "checkpoint_already_at_or_after_notification" as const,
        };
      }

      const inc = await runGmailIncrementalHistoryList(supabaseAdmin, {
        photographerId,
        connectedAccountId,
        accessToken,
        startHistoryId,
        traceId,
      });

      if (!inc.ok) {
        if (inc.history404) {
          const errMsg = `history_list_404: ${inc.error}`.slice(0, 500);
          await supabaseAdmin
            .from("connected_accounts")
            .update({
              gmail_sync_degraded: true,
              gmail_delta_sync_last_error: errMsg,
              gmail_delta_sync_last_error_at: nowIso(),
              updated_at: nowIso(),
            })
            .eq("id", connectedAccountId);

          const catchup = await runGmailCatchupRecentWindow(supabaseAdmin, {
            photographerId,
            connectedAccountId,
            accessToken,
            traceId,
          });
          if (!catchup.ok) {
            await supabaseAdmin
              .from("connected_accounts")
              .update({
                gmail_delta_sync_last_error: `${errMsg} | catchup: ${catchup.error}`.slice(0, 500),
                gmail_delta_sync_last_error_at: nowIso(),
                updated_at: nowIso(),
              })
              .eq("id", connectedAccountId);
            return { ok: false as const, error: catchup.error, history404: true as const };
          }

          await enqueueInboxThreadRequiresTriage(photographerId, catchup.processed, traceId);

          const profile = await getGmailProfile(accessToken);
          await updateConnectedAccountOrThrow(
            connectedAccountId,
            {
              gmail_last_history_id: profile.historyId,
              gmail_sync_degraded: false,
              gmail_delta_sync_last_error: null,
              gmail_delta_sync_last_error_at: null,
              updated_at: nowIso(),
            },
            "persist_checkpoint_history_404_recovered",
          );

          return {
            ok: true as const,
            recovered404: true as const,
            catchupMessages: catchup.messageIds,
            newCheckpoint: profile.historyId,
          };
        }

        await supabaseAdmin
          .from("connected_accounts")
          .update({
            gmail_delta_sync_last_error: inc.error.slice(0, 500),
            gmail_delta_sync_last_error_at: nowIso(),
            updated_at: nowIso(),
          })
          .eq("id", connectedAccountId);
        return { ok: false as const, error: inc.error };
      }

      await enqueueInboxThreadRequiresTriage(photographerId, inc.processed, traceId);

      await updateConnectedAccountOrThrow(
        connectedAccountId,
        {
          gmail_last_history_id: inc.targetHistoryId,
          gmail_delta_sync_last_error: null,
          gmail_delta_sync_last_error_at: null,
          updated_at: nowIso(),
        },
        "persist_checkpoint_incremental_success",
      );

      return {
        ok: true as const,
        pages: inc.pages,
        messageRefs: inc.messageRefs,
        checkpoint: inc.targetHistoryId,
        stagedCandidates: 0,
      };
    });
  },
);
