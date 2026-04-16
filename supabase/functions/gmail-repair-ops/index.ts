/**
 * A4: Operator visibility + control for Gmail inline-HTML repair workers (backlog, last run, pause, run-once)
 * and `gmail_import_secondary_pending` batch repair (`run_secondary_pending_batch`).
 *
 * Secrets:
 * - `GMAIL_REPAIR_OPS_ALLOWED_PHOTOGRAPHER_IDS` — comma-separated photographer UUIDs, or `*` (dangerous; dev only).
 *   When empty, all actions return 403 (fail closed).
 *
 * Hard kill-switches remain env-only: `GMAIL_INLINE_HTML_REPAIR_DISABLED`, `GMAIL_IMPORT_CANDIDATE_ARTIFACT_HTML_REPAIR_DISABLED`.
 */
import { requirePhotographerIdFromJwt } from "../_shared/authPhotographer.ts";
import { logA4EdgeOpLatencyV1 } from "../_shared/edgeOpLatencyObservability.ts";
import { runGmailInlineHtmlRepairBatch } from "../_shared/gmail/gmailRepairInlineHtmlToArtifact.ts";
import { runImportCandidateArtifactInlineHtmlRepairBatch } from "../_shared/gmail/gmailRepairImportCandidateMaterializationArtifact.ts";
import {
  fetchGmailRepairWorkerState,
  gmailRepairImportCandidateArtifactEnvDisabled,
  gmailRepairMessagesInlineHtmlEnvDisabled,
  gmailRepairEnvDisabledForWorker,
  GMAIL_REPAIR_WORKER_IMPORT_CANDIDATE_ARTIFACT,
  GMAIL_REPAIR_WORKER_MESSAGES_INLINE_HTML,
  computeGmailRepairWorkerOpsWarnings,
  computeGmailRepairWorkerRunHealth,
  type GmailRepairWorkerId,
  type GmailRepairWorkerStateRow,
  persistGmailRepairWorkerRunResult,
  setGmailRepairWorkerPaused,
} from "../_shared/gmail/gmailRepairWorkerOps.ts";
import { supabaseAdmin } from "../_shared/supabase.ts";
import { runGmailImportSecondaryPendingBatch } from "../_shared/gmail/gmailImportSecondaryPendingRepair.ts";

const EDGE = "gmail-repair-ops";
const BATCH_LIMIT = 25;
const SECONDARY_PENDING_LIMIT = 15;

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

function isGmailRepairOpsAllowed(photographerId: string): boolean {
  const raw = Deno.env.get("GMAIL_REPAIR_OPS_ALLOWED_PHOTOGRAPHER_IDS")?.trim() ?? "";
  if (raw === "") return false;
  if (raw === "*") return true;
  const ids = raw.split(",").map((s) => s.trim()).filter(Boolean);
  return ids.includes(photographerId);
}

function parseWorkerId(s: unknown): GmailRepairWorkerId | null {
  if (s === GMAIL_REPAIR_WORKER_MESSAGES_INLINE_HTML) return s;
  if (s === GMAIL_REPAIR_WORKER_IMPORT_CANDIDATE_ARTIFACT) return s;
  return null;
}

async function buildStatusPayload(photographerId: string) {
  const { data: mCount, error: mErr } = await supabaseAdmin.rpc(
    "gmail_messages_inline_html_repair_backlog_count_v1",
  );
  const { data: cCount, error: cErr } = await supabaseAdmin.rpc(
    "gmail_import_candidate_artifact_inline_html_repair_backlog_count_v1",
  );
  const { data: secCount, error: secErr } = await supabaseAdmin.rpc(
    "gmail_import_secondary_pending_open_count_for_photographer_v1",
    { p_photographer_id: photographerId },
  );

  const msgRow = await fetchGmailRepairWorkerState(supabaseAdmin, GMAIL_REPAIR_WORKER_MESSAGES_INLINE_HTML);
  const candRow = await fetchGmailRepairWorkerState(supabaseAdmin, GMAIL_REPAIR_WORKER_IMPORT_CANDIDATE_ARTIFACT);

  const envMsg = gmailRepairMessagesInlineHtmlEnvDisabled();
  const envCand = gmailRepairImportCandidateArtifactEnvDisabled();

  const mapWorker = (row: GmailRepairWorkerStateRow | null, env: boolean) => ({
    backlog_estimate: null as number | null,
    db_paused: row?.paused ?? false,
    paused_updated_at: row?.paused_updated_at ?? null,
    env_disabled: env,
    effective_paused: env || (row?.paused === true),
    last_run_at: row?.last_run_at ?? null,
    last_run_ok: row?.last_run_ok ?? null,
    last_run_kind: row?.last_run_kind ?? null,
    last_run_scanned: row?.last_run_scanned ?? null,
    last_run_migrated: row?.last_run_migrated ?? null,
    last_run_failed: row?.last_run_failed ?? null,
    last_run_skipped_already_ref: row?.last_run_skipped_already_ref ?? null,
    last_run_skipped_artifact_fk: row?.last_run_skipped_artifact_fk ?? null,
    last_run_skipped_no_inline: row?.last_run_skipped_no_inline ?? null,
    last_run_error: row?.last_run_error ?? null,
    last_run_failure_samples: row?.last_run_failure_samples ?? null,
    backlog_rpc_error: null as string | null,
    ops_warnings: [] as string[],
  });

  const messages = mapWorker(msgRow, envMsg);
  const candidates = mapWorker(candRow, envCand);

  messages.backlog_estimate = mErr ? null : Number(mCount ?? 0);
  messages.backlog_rpc_error = mErr?.message ?? null;
  candidates.backlog_estimate = cErr ? null : Number(cCount ?? 0);
  candidates.backlog_rpc_error = cErr?.message ?? null;

  messages.ops_warnings = computeGmailRepairWorkerOpsWarnings({
    backlog_estimate: messages.backlog_estimate,
    effective_paused: messages.effective_paused,
    last_run_at: messages.last_run_at,
    last_run_kind: messages.last_run_kind,
    last_run_scanned: messages.last_run_scanned,
    last_run_migrated: messages.last_run_migrated,
    last_run_failed: messages.last_run_failed,
  });
  candidates.ops_warnings = computeGmailRepairWorkerOpsWarnings({
    backlog_estimate: candidates.backlog_estimate,
    effective_paused: candidates.effective_paused,
    last_run_at: candidates.last_run_at,
    last_run_kind: candidates.last_run_kind,
    last_run_scanned: candidates.last_run_scanned,
    last_run_migrated: candidates.last_run_migrated,
    last_run_failed: candidates.last_run_failed,
  });

  messages.run_health = computeGmailRepairWorkerRunHealth({
    backlog_estimate: messages.backlog_estimate,
    effective_paused: messages.effective_paused,
    last_run_at: messages.last_run_at,
    last_run_kind: messages.last_run_kind,
    ops_warnings: messages.ops_warnings,
    backlog_rpc_error: messages.backlog_rpc_error,
  });
  candidates.run_health = computeGmailRepairWorkerRunHealth({
    backlog_estimate: candidates.backlog_estimate,
    effective_paused: candidates.effective_paused,
    last_run_at: candidates.last_run_at,
    last_run_kind: candidates.last_run_kind,
    ops_warnings: candidates.ops_warnings,
    backlog_rpc_error: candidates.backlog_rpc_error,
  });

  return {
    workers: {
      messages_inline_html: messages,
      import_candidate_artifact: candidates,
    },
    gmail_import_secondary_pending: {
      backlog_estimate: secErr ? null : Number(secCount ?? 0),
      backlog_rpc_error: secErr?.message ?? null,
    },
  };
}

Deno.serve(async (req) => {
  const wallStartedAt = Date.now();
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    logA4EdgeOpLatencyV1({
      edge: EDGE,
      action: "method_not_allowed",
      ok: false,
      duration_ms: Date.now() - wallStartedAt,
      http_status: 405,
    });
    return json({ error: "Method not allowed" }, 405);
  }

  try {
    const startedAt = Date.now();
    const photographerId = await requirePhotographerIdFromJwt(req);
    let body: Record<string, unknown>;
    try {
      body = (await req.json()) as Record<string, unknown>;
    } catch {
      logA4EdgeOpLatencyV1({
        edge: EDGE,
        action: "invalid_json",
        ok: false,
        duration_ms: Date.now() - startedAt,
        photographer_id: photographerId,
        http_status: 400,
      });
      return json({ error: "Invalid JSON body" }, 400);
    }

    const action = typeof body.action === "string" ? body.action.trim().toLowerCase() : "";

    if (!isGmailRepairOpsAllowed(photographerId)) {
      logA4EdgeOpLatencyV1({
        edge: EDGE,
        action: action || "unknown",
        ok: false,
        duration_ms: Date.now() - startedAt,
        photographer_id: photographerId,
        http_status: 403,
        outcome: "ops_not_allowed",
      });
      return json({ error: "Gmail repair ops not allowed for this account" }, 403);
    }

    if (action === "status") {
      const payload = await buildStatusPayload(photographerId);
      logA4EdgeOpLatencyV1({
        edge: EDGE,
        action: "status",
        ok: true,
        duration_ms: Date.now() - startedAt,
        photographer_id: photographerId,
        http_status: 200,
      });
      return json({ ok: true, ...payload });
    }

    if (action === "set_paused") {
      const worker = parseWorkerId(body.worker);
      const paused = body.paused === true;
      if (!worker) {
        return json({ error: "Invalid worker" }, 400);
      }
      const { error } = await setGmailRepairWorkerPaused(supabaseAdmin, worker, paused);
      if (error) {
        logA4EdgeOpLatencyV1({
          edge: EDGE,
          action: "set_paused",
          ok: false,
          duration_ms: Date.now() - startedAt,
          photographer_id: photographerId,
          http_status: 500,
        });
        return json({ error }, 500);
      }
      const payload = await buildStatusPayload(photographerId);
      logA4EdgeOpLatencyV1({
        edge: EDGE,
        action: "set_paused",
        ok: true,
        duration_ms: Date.now() - startedAt,
        photographer_id: photographerId,
        http_status: 200,
      });
      return json({ ok: true, ...payload });
    }

    if (action === "run_once") {
      const worker = parseWorkerId(body.worker);
      if (!worker) {
        return json({ error: "Invalid worker" }, 400);
      }
      const envOff = gmailRepairEnvDisabledForWorker(worker);
      const row = await fetchGmailRepairWorkerState(supabaseAdmin, worker);
      const dbPaused = row?.paused === true;
      if (envOff || dbPaused) {
        logA4EdgeOpLatencyV1({
          edge: EDGE,
          action: "run_once",
          ok: false,
          duration_ms: Date.now() - startedAt,
          photographer_id: photographerId,
          http_status: 409,
          outcome: "paused",
        });
        return json(
          {
            error: "Worker is paused (DB or env).",
            env_disabled: envOff,
            db_paused: dbPaused,
          },
          409,
        );
      }

      let batchResult;
      if (worker === GMAIL_REPAIR_WORKER_MESSAGES_INLINE_HTML) {
        batchResult = await runGmailInlineHtmlRepairBatch(supabaseAdmin, { limit: BATCH_LIMIT });
      } else {
        batchResult = await runImportCandidateArtifactInlineHtmlRepairBatch(supabaseAdmin, {
          limit: BATCH_LIMIT,
        });
      }

      await persistGmailRepairWorkerRunResult(supabaseAdmin, worker, batchResult);

      const payload = await buildStatusPayload(photographerId);
      logA4EdgeOpLatencyV1({
        edge: EDGE,
        action: "run_once",
        ok: true,
        duration_ms: Date.now() - startedAt,
        photographer_id: photographerId,
        http_status: 200,
      });
      return json({
        ok: true,
        batch: batchResult,
        ...payload,
      });
    }

    if (action === "run_secondary_pending_batch") {
      const rawLimit = body.limit;
      const limit =
        typeof rawLimit === "number" && Number.isFinite(rawLimit)
          ? Math.min(Math.max(Math.floor(rawLimit), 1), 50)
          : SECONDARY_PENDING_LIMIT;
      const batchResult = await runGmailImportSecondaryPendingBatch(supabaseAdmin, {
        photographerId,
        limit,
      });
      const payload = await buildStatusPayload(photographerId);
      logA4EdgeOpLatencyV1({
        edge: EDGE,
        action: "run_secondary_pending_batch",
        ok: true,
        duration_ms: Date.now() - startedAt,
        photographer_id: photographerId,
        http_status: 200,
      });
      return json({
        ok: true,
        secondary_pending_batch: batchResult,
        ...payload,
      });
    }

    logA4EdgeOpLatencyV1({
      edge: EDGE,
      action: "unknown",
      ok: false,
      duration_ms: Date.now() - startedAt,
      photographer_id: photographerId,
      http_status: 400,
    });
    return json({ error: "Unknown action" }, 400);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    logA4EdgeOpLatencyV1({
      edge: EDGE,
      action: "exception",
      ok: false,
      duration_ms: Date.now() - wallStartedAt,
      http_status: 500,
      outcome: msg.slice(0, 200),
    });
    return json({ error: msg.slice(0, 500) }, 500);
  }
});
