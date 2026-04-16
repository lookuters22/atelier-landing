/**
 * Fast-lane Gmail import: users.threads.list with labelIds → staged import_candidates only.
 * Approved items will later feed the existing Inbox / canonical thread model (future slice).
 *
 * G1: Bounded concurrency for `threads.get?format=metadata` (pool size `GMAIL_THREAD_METADATA_CONCURRENCY`).
 * When `threads.list` returns a non-empty snippet, skip `threads.get` for that thread (subject null, message_count=1);
 * full Gmail thread is still loaded in G2 prepare before approval.
 */
import { ensureValidGoogleAccessToken } from "../../_shared/gmail/ensureGoogleAccess.ts";
import {
  GMAIL_THREAD_METADATA_CONCURRENCY,
  runPoolWithConcurrency,
  shouldSkipThreadMetadataFetch,
} from "../../_shared/gmail/gmailSyncConcurrency.ts";
import { summarizeGmailSyncFailure } from "../../_shared/gmail/gmailSyncFailure.ts";
import { getGmailThreadMetadata, listGmailThreadsForLabel } from "../../_shared/gmail/gmailThreads.ts";
import {
  GMAIL_IMPORT_CANDIDATE_PREPARE_MATERIALIZATION_V1_EVENT,
  GMAIL_IMPORT_CANDIDATE_PREPARE_MATERIALIZATION_V1_SCHEMA_VERSION,
  GMAIL_LABEL_SYNC_V1_EVENT,
  GMAIL_LABEL_SYNC_V1_SCHEMA_VERSION,
  inngest,
} from "../../_shared/inngest.ts";
import { ensurePendingGmailLabelImportGroup } from "../../_shared/gmail/ensurePendingGmailLabelImportGroup.ts";
import { gmailImportCandidateMaterializationLaneDisabled } from "../../_shared/gmail/gmailMaterializationLanePause.ts";
import { supabaseAdmin } from "../../_shared/supabase.ts";

export const GMAIL_LABEL_SYNC_MAX_THREADS = 200;
const LIST_PAGE = 50;

type ThreadRef = { id: string; snippet?: string };

function buildCandidateRow(
  photographerId: string,
  connectedAccountId: string,
  labelId: string,
  labelName: string,
  tr: ThreadRef,
  fields: { message_count: number; snippet: string | null; subject: string | null },
  updatedAt: string,
  gmailLabelImportGroupId: string,
): Record<string, unknown> {
  return {
    photographer_id: photographerId,
    connected_account_id: connectedAccountId,
    source_type: "gmail_label",
    source_identifier: labelId,
    source_label_name: labelName,
    raw_provider_thread_id: tr.id,
    message_count: fields.message_count,
    snippet: fields.snippet,
    subject: fields.subject,
    status: "pending",
    updated_at: updatedAt,
    gmail_label_import_group_id: gmailLabelImportGroupId,
  };
}

export const syncGmailLabelImportCandidates = inngest.createFunction(
  {
    id: "sync-gmail-label-import-candidates",
    name: "Gmail — label fast-lane → import_candidates",
  },
  { event: GMAIL_LABEL_SYNC_V1_EVENT },
  async ({ event, step }) => {
    const { photographerId, connectedAccountId, labelId, labelName } = event.data;
    if (event.data.schemaVersion !== GMAIL_LABEL_SYNC_V1_SCHEMA_VERSION) {
      return { ok: false as const, error: "schema_version_mismatch" };
    }

    return await step.run("sync-label", async () => {
      const { data: account, error: aErr } = await supabaseAdmin
        .from("connected_accounts")
        .select("id, photographer_id, token_expires_at, sync_status")
        .eq("id", connectedAccountId)
        .eq("photographer_id", photographerId)
        .maybeSingle();

      if (aErr || !account) {
        return { ok: false as const, error: "account_not_found" };
      }

      const { data: tok, error: tErr } = await supabaseAdmin
        .from("connected_account_oauth_tokens")
        .select("access_token, refresh_token")
        .eq("connected_account_id", connectedAccountId)
        .maybeSingle();

      if (tErr || !tok) {
        await supabaseAdmin
          .from("connected_accounts")
          .update({
            sync_status: "error",
            sync_error_summary: "OAuth tokens missing for this connection — reconnect Gmail in Settings.",
            updated_at: new Date().toISOString(),
          })
          .eq("id", connectedAccountId);
        return { ok: false as const, error: "tokens_not_found" };
      }

      await supabaseAdmin
        .from("connected_accounts")
        .update({ sync_status: "syncing", updated_at: new Date().toISOString() })
        .eq("id", connectedAccountId);

      const nowIso = () => new Date().toISOString();

      try {
        const ensured = await ensureValidGoogleAccessToken(
          {
            id: account.id,
            photographer_id: account.photographer_id,
            token_expires_at: account.token_expires_at,
          },
          { access_token: tok.access_token, refresh_token: tok.refresh_token },
        );
        const accessToken = ensured.accessToken;

        let gmailLabelImportGroupId: string;
        try {
          gmailLabelImportGroupId = await ensurePendingGmailLabelImportGroup(supabaseAdmin, {
            photographerId,
            connectedAccountId,
            sourceIdentifier: labelId,
            sourceLabelName: labelName,
          });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          if (msg === "gmail_label_group_approval_in_progress") {
            await supabaseAdmin
              .from("connected_accounts")
              .update({
                sync_status: "connected",
                sync_error_summary:
                  "Gmail label sync skipped: a batch approval is in progress for this label. Wait for it to finish, then sync again."
                    .slice(0, 500),
                updated_at: nowIso(),
              })
              .eq("id", connectedAccountId);
            return {
              ok: false as const,
              error: msg,
              code: "gmail_label_group_approval_in_progress" as const,
            };
          }
          throw e;
        }

        const threadRefs: ThreadRef[] = [];
        let pageToken: string | undefined;
        let listPages = 0;
        while (threadRefs.length < GMAIL_LABEL_SYNC_MAX_THREADS) {
          const remaining = GMAIL_LABEL_SYNC_MAX_THREADS - threadRefs.length;
          listPages += 1;
          const page = await listGmailThreadsForLabel(
            accessToken,
            labelId,
            Math.min(LIST_PAGE, remaining),
            pageToken,
          );
          for (const t of page.threads) {
            threadRefs.push({ id: t.id, snippet: t.snippet });
            if (threadRefs.length >= GMAIL_LABEL_SYNC_MAX_THREADS) break;
          }
          if (!page.nextPageToken || threadRefs.length >= GMAIL_LABEL_SYNC_MAX_THREADS) break;
          pageToken = page.nextPageToken;
        }

        if (threadRefs.length === 0) {
          await supabaseAdmin
            .from("connected_accounts")
            .update({
              sync_status: "connected",
              sync_error_summary:
                "Gmail label sync: 0 threads (no messages with this label).",
              updated_at: nowIso(),
            })
            .eq("id", connectedAccountId);
          return {
            ok: true as const,
            staged: 0,
            threadCount: 0,
            emptyLabel: true as const,
          };
        }

        const rows: Record<string, unknown>[] = [];
        let metadataFailures = 0;

        const listOnly = threadRefs.filter((tr) => shouldSkipThreadMetadataFetch(tr));
        const needMetadata = threadRefs.filter((tr) => !shouldSkipThreadMetadataFetch(tr));
        const metadataSkipped = listOnly.length;

        for (const tr of listOnly) {
          rows.push(
            buildCandidateRow(
              photographerId,
              connectedAccountId,
              labelId,
              labelName,
              tr,
              {
                message_count: 1,
                snippet: tr.snippet?.trim() ?? null,
                subject: null,
              },
              nowIso(),
              gmailLabelImportGroupId,
            ),
          );
        }

        const metaResults = await runPoolWithConcurrency(
          needMetadata,
          GMAIL_THREAD_METADATA_CONCURRENCY,
          async (tr) => {
            try {
              const meta = await getGmailThreadMetadata(accessToken, tr.id);
              return { ok: true as const, tr, meta };
            } catch (e) {
              return { ok: false as const, tr, error: e };
            }
          },
        );

        for (const r of metaResults) {
          if (r.ok) {
            const { tr, meta } = r;
            rows.push(
              buildCandidateRow(
                photographerId,
                connectedAccountId,
                labelId,
                labelName,
                tr,
                {
                  message_count: meta.messageCount,
                  snippet: meta.snippet ?? tr.snippet ?? null,
                  subject: meta.subject,
                },
                nowIso(),
                gmailLabelImportGroupId,
              ),
            );
          } else {
            metadataFailures += 1;
            console.warn("[syncGmailLabelImportCandidates] thread metadata skip", r.tr.id, r.error);
          }
        }

        /** Each entry here is one `threads.get?format=metadata` (see `shouldSkipThreadMetadataFetch` for list-only skips). */
        const threadsGetCalls = needMetadata.length;

        console.log(
          JSON.stringify({
            type: "gmail_label_sync_metrics",
            connected_account_id: connectedAccountId,
            label_id: labelId,
            thread_cap: GMAIL_LABEL_SYNC_MAX_THREADS,
            list_pages: listPages,
            threads_listed: threadRefs.length,
            metadata_skipped: metadataSkipped,
            threads_get_calls: threadsGetCalls,
            metadata_concurrency: GMAIL_THREAD_METADATA_CONCURRENCY,
            metadata_failures: metadataFailures,
          }),
        );

        if (threadRefs.length > 0 && rows.length === 0) {
          const summary =
            `Gmail listed ${threadRefs.length} thread(s) but threads.get (metadata) failed for all — check OAuth scopes (need gmail.readonly) and Inngest logs.`;
          await supabaseAdmin
            .from("connected_accounts")
            .update({
              sync_status: "error",
              sync_error_summary: summary.slice(0, 500),
              updated_at: nowIso(),
            })
            .eq("id", connectedAccountId);
          return { ok: false as const, error: summary, threadRefs: threadRefs.length, metadataFailures };
        }

        if (rows.length > 0) {
          const { data: upserted, error: upErr } = await supabaseAdmin
            .from("import_candidates")
            .upsert(rows, {
              onConflict: "photographer_id,connected_account_id,raw_provider_thread_id",
            })
            .select("id");
          if (upErr) {
            await supabaseAdmin
              .from("connected_accounts")
              .update({
                sync_status: "error",
                sync_error_summary: upErr.message.slice(0, 500),
                updated_at: nowIso(),
              })
              .eq("id", connectedAccountId);
            return { ok: false as const, error: upErr.message };
          }
          const ids = (upserted ?? [])
            .map((r) => (typeof r.id === "string" ? r.id : null))
            .filter((x): x is string => Boolean(x));
          if (ids.length > 0 && !gmailImportCandidateMaterializationLaneDisabled()) {
            try {
              await inngest.send(
                ids.map((importCandidateId) => ({
                  name: GMAIL_IMPORT_CANDIDATE_PREPARE_MATERIALIZATION_V1_EVENT,
                  data: {
                    schemaVersion: GMAIL_IMPORT_CANDIDATE_PREPARE_MATERIALIZATION_V1_SCHEMA_VERSION,
                    photographerId,
                    importCandidateId,
                  },
                })),
              );
            } catch (e) {
              console.warn(
                "[syncGmailLabelImportCandidates] prepare_materialization enqueue failed",
                e instanceof Error ? e.message : String(e),
              );
            }
          } else if (ids.length > 0 && gmailImportCandidateMaterializationLaneDisabled()) {
            console.log(
              "[syncGmailLabelImportCandidates] prepare_materialization skipped (GMAIL_IMPORT_CANDIDATE_MATERIALIZATION_LANE_DISABLED)",
              { count: ids.length },
            );
          }
        }

        const partialSummary =
          metadataFailures > 0 && rows.length > 0
            ? `Staged ${rows.length} of ${threadRefs.length} threads; ${metadataFailures} metadata fetch(es) failed.`.slice(
                0,
                500,
              )
            : null;

        await supabaseAdmin
          .from("connected_accounts")
          .update({
            sync_status: "connected",
            sync_error_summary: partialSummary,
            updated_at: nowIso(),
          })
          .eq("id", connectedAccountId);

        return {
          ok: true as const,
          staged: rows.length,
          threadCount: threadRefs.length,
          listPages,
          metadataSkipped,
          threadsGetCalls,
          metadataConcurrency: GMAIL_THREAD_METADATA_CONCURRENCY,
          metadataFailures: metadataFailures > 0 ? metadataFailures : undefined,
        };
      } catch (e) {
        const summary = summarizeGmailSyncFailure(e);
        await supabaseAdmin
          .from("connected_accounts")
          .update({
            sync_status: "error",
            sync_error_summary: summary,
            updated_at: nowIso(),
          })
          .eq("id", connectedAccountId);
        return { ok: false as const, error: summary };
      }
    });
  },
);
