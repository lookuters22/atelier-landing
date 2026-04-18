/**
 * Gmail materialization bundle: full thread fetch, body extraction, HTML asset pipeline, attachment candidate list.
 * Used by import-candidate-review (approve fallback) and by G2 prepare worker (precompute before approval).
 */
import { ensureValidGoogleAccessToken } from "./ensureGoogleAccess.ts";
import { preferredCanonicalBody, type GmailPayloadPart } from "./gmailMessageBody.ts";
import type { GmailAttachmentCandidate } from "./gmailMimeAttachments.ts";
import {
  GMAIL_MAX_ATTACHMENTS_PER_MESSAGE,
  shouldExposeGmailAttachment,
  walkGmailPayloadForMaterialization,
} from "./gmailMimeAttachments.ts";
import {
  emptyInlineEmailAssetsStats,
  inlineRemoteEmailAssets,
  scanRemainingRemoteAssetRefs,
} from "./inlineEmailAssets.ts";
import {
  buildGmailDurableRenderArtifact,
  type GmailDurableRenderArtifactV1,
} from "./gmailImportDurableRender.ts";
import { GMAIL_HTML_MAX_STORAGE_CHARS } from "./gmailHtmlLimits.ts";
import { sanitizeGmailHtmlForStorage } from "./gmailHtmlSanitize.ts";
import {
  type GmailFullThreadMessage,
  getGmailThreadMessagesForMaterialization,
  pickLatestGmailThreadMessage,
} from "./gmailThreads.ts";
import type { StagedImportAttachmentRef } from "./gmailStageImportCandidateAttachments.ts";
import type { GmailMaterializationArtifactV1 } from "./gmailMaterializationArtifactV1.ts";
import {
  applyGmailRenderRefToMetadata,
  persistGmailRenderHtmlArtifact,
} from "./gmailPersistRenderArtifact.ts";
import { logGmailPreparePersistHtmlFailedV1 } from "./gmailImportObservability.ts";
import { logGmailMaterializeFallbackSubstepV1 } from "./gmailMaterializeFallbackSubstepObservability.ts";
import { supabaseAdmin } from "../supabase.ts";
import { buildSizeCappedGmailRenderPayloadV1 } from "./gmailRenderPayloadMaterialize.ts";

export type GmailMaterializationPersistOptions = {
  photographerId: string;
  importCandidateId?: string;
  messageId?: string;
};

export type GmailMaterializationBundle = {
  body: string;
  metadata: Record<string, unknown>;
  raw_payload: Record<string, unknown>;
  gmailImport: {
    gmailMessageId: string;
    accessToken: string;
    candidates: GmailAttachmentCandidate[];
  } | null;
  /** Set when HTML was persisted to Storage + `gmail_render_artifacts` (G3). */
  gmailRenderArtifactId: string | null;
};

/** In-memory, short-lived (e.g. one grouped-approval chunk) — reuse ensured access token per account. */
export type GmailAccountTokenCacheEntry = { accessToken: string };
export type GmailAccountTokenCache = Map<string, GmailAccountTokenCacheEntry>;

/** Reuse cold-path thread fetch (latest message full MIME) when the same Gmail thread appears twice in one chunk. */
export type GmailThreadFetchCacheEntry = { messages: GmailFullThreadMessage[] };
export type GmailThreadFetchCache = Map<string, GmailThreadFetchCacheEntry>;

function gmailThreadFetchCacheKey(connectedAccountId: string, rawProviderThreadId: string): string {
  return `${connectedAccountId}\u001f${rawProviderThreadId}`;
}

/**
 * Suppression-relevant inbound headers persisted under
 * `metadata.gmail_import.inbound_headers`.
 *
 * `from` is the canonical inbound sender identity needed by
 * `classifyGmailImportCandidate` (sender local-part / domain heuristics)
 * and by `messages.sender` so downstream draft suppression sees the real
 * sender (not the photographer's mailbox).
 */
/**
 * `GmailInboundHeadersV1` and `extractSuppressionRelevantInboundHeaders` live
 * in their own pure module so unit tests can import them without dragging in
 * the Deno-only `npm:` Supabase client. Re-exported here for backwards
 * compatibility with existing `buildGmailMaterializationArtifact` callers.
 */
export {
  extractSuppressionRelevantInboundHeaders,
  type GmailInboundHeadersV1,
} from "./inboundHeaderExtraction.ts";
import { extractSuppressionRelevantInboundHeaders } from "./inboundHeaderExtraction.ts";

/**
 * Full Gmail/network materialization (same work previously done only on approve click).
 *
 * @param persist Optional G3/A2 path: when set (prepare worker or approve-time fallback bundle),
 *   sanitized HTML is uploaded to Storage, a `gmail_render_artifacts` row is created, and metadata
 *   carries `render_html_ref` only (no inline `body_html_sanitized`). When omitted or persist
 *   upload fails, HTML may remain inline for compatibility; legacy rows may still have inline HTML.
 *
 * @param gmailAccountTokenCache Optional: when provided (e.g. grouped batch), skip repeated
 *   `connected_accounts` / oauth token reads and `ensureValidGoogleAccessToken` for the same
 *   `connectedAccountId` after the first row in the chunk.
 *
 * @param gmailThreadFetchCache Optional: when provided (e.g. grouped batch), skip repeated
 *   Gmail thread fetches for the same `(connectedAccountId, rawProviderThreadId)` in one chunk.
 */
export async function computeGmailMaterializationBundle(
  connectedAccountId: string,
  rawProviderThreadId: string,
  snippetFallback: string | null,
  persist?: GmailMaterializationPersistOptions | null,
  gmailAccountTokenCache?: GmailAccountTokenCache | null,
  gmailThreadFetchCache?: GmailThreadFetchCache | null,
): Promise<GmailMaterializationBundle> {
  const fallback =
    typeof snippetFallback === "string" && snippetFallback.trim().length > 0
      ? snippetFallback.trim()
      : "[Gmail import] No preview text was available for this thread.";

  /** Grouped approval passes chunk caches; omit substep logs for prepare/single (no caches). */
  const substepTel = Boolean(gmailAccountTokenCache || gmailThreadFetchCache);
  const baseCor = {
    connected_account_id: connectedAccountId,
    raw_provider_thread_id: rawProviderThreadId,
  };

  /** Wall clock for full fallback bundle compute — used when the outer try throws (`compute_bundle_error`). */
  const tBundleStart = Date.now();

  try {
    const tToken = Date.now();
    let accessTokenForGmail: string;
    const cached = gmailAccountTokenCache?.get(connectedAccountId);
    if (cached) {
      accessTokenForGmail = cached.accessToken;
      if (substepTel) {
        logGmailMaterializeFallbackSubstepV1({
          ...baseCor,
          stage: "token_resolve",
          duration_ms: Date.now() - tToken,
          ok: true,
          cache_hit: true,
        });
      }
    } else {
      const { data: account, error: aErr } = await supabaseAdmin
        .from("connected_accounts")
        .select("id, photographer_id, token_expires_at")
        .eq("id", connectedAccountId)
        .maybeSingle();

      const { data: tok, error: tErr } = await supabaseAdmin
        .from("connected_account_oauth_tokens")
        .select("access_token, refresh_token")
        .eq("connected_account_id", connectedAccountId)
        .maybeSingle();

      if (aErr || !account || tErr || !tok?.access_token) {
        if (substepTel) {
          logGmailMaterializeFallbackSubstepV1({
            ...baseCor,
            stage: "token_resolve",
            duration_ms: Date.now() - tToken,
            ok: false,
            cache_hit: false,
            outcome: "tokens_unavailable",
          });
        }
        return {
          body: fallback,
          metadata: { gmail_import: { used_snippet_fallback: true, reason: "tokens_unavailable" } },
          raw_payload: {},
          gmailImport: null,
          gmailRenderArtifactId: null,
        };
      }

      const ensured = await ensureValidGoogleAccessToken(
        {
          id: account.id as string,
          photographer_id: account.photographer_id as string,
          token_expires_at: account.token_expires_at as string | null,
        },
        { access_token: tok.access_token, refresh_token: tok.refresh_token },
      );
      accessTokenForGmail = ensured.accessToken;
      gmailAccountTokenCache?.set(connectedAccountId, { accessToken: accessTokenForGmail });
      if (substepTel) {
        logGmailMaterializeFallbackSubstepV1({
          ...baseCor,
          stage: "token_resolve",
          duration_ms: Date.now() - tToken,
          ok: true,
          cache_hit: false,
        });
      }
    }

    const tThread = Date.now();
    const threadKey = gmailThreadFetchCacheKey(connectedAccountId, rawProviderThreadId);
    const threadHit = gmailThreadFetchCache?.get(threadKey);
    let messages: GmailFullThreadMessage[];
    if (threadHit) {
      messages = threadHit.messages;
      if (substepTel) {
        logGmailMaterializeFallbackSubstepV1({
          ...baseCor,
          stage: "thread_fetch",
          duration_ms: Date.now() - tThread,
          ok: true,
          cache_hit: true,
        });
      }
    } else {
      const fetched = await getGmailThreadMessagesForMaterialization(
        accessTokenForGmail,
        rawProviderThreadId,
      );
      messages = fetched.messages;
      gmailThreadFetchCache?.set(threadKey, { messages });
      if (substepTel) {
        logGmailMaterializeFallbackSubstepV1({
          ...baseCor,
          stage: "thread_fetch",
          duration_ms: Date.now() - tThread,
          ok: true,
          cache_hit: false,
          outcome: fetched.thread_fetch_mode,
        });
      }
    }

    const tMime = Date.now();
    const latest = pickLatestGmailThreadMessage(messages);
    if (!latest?.payload) {
      if (substepTel) {
        logGmailMaterializeFallbackSubstepV1({
          ...baseCor,
          stage: "body_extract",
          duration_ms: Date.now() - tMime,
          ok: false,
          outcome: "no_payload",
        });
      }
      return {
        body: fallback,
        metadata: { gmail_import: { used_snippet_fallback: true, reason: "no_payload" } },
        raw_payload: { gmail_thread_id: rawProviderThreadId },
        gmailImport: null,
        gmailRenderArtifactId: null,
      };
    }

    const walked = walkGmailPayloadForMaterialization(latest.payload as GmailPayloadPart);
    const { plain, html, raw: rawAttachmentCandidates, stats: attachmentPipelineStatsBase } = walked;
    const canonical = preferredCanonicalBody(plain, html);
    const body = canonical.length > 0 ? canonical : fallback;

    const htmlTrim = html?.trim() ?? "";
    const htmlForFilter = htmlTrim.length > 0 ? htmlTrim : null;
    const filteredForImport = rawAttachmentCandidates.filter((c) =>
      shouldExposeGmailAttachment(c, htmlForFilter),
    );
    const attachmentPipelineStats = {
      ...attachmentPipelineStatsBase,
      after_filter: filteredForImport.length,
    };
    const attachmentCandidates = filteredForImport.slice(0, GMAIL_MAX_ATTACHMENTS_PER_MESSAGE);

    const mimeWalkMs = Date.now() - tMime;
    if (substepTel) {
      logGmailMaterializeFallbackSubstepV1({
        ...baseCor,
        stage: "body_extract",
        duration_ms: mimeWalkMs,
        ok: true,
        gmail_message_id: latest.id,
      });
      logGmailMaterializeFallbackSubstepV1({
        ...baseCor,
        stage: "attachment_candidates",
        duration_ms: 0,
        ok: true,
        outcome: "single_mime_walk_with_body_extract",
        gmail_message_id: latest.id,
        attachment_candidate_count: attachmentCandidates.length,
      });
    }
    console.log(
      JSON.stringify({
        type: "gmail_import_attachment_pipeline",
        gmail_message_id: latest.id,
        ...attachmentPipelineStats,
      }),
    );

    let bodyHtmlSanitized: string | null = null;
    let assetInline: Record<string, unknown> | undefined;
    let durableRender: GmailDurableRenderArtifactV1 | undefined;
    if (htmlTrim.length > 0) {
      const tHtml = Date.now();
      let htmlOk = true;
      /** Chars dropped before remote scan / inline when HTML exceeds storage cap (telemetry). */
      let htmlPipelineClippedChars = 0;
      try {
        // Align with `sanitizeGmailHtmlForStorage`: stored HTML never uses bytes beyond this cap, so
        // avoid full-string remote scans + Cheerio inline work on pathological multi‑MB bodies.
        const htmlForPipeline =
          htmlTrim.length > GMAIL_HTML_MAX_STORAGE_CHARS
            ? htmlTrim.slice(0, GMAIL_HTML_MAX_STORAGE_CHARS)
            : htmlTrim;
        if (htmlForPipeline.length < htmlTrim.length) {
          htmlPipelineClippedChars = htmlTrim.length - htmlForPipeline.length;
        }

        const preScanRemote = scanRemainingRemoteAssetRefs(htmlForPipeline);
        let htmlBaked: string;
        let assetStats: ReturnType<typeof emptyInlineEmailAssetsStats>;
        if (preScanRemote.categories.length === 0) {
          htmlBaked = htmlForPipeline;
          assetStats = emptyInlineEmailAssetsStats();
        } else {
          const inlined = await inlineRemoteEmailAssets(htmlForPipeline);
          htmlBaked = inlined.html;
          assetStats = inlined.stats;
        }
        const htmlForPostInlineScan =
          htmlBaked.length > GMAIL_HTML_MAX_STORAGE_CHARS
            ? htmlBaked.slice(0, GMAIL_HTML_MAX_STORAGE_CHARS)
            : htmlBaked;
        const scanPre =
          preScanRemote.categories.length === 0
            ? preScanRemote
            : scanRemainingRemoteAssetRefs(htmlForPostInlineScan);
        const sanitized = sanitizeGmailHtmlForStorage(htmlBaked);
        bodyHtmlSanitized = sanitized.trim().length > 0 ? sanitized : null;
        const scanPost = bodyHtmlSanitized ? scanRemainingRemoteAssetRefs(bodyHtmlSanitized) : null;
        assetInline = {
          ...assetStats,
          scan_pre_sanitize: scanPre,
          remaining_remote_scan: scanPost,
        };
        durableRender = buildGmailDurableRenderArtifact(assetStats, scanPre, scanPost);
      } catch (e) {
        htmlOk = false;
        const err = e instanceof Error ? e.message : String(e);
        console.warn("[buildGmailMaterializationArtifact] gmail html sanitize", err.slice(0, 200));
        bodyHtmlSanitized = null;
      }
      if (substepTel) {
        logGmailMaterializeFallbackSubstepV1({
          ...baseCor,
          stage: "html_inline_sanitize",
          duration_ms: Date.now() - tHtml,
          ok: htmlOk,
          gmail_message_id: latest.id,
          ...(htmlOk
            ? htmlPipelineClippedChars > 0
              ? {
                  outcome: "html_clipped_to_storage_max_before_pipeline",
                  html_pipeline_clipped_chars: htmlPipelineClippedChars,
                }
              : {}
            : { outcome: "sanitize_or_inline_failed" }),
        });
      }
    } else if (substepTel) {
      logGmailMaterializeFallbackSubstepV1({
        ...baseCor,
        stage: "html_inline_sanitize",
        duration_ms: 0,
        ok: true,
        outcome: "no_html_skipped",
      });
    }

    /**
     * Suppression-relevant inbound headers — preserved verbatim so downstream
     * consumers (suppression classifier, decision context, audit) can re-read
     * the original `From` / list / auto-submitted signals after materialization.
     *
     * Only a tiny allow-listed slice is kept (NOT the full RFC822 header set)
     * to bound metadata size. Anything missing is omitted; values are clipped
     * to a sane upper bound.
     */
    const inboundHeaders = extractSuppressionRelevantInboundHeaders(latest.payload as GmailPayloadPart);

    const gmailImportBlock: Record<string, unknown> = {
      gmail_message_id: latest.id,
      had_plain: Boolean(plain?.trim()),
      had_html: Boolean(htmlTrim),
      body_html_sanitized: bodyHtmlSanitized,
      durable_render: durableRender,
      asset_inline: assetInline,
      used_snippet_fallback: canonical.length === 0,
      attachment_pipeline: attachmentPipelineStats,
      inbound_headers: inboundHeaders,
    };

    let metadata: Record<string, unknown> = { gmail_import: gmailImportBlock };
    let gmailRenderArtifactId: string | null = null;

    if (
      persist &&
      bodyHtmlSanitized &&
      bodyHtmlSanitized.length > 0
    ) {
      const tRender = Date.now();
      const persisted = await persistGmailRenderHtmlArtifact(supabaseAdmin, {
        photographerId: persist.photographerId,
        html: bodyHtmlSanitized,
        importCandidateId: persist.importCandidateId,
        messageId: persist.messageId,
      });
      if (substepTel) {
        logGmailMaterializeFallbackSubstepV1({
          ...baseCor,
          stage: "render_persist",
          duration_ms: Date.now() - tRender,
          ok: persisted.ok,
          gmail_message_id: latest.id,
          outcome: persisted.ok ? "persisted" : "persist_failed",
        });
      }
      if (persisted.ok) {
        gmailRenderArtifactId = persisted.artifactId;
        metadata = applyGmailRenderRefToMetadata(
          { gmail_import: gmailImportBlock },
          persisted.ref,
        );
      } else {
        logGmailPreparePersistHtmlFailedV1({
          import_candidate_id: persist.importCandidateId ?? "unknown",
          photographer_id: persist.photographerId,
          reason: persisted.error.slice(0, 500),
        });
      }
    } else if (substepTel) {
      logGmailMaterializeFallbackSubstepV1({
        ...baseCor,
        stage: "render_persist",
        duration_ms: 0,
        ok: true,
        outcome: persist ? "skipped_no_html_for_persist" : "skipped_no_persist_opts",
      });
    }

    const raw_payload = buildSizeCappedGmailRenderPayloadV1({
      gmailMessageId: latest.id,
      gmailThreadId: rawProviderThreadId,
      plain,
      html: htmlTrim.length > 0 ? htmlTrim : null,
      rawAttachmentCandidates: walked.raw,
    });

    return {
      body,
      metadata,
      raw_payload,
      gmailImport: {
        gmailMessageId: latest.id,
        accessToken: accessTokenForGmail,
        candidates: attachmentCandidates,
      },
      gmailRenderArtifactId,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn("[buildGmailMaterializationArtifact] gmail full body fetch", msg);
    if (substepTel) {
      logGmailMaterializeFallbackSubstepV1({
        ...baseCor,
        stage: "compute_bundle_error",
        duration_ms: Date.now() - tBundleStart,
        ok: false,
        outcome: msg.slice(0, 400),
      });
    }
    return {
      body: fallback,
      metadata: {
        gmail_import: {
          used_snippet_fallback: true,
          fetch_error: msg.slice(0, 400),
        },
      },
      raw_payload: { gmail_thread_id: rawProviderThreadId },
      gmailImport: null,
      gmailRenderArtifactId: null,
    };
  }
}

/** Serializable artifact for `import_candidates.materialization_artifact` (no OAuth secrets). */
export type { GmailMaterializationArtifactV1 } from "./gmailMaterializationArtifactV1.ts";

export function bundleToArtifactV1(
  bundle: GmailMaterializationBundle,
  staged: StagedImportAttachmentRef[],
): GmailMaterializationArtifactV1 {
  const gid =
    typeof bundle.metadata?.gmail_import === "object" && bundle.metadata.gmail_import !== null
      ? (bundle.metadata.gmail_import as { gmail_message_id?: string }).gmail_message_id
      : undefined;
  return {
    version: 1,
    body: bundle.body,
    metadata: bundle.metadata,
    raw_payload: bundle.raw_payload,
    gmail_message_id: typeof gid === "string" ? gid : bundle.gmailImport?.gmailMessageId ?? null,
    staged_attachments: staged,
  };
}
