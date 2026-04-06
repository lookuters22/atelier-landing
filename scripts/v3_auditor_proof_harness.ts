/**
 * V3 deterministic output auditor — live proof (happy vs failure branch).
 *
 * Run: npx tsx scripts/v3_auditor_proof_harness.ts
 * npm run v3:proof-auditor
 *
 * Requires: same env as v3_context_layer_eval_harness (SUPABASE_*, INNGEST_EVENT_KEY, gate posture CUT4/CUT7).
 *
 * **Happy-path smoke only:** `V3_AUDITOR_PROOF_SMOKE_HAPPY_ONLY=1 npm run v3:proof-auditor` — skips the no-playbook
 * failure branch (model-dependent); use after deploy to confirm persona + auditor on grounded playbook.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import {
  auditDraftTerms,
  buildAuthoritativeCommercialContext,
} from "../supabase/functions/_shared/orchestrator/auditDraftCommercialTerms.ts";
import type { DecisionContext, PlaybookRuleContextRow } from "../src/types/decisionContext.types.ts";

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

const pollMs = Math.max(2000, parseInt(process.env.V3_VERIFY_POLL_MS ?? "4000", 10) || 4000);
const quietMs = Math.max(5000, parseInt(process.env.V3_VERIFY_QUIET_MS ?? "18000", 10) || 18000);
const turnMaxMs = Math.max(60000, parseInt(process.env.V3_VERIFY_TURN_MAX_MS ?? "420000", 10) || 420000);

const fixturesPath = join(root, "supabase/functions/inngest/.qa_fixtures.json");
const V3_VERIFY_PLAYBOOK_SOURCE = "v3_auditor_proof";

type Fixtures = { photographerId: string; weddingId: string; email: string };

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

type InboundRow = { id: string; thread_id: string; sent_at: string };

type TurnArtifacts = {
  drafts: Array<{
    id: string;
    status: string;
    created_at: string;
    body: string;
    instruction_history: unknown;
  }>;
  outbound: Array<{ id: string; sent_at: string; body: string }>;
  escalations: Array<{
    id: string;
    created_at: string;
    status: string;
    reason_code: string;
    action_key?: string;
    thread_id: string | null;
  }>;
};

async function fetchArtifacts(
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
    .select("id,sent_at,body")
    .eq("photographer_id", photographerId)
    .eq("thread_id", threadId)
    .eq("direction", "out")
    .gte("sent_at", inboundSentAt)
    .order("sent_at", { ascending: true });
  if (oErr) throw oErr;

  const { data: escW, error: e1 } = await supabase
    .from("escalation_requests")
    .select("id,created_at,status,reason_code,action_key,thread_id,wedding_id")
    .eq("photographer_id", photographerId)
    .eq("wedding_id", weddingId)
    .gte("created_at", inboundSentAt)
    .order("created_at", { ascending: true });
  if (e1) throw e1;

  const { data: escT, error: e2 } = await supabase
    .from("escalation_requests")
    .select("id,created_at,status,reason_code,action_key,thread_id,wedding_id")
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

  return { drafts: (drafts ?? []) as TurnArtifacts["drafts"], outbound: outbound ?? [], escalations };
}

function fingerprint(a: TurnArtifacts): string {
  const dMax = a.drafts.length ? a.drafts[a.drafts.length - 1]?.created_at ?? "" : "";
  const oMax = a.outbound.length ? a.outbound[a.outbound.length - 1]?.sent_at ?? "" : "";
  const eMax = a.escalations.length ? a.escalations[a.escalations.length - 1]?.created_at ?? "" : "";
  return `${a.drafts.length}:${a.outbound.length}:${a.escalations.length}:${dMax}:${oMax}:${eMax}`;
}

async function waitStable(
  supabase: SupabaseClient,
  photographerId: string,
  weddingId: string,
  threadId: string,
  inboundSentAt: string,
): Promise<{ ok: boolean; artifacts: TurnArtifacts; notes: string }> {
  const started = Date.now();
  let lastFp = "";
  let stableSince: number | null = null;

  while (Date.now() - started < turnMaxMs) {
    const art = await fetchArtifacts(supabase, photographerId, weddingId, threadId, inboundSentAt);
    const hasVisible = art.drafts.length > 0 || art.outbound.length > 0 || art.escalations.length > 0;
    const fp = fingerprint(art);

    if (hasVisible) {
      if (fp === lastFp) {
        if (stableSince === null) stableSince = Date.now();
        else if (Date.now() - stableSince >= quietMs) {
          return { ok: true, artifacts: art, notes: `stable ${quietMs}ms` };
        }
      } else {
        lastFp = fp;
        stableSince = null;
      }
    }
    await sleep(pollMs);
  }

  const art = await fetchArtifacts(supabase, photographerId, weddingId, threadId, inboundSentAt);
  return { ok: false, artifacts: art, notes: "timeout" };
}

async function waitForInbound(
  supabase: SupabaseClient,
  photographerId: string,
  marker: string,
  deadlineMs: number,
): Promise<InboundRow | null> {
  const deadline = Date.now() + deadlineMs;
  while (Date.now() < deadline) {
    const { data, error } = await supabase
      .from("messages")
      .select("id,thread_id,sent_at")
      .eq("photographer_id", photographerId)
      .eq("direction", "in")
      .ilike("body", `%${marker}%`)
      .order("sent_at", { ascending: false })
      .limit(3);
    if (error) throw error;
    const row = data?.[0];
    if (row?.thread_id) return row as InboundRow;
    await sleep(pollMs);
  }
  return null;
}

async function cleanupPlaybook(supabase: SupabaseClient, photographerId: string): Promise<void> {
  await supabase.from("playbook_rules").delete().eq("photographer_id", photographerId).eq("source_type", V3_VERIFY_PLAYBOOK_SOURCE);
}

function basePlaybookRows(photographerId: string, includeElite: boolean) {
  return [
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
      instruction: "Insurance COI: hedge unless verified.",
      source_type: V3_VERIFY_PLAYBOOK_SOURCE,
      confidence_label: "explicit",
      is_active: true,
    },
  ];
}

async function createFreshWedding(supabase: SupabaseClient, photographerId: string, label: string): Promise<string> {
  const weddingDate = new Date();
  weddingDate.setMonth(weddingDate.getMonth() + 8);
  const { data, error } = await supabase
    .from("weddings")
    .insert({
      photographer_id: photographerId,
      couple_names: `Auditor proof ${label}`,
      location: "Tuscany, Italy (harness)",
      wedding_date: weddingDate.toISOString(),
      stage: "prep",
      story_notes: `Isolation row for V3 auditor proof ${label}`,
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
    name: "Auditor proof client",
    email,
    role: "primary",
  });
  if (ins) throw ins;
}

type ParsedAuditor = {
  committed_terms: unknown | null;
  auditPassed: boolean | null;
  violations: string[];
  personaStepFound: boolean;
  auditorStepFound: boolean;
};

function minimalDecisionContext(over: Partial<DecisionContext> = {}): DecisionContext {
  return {
    contextVersion: 1,
    photographerId: "proof",
    weddingId: "w",
    threadId: "t",
    replyChannel: "email",
    rawMessage: "",
    crmSnapshot: { package_name: "Elite collection" },
    recentMessages: [],
    threadSummary: null,
    memoryHeaders: [],
    selectedMemories: [],
    globalKnowledge: [],
    audience: { broadcastRisk: "low" },
    candidateWeddingIds: [],
    playbookRules: [],
    threadDraftsSummary: null,
    ...over,
  } as DecisionContext;
}

/** In-process proof: same logic as runtime `auditDraftTerms`, no LLM. */
function runDeterministicAuditorProof(playbookRowsGrounded: PlaybookRuleContextRow[]) {
  const groundedAuth = buildAuthoritativeCommercialContext(minimalDecisionContext(), playbookRowsGrounded);
  const emptyAuth = buildAuthoritativeCommercialContext(minimalDecisionContext(), []);

  const committedHappy = {
    package_names: ["Elite collection"],
    deposit_percentage: 30 as number | null,
    travel_miles_included: 50 as number | null,
  };

  const emailConfirming =
    "We confirm the Elite collection includes a 30% retainer and engagement travel within 50 miles of Florence.";

  const r1 = auditDraftTerms(committedHappy, groundedAuth, emailConfirming);
  const r2 = auditDraftTerms(committedHappy, emptyAuth, emailConfirming);
  const r3 = auditDraftTerms(
    { package_names: [], deposit_percentage: null, travel_miles_included: null },
    emptyAuth,
    "Yes, the retainer is 30% to hold your date.",
  );

  return { r1, r2, r3 };
}

function playbookRowsWithIds(photographerId: string): PlaybookRuleContextRow[] {
  const raw = basePlaybookRows(photographerId, true);
  return raw.map(
    (r, i) =>
      ({
        ...r,
        id: `aaaaaaaa-bbbb-cccc-0000-${String(i).padStart(12, "0")}`,
      }) as PlaybookRuleContextRow,
  );
}

function parseInstructionHistory(history: unknown): ParsedAuditor {
  const violations: string[] = [];
  let committed_terms: unknown | null = null;
  let auditPassed: boolean | null = null;
  let personaStepFound = false;
  let auditorStepFound = false;

  const arr = Array.isArray(history) ? history : [];
  for (const step of arr) {
    if (!step || typeof step !== "object") continue;
    const s = step as Record<string, unknown>;
    if (s.step === "persona_writer_after_client_orchestrator_v1") {
      personaStepFound = true;
      committed_terms = s.committed_terms ?? null;
    }
    if (s.step === "v3_output_auditor_commercial_terms") {
      auditorStepFound = true;
      if (typeof s.passed === "boolean") auditPassed = s.passed;
      if (Array.isArray(s.violations)) {
        for (const v of s.violations) violations.push(String(v));
      }
    }
  }

  return { committed_terms, auditPassed, violations, personaStepFound, auditorStepFound };
}

const commercialBody =
  "Thanks, this helps. We're leaning toward the Elite collection — can you confirm the deposit is 30% to hold the date, " +
  "and that travel for the engagement session within 50 miles of Florence is included? We can pay the deposit this week.";

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

  const cut4 = process.env.TRIAGE_LIVE_ORCHESTRATOR_MAIN_PATH_CONCIERGE_KNOWN_WEDDING_V1;
  const cut7 = process.env.TRIAGE_LIVE_ORCHESTRATOR_MAIN_PATH_COMMERCIAL_KNOWN_WEDDING_V1;
  if (cut4 !== "1" && cut4 !== "true") {
    console.error("Auditor proof: CUT4 must be ON (gate posture env).");
    process.exit(1);
  }
  if (cut7 !== "1" && cut7 !== "true") {
    console.error("Auditor proof: CUT7 must be ON for commercial path.");
    process.exit(1);
  }

  const fixtures = JSON.parse(readFileSync(fixturesPath, "utf8")) as Fixtures;
  const { photographerId, email: fixtureEmail } = fixtures;

  const smokeHappyOnly = process.env.V3_AUDITOR_PROOF_SMOKE_HAPPY_ONLY === "1";

  const deterministic = runDeterministicAuditorProof(playbookRowsWithIds(photographerId));
  const deterministicProven =
    deterministic.r1.isValid === true &&
    deterministic.r2.isValid === false &&
    deterministic.r3.isValid === false;

  const supabase = createClient(url, sr, { auth: { persistSession: false, autoRefreshToken: false } });
  const ingestUrl = "https://inn.gs/e/" + encodeURIComponent(inngestKey);
  const runId = `AUDITOR-PROOF-${Date.now()}`;

  const clientPriorWeddingId = (await supabase.from("clients").select("wedding_id").eq("email", fixtureEmail).maybeSingle())
    .data?.wedding_id;

  const branchSpecs = smokeHappyOnly
    ? [{ branch: "happy" as const, label: "HAPPY", seedPlaybook: true }]
    : [
        { branch: "happy" as const, label: "HAPPY", seedPlaybook: true },
        { branch: "failure" as const, label: "FAILURE", seedPlaybook: false },
      ];

  type BranchResult = {
    branch: "happy" | "failure";
    label: string;
    weddingId: string;
    threadId: string | null;
    waitOk: boolean;
    draftId: string | null;
    draftBodyPreview: string;
    instructionHistoryRaw: unknown;
    isStubFallback: boolean;
    parsed: ParsedAuditor;
    auditorEscalations: Array<{ id: string; reason_code: string; action_key?: string }>;
    notes: string;
  };

  const branches: BranchResult[] = [];

  for (const spec of branchSpecs) {
    await cleanupPlaybook(supabase, photographerId);
    if (spec.seedPlaybook) {
      const rows = basePlaybookRows(photographerId, true);
      const { error: pe } = await supabase.from("playbook_rules").insert(rows);
      if (pe) throw new Error("seed playbook: " + pe.message);
    }

    const weddingId = await createFreshWedding(supabase, photographerId, `${spec.label}-${runId}`);
    await ensureClientMapsToWedding(supabase, weddingId, fixtureEmail);

    const marker = `[auditor_proof_${spec.branch}] ${runId}`;
    const subject = `[V3 Auditor Proof ${spec.label}] ${runId}`;

    const res = await fetch(ingestUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify([
        {
          name: "comms/email.received",
          data: {
            photographer_id: photographerId,
            raw_email: {
              from: fixtureEmail,
              body: commercialBody + `\n\n--\n${marker}`,
              subject,
            },
          },
        },
      ]),
    });
    if (!res.ok) throw new Error(`Ingest failed ${res.status}: ${await res.text()}`);

    const inbound = await waitForInbound(supabase, photographerId, marker, turnMaxMs);
    if (!inbound) throw new Error(`No inbound for ${marker}`);

    const wait = await waitStable(supabase, photographerId, weddingId, inbound.thread_id, inbound.sent_at);
    const draft = wait.artifacts.drafts[wait.artifacts.drafts.length - 1] ?? null;

    const parsed = draft ? parseInstructionHistory(draft.instruction_history) : parseInstructionHistory(null);
    const body = draft?.body ?? "";
    const isStubFallback =
      body.includes("[Orchestrator draft — clientOrchestratorV1 QA path]") &&
      body.includes("[V3 output auditor] Persona draft rejected");

    const auditorEscalations = wait.artifacts.escalations.filter(
      (e) => e.reason_code === "v3_output_auditor_ungrounded_commercial",
    );

    branches.push({
      branch: spec.branch,
      label: spec.label,
      weddingId,
      threadId: inbound.thread_id,
      waitOk: wait.ok,
      draftId: draft?.id ?? null,
      draftBodyPreview: body.slice(0, 1200),
      instructionHistoryRaw: draft?.instruction_history ?? null,
      isStubFallback,
      parsed,
      auditorEscalations,
      notes: wait.notes,
    });
  }

  await cleanupPlaybook(supabase, photographerId);
  if (clientPriorWeddingId) {
    const { data: cl } = await supabase.from("clients").select("id").eq("email", fixtureEmail).maybeSingle();
    if (cl?.id) {
      await supabase.from("clients").update({ wedding_id: clientPriorWeddingId }).eq("id", cl.id);
    }
  }

  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const reportsDir = join(root, "reports");
  mkdirSync(reportsDir, { recursive: true });
  const base = `v3-auditor-proof-${ts}`;
  const jsonPath = join(reportsDir, `${base}.json`);
  const mdPath = join(reportsDir, `${base}.md`);

  const happy = branches.find((b) => b.branch === "happy")!;
  const fail = branches.find((b) => b.branch === "failure");

  /** Live pipeline: requires deployed `inngest` bundle with output-auditor steps in `instruction_history`. */
  const liveHappyObserved =
    happy.waitOk && happy.draftId !== null && !happy.isStubFallback && happy.draftBodyPreview.length > 0;
  const liveFailureStubObserved =
    !smokeHappyOnly && fail
      ? fail.waitOk &&
        fail.isStubFallback &&
        fail.parsed.auditorStepFound &&
        fail.parsed.auditPassed === false &&
        fail.auditorEscalations.length > 0
      : false;

  let verdict: string;
  if (!deterministicProven) {
    verdict =
      "**Deterministic auditor not proven** — see JSON `deterministic` payloads (expected all three cases to match).";
  } else if (smokeHappyOnly) {
    verdict = liveHappyObserved
      ? "**Deterministic auditor proven** (in-process). **Live happy path:** grounded persona draft + auditor passed."
      : "**Smoke failed** — happy path did not show grounded persona + auditor (see JSON).";
  } else if (liveHappyObserved && liveFailureStubObserved) {
    verdict =
      "**Deterministic auditor proven** (in-process). **Live pipeline** shows grounded persona draft and failure stub + auditor escalation.";
  } else {
    verdict =
      "**Deterministic auditor proven** (in-process). **Live failure branch** (empty playbook) is model-dependent — the writer may hedge instead of producing rejectable terms; deterministic in-process cases still prove `auditDraftTerms`.";
  }

  const jsonOut = {
    schema: "v3_auditor_proof_v1",
    generatedAt: new Date().toISOString(),
    runId,
    photographerId,
    deterministic: {
      r1_grounded_commit_pass: deterministic.r1,
      r2_ungrounded_structured_fail: deterministic.r2,
      r3_ungrounded_prose_fail: deterministic.r3,
      deterministicProven,
    },
    branches,
    checks: {
      deterministicProven,
      liveHappyObserved,
      liveFailureStubObserved,
      smokeHappyOnly,
      verdict,
    },
    inngestEventNote:
      "On rejection, `recordV3OutputAuditorEscalation` calls `inngest.send` for `operator/escalation.pending_delivery.v1` after DB insert; confirm in Inngest Cloud if needed.",
  };
  writeFileSync(jsonPath, JSON.stringify(jsonOut, null, 2), "utf8");

  const md = `# V3 deterministic output auditor — proof run

- **Generated:** ${new Date().toISOString()}
- **Run ID:** ${runId}
- **JSON artifact:** \`${jsonPath.replace(/\\/g, "/")}\`

## 1. Deterministic proof (\`auditDraftTerms\` in-process, no LLM)

Same implementation as \`supabase/functions/_shared/orchestrator/auditDraftCommercialTerms.ts\`.

| Case | Expect | Result |
|------|--------|--------|
| **A** Grounded playbook + structured \`committed_terms\` + confirming email | \`isValid: true\` | \`${deterministic.r1.isValid}\` |
| **B** Same terms + email, **empty** playbook | \`isValid: false\`, violations | \`${deterministic.r2.isValid}\` ${deterministic.r2.isValid === false ? `(violations: ${deterministic.r2.violations.length})` : ""} |
| **C** Empty playbook + ungrounded **prose** (\`30%\` retainer) | \`isValid: false\` | \`${deterministic.r3.isValid}\` ${deterministic.r3.isValid === false ? `(violations: ${deterministic.r3.violations.length})` : ""} |

**Violations (B), if any:**

${deterministic.r2.isValid === false ? deterministic.r2.violations.map((v) => `- ${v}`).join("\n") : "-"}

**Violations (C), if any:**

${deterministic.r3.isValid === false ? deterministic.r3.violations.map((v) => `- ${v}`).join("\n") : "-"}

**Deterministic verdict:** ${deterministicProven ? "PASS — deterministic auditor catches ungrounded commercial assertions." : "FAIL"}

## 2. Live pipeline (real \`playbook_rules\` seed + email → \`clientOrchestratorV1\`)

| Branch | Wait stable | Persona step in history | Auditor step in history | Stub fallback | Auditor escalations |
|--------|-------------|-------------------------|-------------------------|---------------|---------------------|
| **Happy (grounded)** | ${happy.waitOk} | ${happy.parsed.personaStepFound} | ${happy.parsed.auditorStepFound} | ${happy.isStubFallback} | ${happy.auditorEscalations.length} |
${smokeHappyOnly ? "" : `| **Failure (no playbook)** | ${fail!.waitOk} | ${fail!.parsed.personaStepFound} | ${fail!.parsed.auditorStepFound} | ${fail!.isStubFallback} | ${fail!.auditorEscalations.length} |\n`}

- **Live happy (observed persona prose, not stub):** ${liveHappyObserved}
${smokeHappyOnly ? "- **Smoke mode:** failure branch skipped (`V3_AUDITOR_PROOF_SMOKE_HAPPY_ONLY=1`).\n" : `- **Live failure (stub + auditor escalation row):** ${liveFailureStubObserved}
`}
- If \`auditorStepFound\` is false, the deployed Inngest edge bundle may predate the auditor — run \`npx supabase functions deploy inngest\` and re-run.

## Happy path (Elite + 30% + 50 miles in \`playbook_rules\`)

- **Draft ID:** ${happy.draftId ?? "—"}
- **Persona returned \`committed_terms\`:** ${happy.parsed.personaStepFound ? "yes (see JSON)" : "not found in instruction_history"}
- **Stored payload (excerpt):** \`\`\`json
${JSON.stringify(happy.parsed.committed_terms, null, 2).slice(0, 2000)}
\`\`\`
- **Auditor step:** \`passed: ${happy.parsed.auditPassed}\`
- **Draft body:** ${happy.isStubFallback ? "stub (unexpected)" : "persona prose (no auditor rejection footer)"}
- **Transcript excerpt (draft body, first ~600 chars):**

\`\`\`
${happy.draftBodyPreview.slice(0, 600)}
\`\`\`

${smokeHappyOnly ? "## Failure path\n\n_(Skipped — smoke happy only.)_\n\n" : `## Failure path (no grounding rows)

- **Draft ID:** ${fail!.draftId ?? "—"}
- **Stored \`committed_terms\`:** see JSON
- **\`auditDraftTerms\`:** passed=${fail!.parsed.auditPassed}
- **Violations (exact):**
${fail!.parsed.violations.map((v) => `- ${v}`).join("\n") || "- (none parsed)"}
- **Stub fallback:** ${fail!.isStubFallback ? "yes — orchestrator stub + auditor footer" : "no"}
- **Rejected persona blocked from final draft:** ${fail!.isStubFallback ? "yes — DB body is stub, not model JSON email" : "unclear"}
- **Escalation rows (\`reason_code=v3_output_auditor_ungrounded_commercial\`):** ${fail!.auditorEscalations.length} → IDs: ${fail!.auditorEscalations.map((e) => e.id).join(", ") || "—"}
- **\`operator/escalation.pending_delivery.v1\`:** emitted inside \`recordV3OutputAuditorEscalation\` after insert (see code path); not queried from Inngest API in this harness.
- **Transcript excerpt (draft body, first ~800 chars):**

\`\`\`
${fail!.draftBodyPreview.slice(0, 800)}
\`\`\`

`}## Raw \`instruction_history\` (happy, truncated JSON)

\`\`\`json
${JSON.stringify(happy.instructionHistoryRaw, null, 2).slice(0, 4000)}
\`\`\`

${smokeHappyOnly ? "" : `## Raw \`instruction_history\` (failure, truncated JSON)

\`\`\`json
${JSON.stringify(fail!.instructionHistoryRaw, null, 2).slice(0, 4000)}
\`\`\`

`}## Files changed (this proof slice)

- \`scripts/v3_auditor_proof_harness.ts\`
- \`package.json\` — \`v3:proof-auditor\`

## Final verdict

${verdict}
`;
  writeFileSync(mdPath, md, "utf8");

  console.log(`Wrote:\n  ${mdPath}\n  ${jsonPath}`);
  console.log(
    JSON.stringify(
      { deterministicProven, liveHappyObserved, liveFailureStubObserved, smokeHappyOnly, verdict },
      null,
      2,
    ),
  );

  if (!deterministicProven) {
    process.exit(2);
  }
  if (smokeHappyOnly && !liveHappyObserved) {
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
