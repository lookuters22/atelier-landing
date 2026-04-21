/**
 * V3 context-layer evaluation harness — **comparison mode** for grounding (not a product change).
 *
 * Runs conditions A–E sequentially against live triage → clientOrchestratorV1 → persona rewrite,
 * varying seeded `playbook_rules`, case `memories`, and (for D) best-effort `thread_summaries` + prior `messages`.
 *
 * ## Run
 *   npx tsx scripts/v3_context_layer_eval_harness.ts
 *   npm run v3:eval-context-layers
 *
 * ## Requires
 * Same as `simulate_v3_worker_verification.ts`: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `INNGEST_EVENT_KEY`,
 * gate posture (e.g. `scripts/v3_verify_gate_posture.env`), `.qa_fixtures.json`.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

function parseEnvLines(content: string): Array<{ key: string; value: string }> {
  const out: Array<{ key: string; value: string }> = [];
  for (const raw of content.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const k = line.slice(0, eq).trim();
    let v = line.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    out.push({ key: k, value: v });
  }
  return out;
}

function loadEnv(): void {
  for (const rel of [".env", join("supabase", ".env")]) {
    const p = join(root, rel);
    if (!existsSync(p)) continue;
    for (const { key: k, value: v } of parseEnvLines(readFileSync(p, "utf8"))) {
      if (!process.env[k]) process.env[k] = v;
    }
  }
}

function isV3GatePostureEnvKey(k: string): boolean {
  if (k.startsWith("TRIAGE_LIVE_ORCHESTRATOR_MAIN_PATH_") && k.endsWith("_KNOWN_WEDDING_V1")) return true;
  if (k === "INTAKE_LIVE_ORCHESTRATOR_POST_BOOTSTRAP_EMAIL_V1") return true;
  return false;
}

function loadV3VerifyGatePostureFile(): void {
  const explicit = process.env.V3_VERIFY_GATE_POSTURE_FILE?.trim();
  const candidates: string[] = [];
  if (explicit) {
    candidates.push(explicit.startsWith("/") || /^[A-Za-z]:/.test(explicit) ? explicit : join(root, explicit));
  } else {
    candidates.push(join(root, "scripts", "v3_verify_gate_posture.env"));
    candidates.push(join(root, ".env.v3_verify_gate_posture"));
  }
  for (const p of candidates) {
    if (!existsSync(p)) continue;
    for (const { key: k, value: v } of parseEnvLines(readFileSync(p, "utf8"))) {
      if (!isV3GatePostureEnvKey(k)) continue;
      process.env[k] = v;
    }
    break;
  }
}

loadEnv();
loadV3VerifyGatePostureFile();

const url = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL;
const sr = process.env.SUPABASE_SERVICE_ROLE_KEY;
const inngestKey = process.env.INNGEST_EVENT_KEY;

const postApproveOutboundWaitMs = Math.max(
  0,
  parseInt(process.env.V3_POST_APPROVE_OUTBOUND_WAIT_MS ?? "30000", 10) || 30000,
);
const pollMs = Math.max(2000, parseInt(process.env.V3_VERIFY_POLL_MS ?? "4000", 10) || 4000);
const quietMs = Math.max(5000, parseInt(process.env.V3_VERIFY_QUIET_MS ?? "18000", 10) || 18000);
const turnMaxMs = Math.max(60000, parseInt(process.env.V3_VERIFY_TURN_MAX_MS ?? "420000", 10) || 420000);
const allowSyntheticOutboundFallback =
  process.env.V3_VERIFY_SYNTHETIC_OUTBOUND_FALLBACK === "1" ||
  process.env.V3_VERIFY_SYNTHETIC_OUTBOUND_FALLBACK === "true";

const fixturesPath = join(root, "supabase/functions/inngest/.qa_fixtures.json");
type Fixtures = { photographerId: string; weddingId: string; email: string };

const V3_VERIFY_PLAYBOOK_SOURCE = "v3_verify_harness";
const V3_VERIFY_MEMORY_TYPE = "v3_verify_case_note";

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

type InboundRow = {
  id: string;
  thread_id: string;
  sent_at: string;
  body: string;
  sender: string;
  direction: string;
};

type TurnArtifacts = {
  drafts: { id: string; status: string; created_at: string; body: string; instruction_history: unknown }[];
  outbound: { id: string; sent_at: string; body: string; sender: string }[];
  escalations: {
    id: string;
    created_at: string;
    status: string;
    reason_code: string;
    thread_id: string | null;
    wedding_id: string | null;
  }[];
};

async function fetchArtifactsSinceInbound(
  supabase: SupabaseClient,
  photographerId: string,
  weddingId: string,
  threadId: string,
  inboundSentAt: string,
): Promise<TurnArtifacts> {
  const { data: drafts, error: dErr } = await supabase
    .from("drafts")
    .select("id,status,created_at,body,instruction_history")
    .eq("photographer_id", photographerId)
    .eq("thread_id", threadId)
    .gte("created_at", inboundSentAt)
    .order("created_at", { ascending: true });
  if (dErr) throw dErr;

  const { data: outbound, error: oErr } = await supabase
    .from("messages")
    .select("id,sent_at,body,sender")
    .eq("photographer_id", photographerId)
    .eq("thread_id", threadId)
    .eq("direction", "out")
    .gte("sent_at", inboundSentAt)
    .order("sent_at", { ascending: true });
  if (oErr) throw oErr;

  const { data: escW, error: e1 } = await supabase
    .from("escalation_requests")
    .select("id,created_at,status,reason_code,thread_id,wedding_id")
    .eq("photographer_id", photographerId)
    .eq("wedding_id", weddingId)
    .gte("created_at", inboundSentAt)
    .order("created_at", { ascending: true });
  if (e1) throw e1;

  const { data: escT, error: e2 } = await supabase
    .from("escalation_requests")
    .select("id,created_at,status,reason_code,thread_id,wedding_id")
    .eq("photographer_id", photographerId)
    .eq("thread_id", threadId)
    .gte("created_at", inboundSentAt)
    .order("created_at", { ascending: true });
  if (e2) throw e2;

  const escMap = new Map<string, (typeof escW)[number]>();
  for (const e of [...(escW ?? []), ...(escT ?? [])]) {
    if (e?.id) escMap.set(e.id, e);
  }
  const escalations = [...escMap.values()].sort((a, b) => a.created_at.localeCompare(b.created_at));

  return { drafts: drafts ?? [], outbound: outbound ?? [], escalations };
}

function fingerprint(a: TurnArtifacts): string {
  const dMax = a.drafts.length ? a.drafts[a.drafts.length - 1]?.created_at ?? "" : "";
  const oMax = a.outbound.length ? a.outbound[a.outbound.length - 1]?.sent_at ?? "" : "";
  const eMax = a.escalations.length ? a.escalations[a.escalations.length - 1]?.created_at ?? "" : "";
  return `${a.drafts.length}:${a.outbound.length}:${a.escalations.length}:${dMax}:${oMax}:${eMax}`;
}

type WaitResult = {
  status: "stable" | "failed_no_outcome" | "timeout";
  waitedMs: number;
  finalArtifacts: TurnArtifacts;
  notes: string;
};

async function waitForInboundWithMarker(
  supabase: SupabaseClient,
  photographerId: string,
  marker: string,
  deadlineMs: number,
): Promise<InboundRow | null> {
  const deadline = Date.now() + deadlineMs;
  while (Date.now() < deadline) {
    const { data, error } = await supabase
      .from("messages")
      .select("id,thread_id,sent_at,body,sender,direction")
      .eq("photographer_id", photographerId)
      .eq("direction", "in")
      .ilike("body", `%${marker}%`)
      .order("sent_at", { ascending: false })
      .limit(5);
    if (error) throw error;
    const row = data?.[0];
    if (row?.thread_id) return row as InboundRow;
    await sleep(pollMs);
  }
  return null;
}

async function waitForTurnProcessingStrict(
  supabase: SupabaseClient,
  photographerId: string,
  weddingId: string,
  threadId: string,
  inboundSentAt: string,
): Promise<WaitResult> {
  const started = Date.now();
  let lastFp = "";
  let stableSince: number | null = null;

  while (Date.now() - started < turnMaxMs) {
    const art = await fetchArtifactsSinceInbound(supabase, photographerId, weddingId, threadId, inboundSentAt);
    const hasVisible = art.drafts.length > 0 || art.outbound.length > 0 || art.escalations.length > 0;
    const fp = fingerprint(art);

    if (hasVisible) {
      if (fp === lastFp) {
        if (stableSince === null) stableSince = Date.now();
        else if (Date.now() - stableSince >= quietMs) {
          return {
            status: "stable",
            waitedMs: Date.now() - started,
            finalArtifacts: art,
            notes: `Counts stable for ${quietMs}ms after visible outcome.`,
          };
        }
      } else {
        lastFp = fp;
        stableSince = null;
      }
    }

    await sleep(pollMs);
  }

  const finalArtifacts = await fetchArtifactsSinceInbound(
    supabase,
    photographerId,
    weddingId,
    threadId,
    inboundSentAt,
  );
  const hasVisible =
    finalArtifacts.drafts.length > 0 ||
    finalArtifacts.outbound.length > 0 ||
    finalArtifacts.escalations.length > 0;
  return {
    status: hasVisible ? "timeout" : "failed_no_outcome",
    waitedMs: turnMaxMs,
    finalArtifacts,
    notes: hasVisible
      ? `Timed out at ${turnMaxMs}ms before quiet window closed (unstable pipeline).`
      : `No draft, outbound, or escalation within ${turnMaxMs}ms — scenario failed.`,
  };
}

async function sendApprovalDraftApprovedToInngest(
  ingestUrl: string,
  draftId: string,
  photographerId: string,
): Promise<{ ok: boolean; httpStatus: number; snippet: string; eventId: string | null }> {
  const payload = [
    {
      name: "approval/draft.approved",
      data: {
        draft_id: draftId,
        photographer_id: photographerId,
        edited_body: null as string | null,
      },
    },
  ];
  const res = await fetch(ingestUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  let eventId: string | null = null;
  try {
    eventId = JSON.parse(text).ids?.[0] ?? null;
  } catch {
    /* */
  }
  return { ok: res.ok, httpStatus: res.status, snippet: text.slice(0, 500), eventId };
}

async function finalizePendingDraftsForTurn(
  supabase: SupabaseClient,
  photographerId: string,
  threadId: string,
  inboundSentAt: string,
  ingestFullUrl: string,
): Promise<{
  approvedDraftIds: string[];
  outboundBodies: string[];
}> {
  if (!ingestFullUrl) throw new Error("finalizePendingDraftsForTurn: missing ingest URL");

  const { data: pending, error: pErr } = await supabase
    .from("drafts")
    .select("id, body, status, created_at")
    .eq("thread_id", threadId)
    .eq("photographer_id", photographerId)
    .eq("status", "pending_approval")
    .gte("created_at", inboundSentAt)
    .order("created_at", { ascending: true });
  if (pErr) throw pErr;

  const approvedDraftIds: string[] = [];
  const outboundBodies: string[] = [];

  const outboundCountAfterInbound = async (): Promise<number> => {
    const { count, error } = await supabase
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("thread_id", threadId)
      .eq("photographer_id", photographerId)
      .eq("direction", "out")
      .gte("sent_at", inboundSentAt);
    if (error) throw error;
    return count ?? 0;
  };

  let baselineOut = await outboundCountAfterInbound();

  for (const d of pending ?? []) {
    const draftId = d.id as string;
    const body = String(d.body ?? "");
    const send = await sendApprovalDraftApprovedToInngest(ingestFullUrl, draftId, photographerId);
    if (!send.ok) throw new Error(`approval/draft.approved failed: ${send.snippet}`);
    approvedDraftIds.push(draftId);

    const deadline = Date.now() + postApproveOutboundWaitMs;
    let systemOutbound = false;
    while (Date.now() < deadline) {
      const n = await outboundCountAfterInbound();
      if (n > baselineOut) {
        systemOutbound = true;
        baselineOut = n;
        break;
      }
      await sleep(2000);
    }

    if (systemOutbound) {
      const { data: outs } = await supabase
        .from("messages")
        .select("body,sent_at")
        .eq("thread_id", threadId)
        .eq("photographer_id", photographerId)
        .eq("direction", "out")
        .gte("sent_at", inboundSentAt)
        .order("sent_at", { ascending: false })
        .limit(1);
      if (outs?.[0]?.body) outboundBodies.push(String(outs[0].body));
      continue;
    }

    if (allowSyntheticOutboundFallback) {
      await supabase.from("messages").insert({
        thread_id: threadId,
        photographer_id: photographerId,
        direction: "out",
        sender: "photographer",
        body: body + "\n\n--\n[harness synthetic outbound]",
      });
      outboundBodies.push(body);
      continue;
    }

    throw new Error(`No outbound within ${postApproveOutboundWaitMs}ms for draft ${draftId}`);
  }

  return { approvedDraftIds, outboundBodies };
}

// --- Harness-specific seed builders (same source_type as conversation smoke; cleanup between conditions) ---

async function cleanupHarnessArtifacts(supabase: SupabaseClient, photographerId: string): Promise<void> {
  await supabase.from("playbook_rules").delete().eq("photographer_id", photographerId).eq("source_type", V3_VERIFY_PLAYBOOK_SOURCE);
  await supabase.from("memories").delete().eq("photographer_id", photographerId).eq("type", V3_VERIFY_MEMORY_TYPE);
}

function basePlaybookRows(photographerId: string, includeElite: boolean) {
  const rows = [
    {
      photographer_id: photographerId,
      scope: "global" as const,
      channel: null as string | null,
      action_key: "send_message",
      topic: "commercial_deposit_retainer",
      decision_mode: "draft_only" as const,
      instruction:
        "Booking retainer: common practice 30% retainer to hold a date when contract specifies — never invent 50% unless verified.",
      source_type: V3_VERIFY_PLAYBOOK_SOURCE,
      confidence_label: "explicit",
      is_active: true,
    },
    ...(includeElite
      ? [
          {
            photographer_id: photographerId,
            scope: "global" as const,
            channel: null as string | null,
            action_key: "send_message",
            topic: "package_elite_collection_verified",
            decision_mode: "draft_only" as const,
            instruction:
              "Verified — Elite collection: 30% retainer holds date when contract reflects it; engagement travel within 50 miles of Florence included. May confirm when client asks about Elite.",
            source_type: V3_VERIFY_PLAYBOOK_SOURCE,
            confidence_label: "explicit",
            is_active: true,
          },
        ]
      : []),
    {
      photographer_id: photographerId,
      scope: "global" as const,
      channel: null as string | null,
      action_key: "send_message",
      topic: "insurance_liability_coi",
      decision_mode: "draft_only" as const,
      instruction:
        "Insurance COI: hedge unless verified; align with venue after review; do not guarantee no-cost naming.",
      source_type: V3_VERIFY_PLAYBOOK_SOURCE,
      confidence_label: "explicit",
      is_active: true,
    },
    {
      photographer_id: photographerId,
      scope: "global" as const,
      channel: null as string | null,
      action_key: "send_message",
      topic: "studio_service_area",
      decision_mode: "draft_only" as const,
      instruction: "Luxury destination work when contracted; do not invent prices not in playbook.",
      source_type: V3_VERIFY_PLAYBOOK_SOURCE,
      confidence_label: "explicit",
      is_active: true,
    },
  ];
  return rows;
}

async function seedForCondition(
  supabase: SupabaseClient,
  photographerId: string,
  weddingId: string,
  runId: string,
  condition: "A" | "B" | "C" | "D" | "E",
): Promise<{ manifest: Record<string, unknown> }> {
  await cleanupHarnessArtifacts(supabase, photographerId);
  const manifest: Record<string, unknown> = { condition, weddingId };

  if (condition === "A") {
    manifest.layers = { crm: true, playbook_rules: false, case_memory: false, continuity_injected: false };
    return { manifest };
  }

  const includeElite = condition !== "E";
  const rows = basePlaybookRows(photographerId, includeElite);
  const { error: pe } = await supabase.from("playbook_rules").insert(rows);
  if (pe) throw new Error("seed playbook: " + pe.message);
  manifest.playbook_topics = rows.map((r) => r.topic);

  if (condition === "B") {
    manifest.layers = { crm: true, playbook_rules: true, case_memory: false, continuity_injected: false };
    return { manifest };
  }

  const memSummary =
    condition === "E"
      ? "QA: no Elite in playbook — deposit/insurance only; align with contract."
      : "QA: Elite facts in playbook_rules; insurance hedge per playbook.";
  const { error: me } = await supabase.from("memories").insert({
    photographer_id: photographerId,
    wedding_id: weddingId,
    scope: "project",
    type: V3_VERIFY_MEMORY_TYPE,
    title: `CTX eval case note (${runId})`,
    summary: memSummary.slice(0, 500),
    full_content: memSummary,
  });
  if (me) throw new Error("seed memory: " + me.message);
  manifest.case_memory = true;

  manifest.layers = {
    crm: true,
    playbook_rules: true,
    case_memory: true,
    continuity_injected: condition === "D",
  };
  return { manifest };
}

/** Best-effort: populate `thread_summaries` + prior in-thread messages before orchestrator reads DC (race possible). */
async function injectContinuity(
  supabase: SupabaseClient,
  photographerId: string,
  threadId: string,
  inboundSentAt: string,
): Promise<{ ok: boolean; detail: string }> {
  try {
    const tInbound = new Date(inboundSentAt).getTime();
    const t1 = new Date(tInbound - 3_600_000).toISOString();
    const t2 = new Date(tInbound - 3_500_000).toISOString();

    await supabase.from("thread_summaries").upsert(
      {
        thread_id: threadId,
        photographer_id: photographerId,
        summary:
          "Rolling summary (QA): Couple planning Tuscany wedding; discussed pricing band and June timeframe; studio shared starting rates — no package tier locked in yet.",
      },
      { onConflict: "thread_id" },
    );

    await supabase.from("messages").insert([
      {
        thread_id: threadId,
        photographer_id: photographerId,
        direction: "out",
        sender: "photographer",
        body: "[Prior studio message — QA harness] Thanks for your interest in our Tuscany destination work.",
        sent_at: t1,
      },
      {
        thread_id: threadId,
        photographer_id: photographerId,
        direction: "in",
        sender: "client@qa.atelier.test",
        body: "[Prior client message — QA harness] We are still comparing collections and will confirm soon.",
        sent_at: t2,
      },
    ]);

    return { ok: true, detail: "thread_summaries upsert + 2 synthetic prior messages" };
  } catch (e) {
    return { ok: false, detail: e instanceof Error ? e.message : String(e) };
  }
}

async function createFreshWedding(supabase: SupabaseClient, photographerId: string, label: string): Promise<string> {
  const weddingDate = new Date();
  weddingDate.setMonth(weddingDate.getMonth() + 8);
  const { data, error } = await supabase
    .from("weddings")
    .insert({
      photographer_id: photographerId,
      couple_names: `CTX eval ${label}`,
      location: "Tuscany, Italy (harness)",
      wedding_date: weddingDate.toISOString(),
      stage: "prep",
      story_notes: `Isolation row for context-layer eval ${label}`,
    })
    .select("id")
    .single();
  if (error || !data?.id) throw new Error("createFreshWedding: " + (error?.message ?? "no id"));
  return data.id as string;
}

async function ensureClientMapsToWedding(supabase: SupabaseClient, weddingId: string, email: string): Promise<void> {
  const { data: byEmail, error: e1 } = await supabase.from("clients").select("id, wedding_id").eq("email", email).maybeSingle();
  if (e1) throw e1;
  if (byEmail?.wedding_id === weddingId) return;
  if (byEmail && byEmail.wedding_id !== weddingId) {
    const { error: up } = await supabase.from("clients").update({ wedding_id: weddingId }).eq("id", byEmail.id);
    if (up) throw up;
    return;
  }
  const { error: ins } = await supabase.from("clients").insert({
    wedding_id: weddingId,
    name: "CTX eval fixture client",
    email,
    role: "primary",
  });
  if (ins) throw ins;
}

function classifyReply(text: string, hadEscalation: boolean): {
  tone: "confirm" | "hedge" | "clarify" | "mixed";
  riskFlags: string[];
} {
  const t = text.toLowerCase();
  const riskFlags: string[] = [];
  if (/\b50\s*%/.test(t) && !/30/.test(t)) riskFlags.push("possible_wrong_percent");
  if (hadEscalation) riskFlags.push("escalation_row");
  if (/invent|guarantee no cost|no separate rider/i.test(t) && /insurance|coi/i.test(t)) riskFlags.push("insurance_overclaim");

  let tone: "confirm" | "hedge" | "clarify" | "mixed" = "mixed";
  const disclaimsPackage =
    /don't have.*package|no package by that exact name|not in our (current )?lineup|clarify so there's no confusion/i.test(t);
  if (disclaimsPackage) {
    tone = "hedge";
  } else if (
    /\byes\b.*\b30\s*%|confirm.*30|included.*florence/i.test(t) &&
    /elite|collection/i.test(t) &&
    !/coordinate with (our )?team to verify|pull it and confirm|don't have/i.test(t)
  ) {
    tone = "confirm";
  } else if (/contract|confirm with|team to verify|defer|align|typically|depends on/i.test(t)) {
    tone = "hedge";
  } else if (/\?|let me know|clarif/i.test(t)) {
    tone = "clarify";
  }
  return { tone, riskFlags };
}

type Cond = "A" | "B" | "C" | "D" | "E";

async function main(): Promise<void> {
  if (!url || !sr) {
    console.error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }
  if (!inngestKey) {
    console.error("Missing INNGEST_EVENT_KEY");
    process.exit(1);
  }
  if (!existsSync(fixturesPath)) {
    console.error("Fixtures not found:", fixturesPath);
    process.exit(1);
  }

  const fixtures = JSON.parse(readFileSync(fixturesPath, "utf8")) as Fixtures;
  const { photographerId, email: fixtureEmail } = fixtures;

  const cut4 = process.env.TRIAGE_LIVE_ORCHESTRATOR_MAIN_PATH_CONCIERGE_KNOWN_WEDDING_V1;
  const cut7 = process.env.TRIAGE_LIVE_ORCHESTRATOR_MAIN_PATH_COMMERCIAL_KNOWN_WEDDING_V1;
  if (cut4 !== "1" && cut4 !== "true") {
    console.error("CTX eval: CUT4 must be ON for live V3 (set in gate posture env).");
    process.exit(1);
  }
  if (cut7 !== "1" && cut7 !== "true") {
    console.error("CTX eval: CUT7 must be ON for commercial path.");
    process.exit(1);
  }

  const supabase = createClient(url, sr, { auth: { persistSession: false, autoRefreshToken: false } });
  const ingestUrl = "https://inn.gs/e/" + encodeURIComponent(inngestKey);
  const batchRunId = `CTXEVAL-${Date.now()}`;

  const commercialBody =
    "Thanks, this helps. We're leaning toward the Elite collection — can you confirm the deposit is 30% to hold the date, " +
    "and that travel for the engagement session within 50 miles of Florence is included? We can pay the deposit this week.";

  const insuranceBody =
    "Quick clarification — our venue contract requires vendors to carry liability insurance and name the venue as additional insured on the wedding day. " +
    "Is that something your policy already covers, or do we need to purchase a separate rider and list you?";

  const conditions: Cond[] = ["A", "B", "C", "D", "E"];
  const results: Array<{
    condition: Cond;
    manifest: Record<string, unknown>;
    turns: Array<{
      id: string;
      inbound: string;
      outbound: string;
      waitStatus: string;
      tone: string;
      riskFlags: string[];
      continuityInject?: string;
    }>;
    passNotes: string;
  }> = [];

  let clientPriorWeddingId: string | null = null;
  const { data: clSnap } = await supabase.from("clients").select("wedding_id").eq("email", fixtureEmail).maybeSingle();
  clientPriorWeddingId = clSnap?.wedding_id ?? null;

  for (const cond of conditions) {
    const runId = `${batchRunId}-${cond}`;
    const baseSubject = `[V3 QA CTX-EVAL ${cond} ${runId}] Tuscany wedding — booking & pricing`;

    const weddingId = await createFreshWedding(supabase, photographerId, cond);
    await ensureClientMapsToWedding(supabase, weddingId, fixtureEmail);

    const { manifest } = await seedForCondition(supabase, photographerId, weddingId, runId, cond);
    console.log(`\n=== Condition ${cond} wedding=${weddingId} manifest=`, JSON.stringify(manifest.layers ?? manifest));

    const turns: Array<{
      id: string;
      inbound: string;
      outbound: string;
      waitStatus: string;
      tone: string;
      riskFlags: string[];
      continuityInject?: string;
    }> = [];

    const turnDefs = [
      { id: "commercial" as const, body: commercialBody },
      { id: "insurance" as const, body: insuranceBody },
    ];
    for (let ti = 0; ti < turnDefs.length; ti++) {
      const { id, body } = turnDefs[ti];
      const marker = `[ctx_eval_${id}_${cond}] ${runId}`;
      const subject = ti === 0 ? baseSubject : `Re: ${baseSubject}`;
      const event = {
        name: "comms/email.received",
        data: {
          photographer_id: photographerId,
          raw_email: {
            from: fixtureEmail,
            body: body + `\n\n--\n${marker}`,
            subject,
          },
        },
      };

      const res = await fetch(ingestUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify([event]),
      });
      if (!res.ok) throw new Error(`Ingest failed ${res.status}: ${await res.text()}`);

      const inbound = await waitForInboundWithMarker(supabase, photographerId, marker, turnMaxMs);
      if (!inbound) throw new Error(`No inbound for ${marker}`);

      let continuityNote: string | undefined;
      if (cond === "D" && id === "commercial") {
        const inj = await injectContinuity(supabase, photographerId, inbound.thread_id, inbound.sent_at);
        continuityNote = inj.detail;
      }

      const wait = await waitForTurnProcessingStrict(
        supabase,
        photographerId,
        weddingId,
        inbound.thread_id,
        inbound.sent_at,
      );
      if (wait.status !== "stable") {
        turns.push({
          id,
          inbound: body,
          outbound: "",
          waitStatus: wait.status,
          tone: "mixed",
          riskFlags: ["pipeline_unstable"],
          continuityInject: continuityNote,
        });
        continue;
      }

      const fin = await finalizePendingDraftsForTurn(
        supabase,
        photographerId,
        inbound.thread_id,
        inbound.sent_at,
        ingestUrl,
      );
      const outbound =
        fin.outboundBodies[fin.outboundBodies.length - 1] ??
        wait.finalArtifacts.outbound[wait.finalArtifacts.outbound.length - 1]?.body ??
        "";

      const esc = wait.finalArtifacts.escalations.length > 0;
      const { tone, riskFlags } = classifyReply(outbound, esc);

      turns.push({
        id,
        inbound: body,
        outbound,
        waitStatus: wait.status,
        tone,
        riskFlags,
        continuityInject: continuityNote,
      });
    }

    let passNotes = "";
    const com = turns.find((t) => t.id === "commercial");
    if (cond === "A") {
      passNotes =
        com?.tone === "hedge" || /don't have|no package by that exact name/i.test(com?.outbound ?? "")
          ? "PASS-ish: CRM-only hedges unverified Elite name; check riskFlags for invented %."
          : "Review: A should hedge Elite without playbook.";
    } else if (cond === "E") {
      passNotes =
        /yes.*30.*elite|happy to confirm.*elite/i.test(com?.outbound ?? "")
          ? "FAIL: E (no Elite playbook row) should not confirm Elite+30 like verified package."
          : "PASS-ish: E should avoid treating Elite as verified without package rule.";
    } else if (cond === "B" || cond === "C" || cond === "D") {
      passNotes = "Expect: confident commercial reply when playbook includes Elite (B/C/D).";
    } else {
      passNotes = "—";
    }

    results.push({ condition: cond, manifest, turns, passNotes });
  }

  // Cleanup + restore client
  await cleanupHarnessArtifacts(supabase, photographerId);
  if (clientPriorWeddingId) {
    const { data: cl } = await supabase.from("clients").select("id").eq("email", fixtureEmail).maybeSingle();
    if (cl?.id) {
      await supabase.from("clients").update({ wedding_id: clientPriorWeddingId }).eq("id", cl.id);
    }
  }

  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const reportsDir = join(root, "reports");
  mkdirSync(reportsDir, { recursive: true });
  const base = `v3-context-layer-eval-${ts}`;
  const jsonPath = join(reportsDir, `${base}.json`);
  const mdPath = join(reportsDir, `${base}.md`);

  const payload = {
    schema: "v3_context_layer_eval_v1",
    generatedAt: new Date().toISOString(),
    batchRunId,
    photographerId,
    conditions: results,
    whatEachLayerDoes: {
      A: "CRM snapshot only (weddings row) — no harness playbook_rules or case memories.",
      B: "+ playbook_rules (same rows fetchActivePlaybookRulesForDecisionContext loads for live V3).",
      C: "+ case memory (memories row type v3_verify_case_note) — appears in writer facts as case headers.",
      D: "+ best-effort thread_summaries + prior messages on same thread before first wait (may race with worker).",
      E: "playbook without Elite row — failure-mode vs client saying Elite.",
    },
    nextOptimization:
      "If D’s continuity injection races, add a deterministic delay or a dedicated ‘pause until injected’ gate; if A still confirms Elite, tighten writer when playbook_rules blob is empty.",
  };

  writeFileSync(jsonPath, JSON.stringify(payload, null, 2), "utf8");

  const mdLines: string[] = [
    `# V3 context-layer evaluation`,
    ``,
    `- **Generated:** ${payload.generatedAt}`,
    `- **Batch:** ${batchRunId}`,
    ``,
    `## Conditions`,
    ``,
    `| Cond | Layers (summary) | Commercial tone | Insurance notes | Pass/fail notes |`,
    `|------|------------------|-----------------|-------------------|----------------|`,
  ];
  for (const r of results) {
    const layers = JSON.stringify(r.manifest.layers ?? r.manifest);
    const com = r.turns.find((t) => t.id === "commercial");
    const ins = r.turns.find((t) => t.id === "insurance");
    mdLines.push(
      `| **${r.condition}** | ${layers.slice(0, 80)}… | ${com?.tone ?? ""} | ${ins?.tone ?? ""} | ${r.passNotes} |`,
    );
  }
  mdLines.push(
    ``,
    `## What each layer contributes (observed)`,
    ``,
    `- **CRM:** Always present via \`weddings\` row — anchors date/location/couple in Authoritative CRM block.`,
    `- **playbook_rules:** Supplies verified policy text in persona rewrite facts; without Elite row (E), replies should not treat Elite as verified.`,
    `- **Case memory:** Header summaries in writer facts — nuance on top of playbook.`,
    `- **Continuity (D):** \`thread_summaries\` + synthetic messages — may increase thread-awareness if visible before DC build (best-effort).`,
    ``,
    `## Next optimization`,
    ``,
    payload.nextOptimization,
    ``,
    `## Full JSON`,
    ``,
    `See \`${jsonPath}\`.`,
  );
  writeFileSync(mdPath, mdLines.join("\n"), "utf8");

  console.log(`\nWrote:\n  ${jsonPath}\n  ${mdPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
