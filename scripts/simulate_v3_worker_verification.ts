/**
 * V3 worker verification harness — **real ingress only** (triage / routing), optional burst.
 *
 * ## Default: triage email path (`V3_VERIFY_MODE=email` or unset)
 * - Sends **`comms/email.received`** (same shape as production email ingress → Inngest `traffic-cop-triage`).
 * - **Does not** emit `ai/intent.persona` or any other worker directly — exercises routing → downstream workers only.
 * - Per turn: wait for persisted outcome (draft / outbound / escalation), quiet window, then **finalize** any
 *   `pending_approval` drafts by emitting **`approval/draft.approved`** to Inngest (same as `api-resolve-draft`), then
 *   wait for the outbound worker to record a real **out** message. Synthetic outbound is **opt-in** only
 *   (`V3_VERIFY_SYNTHETIC_OUTBOUND_FALLBACK=1`).
 * - Triage may create **one thread per inbound**; the report merges messages across thread ids for this run.
 *
 * ## `burst`
 * - Fires `comms/email.received` with fixed delay only (no per-turn outcome wait).
 *
 * ## Run
 *   npx tsx scripts/simulate_v3_worker_verification.ts
 *   npm run v3:verify-workers
 *
 * ## Env
 * - `V3_VERIFY_MODE` — `email` (default) | `burst`. Aliases `conversation`, `persona`, `triage` → `email` (ingress path).
 * - `V3_VERIFY_POLL_MS`, `V3_VERIFY_QUIET_MS`, `V3_VERIFY_TURN_MAX_MS` — wait for first persisted outcome + stability
 * - `V3_POST_APPROVE_OUTBOUND_WAIT_MS` — after approving a draft, poll for real outbound (default 30000)
 * - `V3_TURN_GAP_MS` — optional ms after finalizing a turn before next `comms/email.received` (default 0)
 * - `V3_VERIFY_MAX_TURNS` — optional cap on scenario length (e.g. `3` for smoke; default all 10)
 * - `V3_VERIFY_SCENARIO` — `default` (bundled 10-case matrix) | `conversation_smoke_3` (3-turn inquiry → commercial → exception; see `buildConversationSmoke3Cases`)
 * - `V3_VERIFY_FRESH_WEDDING_PER_RUN` — `1`/`true` forces a **new** `weddings` row per email-mode run (same QA photographer); `0`/`false` disables. When unset, **fresh wedding is default for** `conversation_smoke_3` only (avoids cross-run transcript pollution).
 * - `V3_VERIFY_FIXTURES` — path to fixtures JSON
 * - `V3_VERIFY_DELAY_MS` — **burst** only
 * - `V3_VERIFY_SKIP_V3_PREFLIGHT=1` — skip live gate checks (not recommended for proving V3 reply behavior)
 * - `V3_VERIFY_GATE_MODE` — `scenario` (default) | `strict_lifecycle` (alias: `strict`): which gates must be ON before the run
 * - `V3_VERIFY_REQUIRE_INTAKE_POST_BOOTSTRAP_EMAIL=1` — also require `INTAKE_LIVE_ORCHESTRATOR_POST_BOOTSTRAP_EMAIL_V1` (intake worker post-bootstrap path)
 * - **`V3_VERIFY_GATE_POSTURE_FILE`** — optional path (repo-root relative or absolute) to an env file that **overrides** triage/intake live gate vars for preflight (mirrors intended Edge posture). Default: `scripts/v3_verify_gate_posture.env` if present, else `.env.v3_verify_gate_posture`.
 * - Copy **`scripts/v3_verify_gate_posture.env.example`** → **`scripts/v3_verify_gate_posture.env`** and set `1` / `true` to match deployed `traffic-cop-triage` / intake secrets.
 * - **`V3_VERIFY_OPERATOR_PROFILE`** — `smoke_strict`: sets `V3_VERIFY_MAX_TURNS=1` and `V3_VERIFY_GATE_MODE=strict_lifecycle` unless already set (strict live-V3 smoke).
 * - `V3_VERIFY_SYNTHETIC_OUTBOUND_FALLBACK=1` — only if approval event + outbound worker did not persist a row in time (not default)
 * - `DRY_RUN=1` — no DB / Inngest
 * - `INNGEST_SIGNING_KEY` — optional
 * - `V3_VERIFY_SKIP_POLICY_SEED=1` — for `conversation_smoke_3`, skip inserting tagged `playbook_rules` / case `memories` (not recommended for grounding tests)
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, isAbsolute, join } from "path";

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

/** Keys allowed in the gate posture file (matches `V3_LIVE_GATE_REGISTRY` + triage main-path pattern). */
function isV3GatePostureEnvKey(k: string): boolean {
  if (k.startsWith("TRIAGE_LIVE_ORCHESTRATOR_MAIN_PATH_") && k.endsWith("_KNOWN_WEDDING_V1")) return true;
  if (k === "INTAKE_LIVE_ORCHESTRATOR_POST_BOOTSTRAP_EMAIL_V1") return true;
  return false;
}

let v3GatePostureFileResolved: string | null = null;

/**
 * Loads intended live V3 gate posture for **preflight only** (local mirror of Edge secrets).
 * Overrides `process.env` for allowlisted keys so preflight matches deployment even when base `.env` omits CUTs.
 */
function loadV3VerifyGatePostureFile(): void {
  const explicit = process.env.V3_VERIFY_GATE_POSTURE_FILE?.trim();
  const candidates: string[] = [];
  if (explicit) {
    candidates.push(isAbsolute(explicit) ? explicit : join(root, explicit));
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
    v3GatePostureFileResolved = p;
    return;
  }

  if (explicit) {
    console.warn(
      "[v3 verify] V3_VERIFY_GATE_POSTURE_FILE is set but file not found:",
      explicit,
      "(preflight will use only .env / shell for gate vars)",
    );
  }
}

/** Optional: one-command strict smoke defaults (`V3_VERIFY_OPERATOR_PROFILE=smoke_strict`). */
function applyV3VerifyOperatorProfile(): void {
  const p = process.env.V3_VERIFY_OPERATOR_PROFILE?.trim().toLowerCase();
  if (p === "smoke_strict" || p === "v3_smoke_strict") {
    if (!process.env.V3_VERIFY_MAX_TURNS) process.env.V3_VERIFY_MAX_TURNS = "1";
    if (!process.env.V3_VERIFY_GATE_MODE) process.env.V3_VERIFY_GATE_MODE = "strict_lifecycle";
  }
}

loadEnv();
loadV3VerifyGatePostureFile();
applyV3VerifyOperatorProfile();

/** Mirrors triage/intake `Deno.env` checks: on only for `1` or `true`. */
function isGateOnHarness(raw: string | undefined): boolean {
  return raw === "1" || raw === "true";
}

const skipV3Preflight =
  process.env.V3_VERIFY_SKIP_V3_PREFLIGHT === "1" || process.env.V3_VERIFY_SKIP_V3_PREFLIGHT === "true";

const rawGateMode = (process.env.V3_VERIFY_GATE_MODE ?? "scenario").toLowerCase();
const v3VerifyGateMode: "strict_lifecycle" | "scenario" =
  rawGateMode === "strict_lifecycle" || rawGateMode === "strict" ? "strict_lifecycle" : "scenario";

const requireIntakePostBootstrapHarness =
  process.env.V3_VERIFY_REQUIRE_INTAKE_POST_BOOTSTRAP_EMAIL === "1" ||
  process.env.V3_VERIFY_REQUIRE_INTAKE_POST_BOOTSTRAP_EMAIL === "true";

const url = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL;
const sr = process.env.SUPABASE_SERVICE_ROLE_KEY;
const inngestKey = process.env.INNGEST_EVENT_KEY;
const inngestSigningKey =
  process.env.INNGEST_SIGNING_KEY || process.env.INGEST_SINGIN_KEY || process.env.INGEST_SIGNING_KEY || "";

const rawVerifyMode = (process.env.V3_VERIFY_MODE ?? "email").toLowerCase();
const mode: "email" | "burst" =
  rawVerifyMode === "burst" ? "burst" : "email"; // conversation / persona / triage → email (real ingress)

const delayMs = Math.max(3000, parseInt(process.env.V3_VERIFY_DELAY_MS ?? "12000", 10) || 12000);
const postApproveOutboundWaitMs = Math.max(
  0,
  parseInt(process.env.V3_POST_APPROVE_OUTBOUND_WAIT_MS ?? "30000", 10) || 30000,
);
const turnGapMs = Math.max(0, parseInt(process.env.V3_TURN_GAP_MS ?? process.env.QA_TURN_GAP_MS ?? "0", 10) || 0);
const pollMs = Math.max(2000, parseInt(process.env.V3_VERIFY_POLL_MS ?? "4000", 10) || 4000);
const quietMs = Math.max(5000, parseInt(process.env.V3_VERIFY_QUIET_MS ?? "18000", 10) || 18000);
const turnMaxMs = Math.max(60000, parseInt(process.env.V3_VERIFY_TURN_MAX_MS ?? "420000", 10) || 420000);
/** Default off: real outbound must appear via `approval/draft.approved` → outbound worker (same as production). */
const allowSyntheticOutboundFallback =
  process.env.V3_VERIFY_SYNTHETIC_OUTBOUND_FALLBACK === "1" ||
  process.env.V3_VERIFY_SYNTHETIC_OUTBOUND_FALLBACK === "true";
const dryRun = process.env.DRY_RUN === "1" || process.env.DRY_RUN === "true";
const maxTurnsRaw = parseInt(process.env.V3_VERIFY_MAX_TURNS ?? "", 10);
const maxTurns =
  Number.isFinite(maxTurnsRaw) && maxTurnsRaw > 0 ? Math.min(maxTurnsRaw, 50) : null;

/** `conversation_smoke_3` — three phase-consistent turns (inquiry → commercial follow-up → exception). See `buildConversationSmoke3Cases`. */
const v3VerifyScenario = (process.env.V3_VERIFY_SCENARIO ?? "default").toLowerCase();

const fixturesPath = process.env.V3_VERIFY_FIXTURES
  ? join(root, process.env.V3_VERIFY_FIXTURES)
  : join(root, "supabase/functions/inngest/.qa_fixtures.json");

type Fixtures = { photographerId: string; weddingId: string; email: string };

type Case = {
  id: string;
  subject: string;
  body: string;
  sender: "cold_lead" | "fixture_client";
  expectedBehaviorClass: string;
};

/** Live V3 cutover gates (triage main-path known-wedding + optional intake post-bootstrap). */
type V3GateId = "CUT4" | "CUT5" | "CUT6" | "CUT7" | "CUT8" | "INTAKE_POST_BOOTSTRAP_EMAIL";

const V3_LIVE_GATE_REGISTRY: ReadonlyArray<{
  id: V3GateId;
  envVar: string;
  scope: "triage" | "intake";
  whenOffLegacy: string;
}> = [
  {
    id: "CUT4",
    envVar: "TRIAGE_LIVE_ORCHESTRATOR_MAIN_PATH_CONCIERGE_KNOWN_WEDDING_V1",
    scope: "triage",
    whenOffLegacy: "ai/intent.concierge",
  },
  {
    id: "CUT5",
    envVar: "TRIAGE_LIVE_ORCHESTRATOR_MAIN_PATH_PROJECT_MANAGEMENT_KNOWN_WEDDING_V1",
    scope: "triage",
    whenOffLegacy: "ai/intent.project_management",
  },
  {
    id: "CUT6",
    envVar: "TRIAGE_LIVE_ORCHESTRATOR_MAIN_PATH_LOGISTICS_KNOWN_WEDDING_V1",
    scope: "triage",
    whenOffLegacy: "ai/intent.logistics",
  },
  {
    id: "CUT7",
    envVar: "TRIAGE_LIVE_ORCHESTRATOR_MAIN_PATH_COMMERCIAL_KNOWN_WEDDING_V1",
    scope: "triage",
    whenOffLegacy: "ai/intent.commercial",
  },
  {
    id: "CUT8",
    envVar: "TRIAGE_LIVE_ORCHESTRATOR_MAIN_PATH_STUDIO_KNOWN_WEDDING_V1",
    scope: "triage",
    whenOffLegacy: "ai/intent.studio",
  },
  {
    id: "INTAKE_POST_BOOTSTRAP_EMAIL",
    envVar: "INTAKE_LIVE_ORCHESTRATOR_POST_BOOTSTRAP_EMAIL_V1",
    scope: "intake",
    whenOffLegacy: "ai/intent.persona (post-bootstrap handoff from intake.ts)",
  },
];

/**
 * Which gates must be ON for each bundled case so a turn is not silently legacy.
 * Union across the cases you run (`V3_VERIFY_MAX_TURNS`) is required in `scenario` mode.
 */
const CASE_ID_TO_REQUIRED_GATES: Record<string, readonly V3GateId[]> = {
  // Inquiry can route to concierge or commercial on main path.
  "1_vanilla_inquiry": ["CUT4", "CUT7"],
  "2_discount_ask": ["CUT7"],
  "3_raw_demand": ["CUT8"],
  "4_retouch_gallery": ["CUT8"],
  "5_out_of_scope": ["CUT4", "CUT7"],
  "6_planner_secrecy": ["CUT4", "CUT5"],
  "7_wire_payment": ["CUT4", "CUT7"],
  "8_alpacas_exception": ["CUT4"],
  "9_logistics_timeline": ["CUT6", "CUT5"],
  "10_angry_sneak_peeks": ["CUT4", "CUT8"],
  /** 3-turn conversation smoke (prep-stage client, pricing thread) */
  "smoke3_inquiry_pricing": ["CUT4", "CUT7"],
  "smoke3_commercial_followup": ["CUT7"],
  "smoke3_policy_exception": ["CUT4", "CUT7"],
};

const STRICT_LIFECYCLE_TRIAGE_GATES: readonly V3GateId[] = ["CUT4", "CUT5", "CUT6", "CUT7", "CUT8"];

function computeRequiredV3GateIds(opts: {
  gateMode: "strict_lifecycle" | "scenario";
  cases: Case[];
  requireIntakePostBootstrap: boolean;
}): { required: Set<V3GateId>; rationale: string } {
  if (opts.gateMode === "strict_lifecycle") {
    const required = new Set<V3GateId>(STRICT_LIFECYCLE_TRIAGE_GATES);
    if (opts.requireIntakePostBootstrap) required.add("INTAKE_POST_BOOTSTRAP_EMAIL");
    return {
      required,
      rationale:
        "`V3_VERIFY_GATE_MODE=strict_lifecycle`: require **CUT4–CUT8** (all main-path triage live orchestrator gates for known wedding)" +
        (opts.requireIntakePostBootstrap
          ? " plus **`INTAKE_LIVE_ORCHESTRATOR_POST_BOOTSTRAP_EMAIL_V1`** (intake post-bootstrap orchestrator path)."
          : "."),
    };
  }

  const required = new Set<V3GateId>();
  for (const c of opts.cases) {
    const g = CASE_ID_TO_REQUIRED_GATES[c.id];
    if (g) {
      for (const x of g) required.add(x);
    }
  }
  if (opts.requireIntakePostBootstrap) required.add("INTAKE_POST_BOOTSTRAP_EMAIL");

  return {
    required,
    rationale:
      "`V3_VERIFY_GATE_MODE=scenario` (default): require the **union** of gates for the case ids in this run: " +
      opts.cases.map((c) => c.id).join(", ") +
      (opts.requireIntakePostBootstrap
        ? "; plus **`INTAKE_LIVE_ORCHESTRATOR_POST_BOOTSTRAP_EMAIL_V1`** (explicitly requested)."
        : "."),
  };
}

function footer(caseId: string, runId: string): string {
  return `\n\n--\n[${caseId}] ${runId}`;
}

function buildCases(runId: string, coldSender: string, opts: { burstWithColdLead: boolean }): Case[] {
  const baseSubject = `[V3Verify ${runId}] V3 thread verification`;
  const subj = (i: number) => (i === 0 ? baseSubject : `Re: ${baseSubject}`);

  const rows: Case[] = [
    {
      id: "1_vanilla_inquiry",
      subject: subj(0),
      body:
        "Getting married in Tuscany next year — what are your rates and what is included? " +
        "We are comparing a few photographers.",
      sender: opts.burstWithColdLead ? "cold_lead" : "fixture_client",
      expectedBehaviorClass: opts.burstWithColdLead
        ? "Cold email → triage + matchmaker / intake-shaped routing; commercial or intake per stage gate + LLM"
        : "Known client → same wedding; concierge/commercial routing per stage gate + orchestrator or legacy worker",
    },
    {
      id: "2_discount_ask",
      subject: subj(1),
      body:
        "We love your work. Can you do 15% off if we pay in full today? We can send the deposit this week.",
      sender: "fixture_client",
      expectedBehaviorClass:
        "Policy / pricing sensitivity — draft should not blindly concede; verifier or escalation if configured",
    },
    {
      id: "3_raw_demand",
      subject: subj(2),
      body:
        "My uncle is a photographer and wants to edit the photos himself. Can we just buy the RAW files instead of JPGs?",
      sender: "fixture_client",
      expectedBehaviorClass:
        "RAW / IP policy — constrained or ask-first response per studio contract / playbook",
    },
    {
      id: "4_retouch_gallery",
      subject: subj(3),
      body:
        "In photo 42 in the gallery, can you Photoshop my arm to look thinner before we approve the set for print?",
      sender: "fixture_client",
      expectedBehaviorClass:
        "Visual / body-editing ask — human review or escalation; not silent auto-approve",
    },
    {
      id: "5_out_of_scope",
      subject: subj(4),
      body:
        "Do you shoot corporate headshots for our law firm? We need 15 partners next month in downtown Seattle.",
      sender: "fixture_client",
      expectedBehaviorClass:
        "Out-of-scope vs wedding brand — decline or refer; business profile / scope exclusions",
    },
    {
      id: "6_planner_secrecy",
      subject: subj(5),
      body:
        "Hi, I'm the planner working with this couple. Please don't tell the bride — we want to surprise her with a printed album at the reception. Can you ship it to the venue coordinator?",
      sender: "fixture_client",
      expectedBehaviorClass:
        "Audience / secrecy / CC risk — careful drafting; no promise to hide from client without confirmation",
    },
    {
      id: "7_wire_payment",
      subject: subj(6),
      body:
        "Can we pay our final invoice via direct wire transfer instead of Stripe? Our finance team prefers ACH/wire.",
      sender: "fixture_client",
      expectedBehaviorClass:
        "Payment rail exception — escalation or ask-first vs default Stripe policy",
    },
    {
      id: "8_alpacas_exception",
      subject: subj(7),
      body:
        "We want to bring our three pet alpacas to the engagement shoot in the park. Is that okay with your insurance and venue rules?",
      sender: "fixture_client",
      expectedBehaviorClass:
        "Novel exception — ask-first / escalation; unlikely fully covered by static rules",
    },
    {
      id: "9_logistics_timeline",
      subject: subj(8),
      body:
        "Here is the final timeline from our venue coordinator for the wedding day — please confirm you can align with the photo schedule and sunset portraits at 7:10pm. Attached summary in text below.\n\n" +
        "12:00 prep · 3:00 first look · 5:00 ceremony · 7:10 sunset couple · 8:00 reception entrance.",
      sender: "fixture_client",
      expectedBehaviorClass:
        "Logistics / PM-style — tasks or drafts; orchestrator or logistics specialist path when stage allows",
    },
    {
      id: "10_angry_sneak_peeks",
      subject: subj(9),
      body:
        "We are incredibly frustrated that the sneak peeks are not ready yet. We paid on time and guests are asking. Please explain when we will receive them.",
      sender: "fixture_client",
      expectedBehaviorClass:
        "High emotion — compassionate tone; strategic pause; avoid blunt automated dismissal",
    },
  ];
  return rows;
}

/**
 * Three-turn lifecycle smoke: **prep/booked-style** client, single threaded `Re:` chain — inquiry/pricing → commercial
 * follow-up (deposit/package) → policy/exception (venue insurance). Intents stay on commercial/concierge; no logistics/studio noise.
 */
function buildConversationSmoke3Cases(runId: string): Case[] {
  const baseSubject = `[V3 QA ${runId}] Tuscany wedding — booking & pricing`;
  const subj = (i: number) => (i === 0 ? baseSubject : `Re: ${baseSubject}`);
  return [
    {
      id: "smoke3_inquiry_pricing",
      subject: subj(0),
      body:
        "Hi — we're getting married in Tuscany next June (~120 guests, Saturday evening). " +
        "Could you share your current packages, what is included, and starting rates for photography? " +
        "We are comparing two other photographers and hope to decide this month.",
      sender: "fixture_client",
      expectedBehaviorClass:
        "Turn 1 — inquiry / pricing (prep-stage known wedding) → commercial or concierge; orchestrator draft path",
    },
    {
      id: "smoke3_commercial_followup",
      subject: subj(1),
      body:
        "Thanks, this helps. We're leaning toward the Elite collection — can you confirm the deposit is 30% to hold the date, " +
        "and that travel for the engagement session within 50 miles of Florence is included? We can pay the deposit this week.",
      sender: "fixture_client",
      expectedBehaviorClass:
        "Turn 2 — commercial follow-up (deposit / package terms) → CUT7-shaped routing; policy-consistent reply",
    },
    {
      id: "smoke3_policy_exception",
      subject: subj(2),
      body:
        "Quick clarification — our venue contract requires vendors to carry liability insurance and name the venue as additional insured on the wedding day. " +
        "Is that something your policy already covers, or do we need to purchase a separate rider and list you?",
      sender: "fixture_client",
      expectedBehaviorClass:
        "Turn 3 — exception / clarifying follow-up (insurance & liability) → constrained reply; escalation or clear ask-first",
    },
  ];
}

function shouldUseFreshWeddingForRun(opts: { mode: "email" | "burst"; dryRun: boolean; scenario: string }): boolean {
  if (opts.dryRun || opts.mode !== "email") return false;
  const ex = process.env.V3_VERIFY_FRESH_WEDDING_PER_RUN?.trim().toLowerCase();
  if (ex === "0" || ex === "false") return false;
  if (ex === "1" || ex === "true") return true;
  return opts.scenario === "conversation_smoke_3";
}

async function createFreshQaWeddingForRun(
  supabase: SupabaseClient,
  photographerId: string,
  runId: string,
): Promise<{ weddingId: string }> {
  const weddingDate = new Date();
  weddingDate.setMonth(weddingDate.getMonth() + 8);
  const wedding_date = weddingDate.toISOString();
  const { data, error } = await supabase
    .from("weddings")
    .insert({
      photographer_id: photographerId,
      couple_names: `V3 QA couple ${runId}`,
      location: "Tuscany, Italy (harness)",
      wedding_date,
      stage: "prep",
      story_notes:
        `Fresh isolation row for V3 verification ${runId}. Not reused across runs — avoids polluted thread/wedding context.`,
    })
    .select("id")
    .single();
  if (error || !data?.id) {
    throw new Error(`createFreshQaWeddingForRun: ${error?.message ?? "no id"}`);
  }
  return { weddingId: data.id as string };
}

/** Tagged rows so the harness can delete them after the run (same photographer fixture may be reused). */
const V3_VERIFY_PLAYBOOK_SOURCE = "v3_verify_harness";
const V3_VERIFY_MEMORY_TYPE = "v3_verify_case_note";

async function cleanupV3HarnessPolicyArtifacts(supabase: SupabaseClient, photographerId: string): Promise<void> {
  const { error: e1 } = await supabase
    .from("playbook_rules")
    .delete()
    .eq("photographer_id", photographerId)
    .eq("source_type", V3_VERIFY_PLAYBOOK_SOURCE);
  if (e1) console.warn("[v3 harness] cleanup playbook_rules:", e1.message);
  const { error: e2 } = await supabase
    .from("memories")
    .delete()
    .eq("photographer_id", photographerId)
    .eq("type", V3_VERIFY_MEMORY_TYPE);
  if (e2) console.warn("[v3 harness] cleanup memories:", e2.message);
}

/**
 * Seeds **real V3 policy layers** for the conversation smoke: `playbook_rules` (tenant-wide) + one **case** `memories` row
 * scoped to the active wedding. Does not put policy in `photographers.settings` blobs — aligns with ARCHITECTURE.md precedence
 * (playbook / case memory vs arbitrary JSON).
 */
async function seedV3HarnessPolicyLayersForConversationSmoke(
  supabase: SupabaseClient,
  photographerId: string,
  weddingId: string,
  runId: string,
): Promise<void> {
  await cleanupV3HarnessPolicyArtifacts(supabase, photographerId);

  const playbookRows = [
    {
      photographer_id: photographerId,
      scope: "global" as const,
      channel: null,
      action_key: "send_message",
      topic: "commercial_deposit_retainer",
      decision_mode: "draft_only" as const,
      instruction:
        "Booking retainer and deposit percentages are defined only by the signed contract and the studio’s published terms. " +
        "A common practice is a 30% retainer to hold a date when the contract specifies it — never invent a different percentage (e.g. 50%) unless explicitly stated in a verified playbook rule or contract excerpt. " +
        "If the client asks to confirm a percentage, defer to the contract or say you will confirm with the team.",
      source_type: V3_VERIFY_PLAYBOOK_SOURCE,
      confidence_label: "explicit",
      is_active: true,
    },
    /** QA: verified-package happy path — same `playbook_rules` `fetchActivePlaybookRulesForDecisionContext` loads for live clientOrchestratorV1 + persona rewrite. */
    {
      photographer_id: photographerId,
      scope: "global" as const,
      channel: null,
      action_key: "send_message",
      topic: "package_elite_collection_verified",
      decision_mode: "draft_only" as const,
      instruction:
        "Verified offering — Elite collection: a real studio package tier for this tenant. " +
        "For Elite collection: a 30% retainer holds the wedding date when the contract reflects it; " +
        "engagement session travel within 50 miles of Florence is included. " +
        "When the client asks to confirm these points for Elite collection, you may answer affirmatively using this rule — do not treat the name as unverified client invention.",
      source_type: V3_VERIFY_PLAYBOOK_SOURCE,
      confidence_label: "explicit",
      is_active: true,
    },
    {
      photographer_id: photographerId,
      scope: "global" as const,
      channel: null,
      action_key: "send_message",
      topic: "insurance_liability_coi",
      decision_mode: "draft_only" as const,
      instruction:
        "Insurance / COI / additional insured: do not assert specific coverage limits, carrier terms, venue naming, or that there is no cost to the client unless explicitly stated in verified policy text. " +
        "Default: we will align certificate of insurance with venue requirements after internal review; do not guarantee coverage details in email.",
      source_type: V3_VERIFY_PLAYBOOK_SOURCE,
      confidence_label: "explicit",
      is_active: true,
    },
    {
      photographer_id: photographerId,
      scope: "global" as const,
      channel: null,
      action_key: "send_message",
      topic: "studio_service_area",
      decision_mode: "draft_only" as const,
      instruction:
        "Luxury wedding photography; Pacific Northwest base with select destination work (e.g. EU) when contracted. Do not invent package names or prices not in the client thread or playbook.",
      source_type: V3_VERIFY_PLAYBOOK_SOURCE,
      confidence_label: "explicit",
      is_active: true,
    },
  ];

  const { error: pe } = await supabase.from("playbook_rules").insert(playbookRows);
  if (pe) throw new Error(`seedV3HarnessPolicyLayers playbook_rules: ${pe.message}`);

  const caseSummary =
    "For this QA wedding: Elite collection package facts are in playbook_rules (verified). Align deposit/retainer with contract + playbook; insurance: defer COI details to ops — no unverified ‘no cost’ claims.";

  const { error: me } = await supabase.from("memories").insert({
    photographer_id: photographerId,
    wedding_id: weddingId,
    type: V3_VERIFY_MEMORY_TYPE,
    title: `V3 verify case note (${runId})`,
    summary: caseSummary.slice(0, 500),
    full_content: caseSummary,
  });
  if (me) throw new Error(`seedV3HarnessPolicyLayers memories: ${me.message}`);

  console.log(
    "[v3 harness] Seeded playbook_rules (source_type=" + V3_VERIFY_PLAYBOOK_SOURCE + ") + case memory (" + V3_VERIFY_MEMORY_TYPE + ") for wedding",
    weddingId,
  );
}

async function ensureFixtureClientMapsToWedding(
  supabase: SupabaseClient,
  weddingId: string,
  email: string,
): Promise<void> {
  const { data: byEmail, error: e1 } = await supabase
    .from("clients")
    .select("id, email, wedding_id")
    .eq("email", email)
    .maybeSingle();
  if (e1) throw e1;
  if (byEmail?.wedding_id === weddingId) return;
  if (byEmail && byEmail.wedding_id !== weddingId) {
    const { error: up } = await supabase.from("clients").update({ wedding_id: weddingId }).eq("id", byEmail.id);
    if (up) throw up;
    return;
  }
  const { error: ins } = await supabase.from("clients").insert({
    wedding_id: weddingId,
    name: "V3 verify fixture client",
    email,
    role: "primary",
  });
  if (ins) throw ins;
}

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

  return {
    drafts: drafts ?? [],
    outbound: outbound ?? [],
    escalations,
  };
}

function classifyDraft(d: { body: string; instruction_history: unknown }): string {
  const h = JSON.stringify(d.instruction_history ?? "");
  if (h.includes("persona_agent")) return "persona";
  if (
    h.includes("client_orchestrator_v1") ||
    String(d.body ?? "").includes("[Orchestrator draft — clientOrchestratorV1 QA path]")
  ) {
    return "orchestrator";
  }
  return "other";
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

/** Email/triage path: require a persisted draft, outbound, or escalation; do not advance on empty pipeline. */
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
    const hasVisible =
      art.drafts.length > 0 || art.outbound.length > 0 || art.escalations.length > 0;
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

/**
 * Same payload shape as `api-resolve-draft` approve branch — **do not** pre-update `drafts.status`;
 * `claim_draft_for_outbound` in the outbound worker transitions `pending_approval` → `approved`.
 */
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

/**
 * After triage/workers produced stable artifacts: for each `pending_approval` draft, emit **`approval/draft.approved`**
 * (production path), then poll for a new outbound row created by the outbound worker.
 */
async function finalizePendingDraftsForTurn(
  supabase: SupabaseClient,
  photographerId: string,
  threadId: string,
  inboundSentAt: string,
  ingestUrl: string,
): Promise<{
  approvedDraftIds: string[];
  approvalEvents: Array<{
    draftId: string;
    inngestHttpOk: boolean;
    inngestHttpStatus: number;
    inngestEventId: string | null;
    inngestSnippet: string;
  }>;
  outboundActions: { draftId: string; source: "system" | "harness_synthetic" }[];
}> {
  if (!ingestUrl) {
    throw new Error("finalizePendingDraftsForTurn: missing Inngest ingest URL (INNGEST_EVENT_KEY)");
  }

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
  const approvalEvents: Array<{
    draftId: string;
    inngestHttpOk: boolean;
    inngestHttpStatus: number;
    inngestEventId: string | null;
    inngestSnippet: string;
  }> = [];
  const outboundActions: { draftId: string; source: "system" | "harness_synthetic" }[] = [];

  const outboundCountBefore = async (): Promise<number> => {
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

  let baselineOut = await outboundCountBefore();

  for (const d of pending ?? []) {
    const draftId = d.id as string;
    const body = String(d.body ?? "");

    console.log(`[finalize] sending approval/draft.approved for draft ${draftId}…`);
    const send = await sendApprovalDraftApprovedToInngest(ingestUrl, draftId, photographerId);
    approvalEvents.push({
      draftId,
      inngestHttpOk: send.ok,
      inngestHttpStatus: send.httpStatus,
      inngestEventId: send.eventId,
      inngestSnippet: send.snippet,
    });
    if (!send.ok) {
      throw new Error(
        `Inngest approval/draft.approved failed (HTTP ${send.httpStatus}): ${send.snippet}`,
      );
    }
    approvedDraftIds.push(draftId);
    console.log(
      `[finalize] approval event accepted (Inngest event id: ${send.eventId ?? "unknown"}); waiting for outbound worker…`,
    );

    const deadline = Date.now() + postApproveOutboundWaitMs;
    let systemOutbound = false;
    while (Date.now() < deadline) {
      const n = await outboundCountBefore();
      if (n > baselineOut) {
        systemOutbound = true;
        baselineOut = n;
        break;
      }
      await sleep(2000);
    }

    if (systemOutbound) {
      outboundActions.push({ draftId, source: "system" });
      continue;
    }

    if (allowSyntheticOutboundFallback) {
      console.warn(
        `[finalize] no outbound row within ${postApproveOutboundWaitMs}ms — V3_VERIFY_SYNTHETIC_OUTBOUND_FALLBACK=1, inserting labeled synthetic outbound`,
      );
      const { error: outErr } = await supabase.from("messages").insert({
        thread_id: threadId,
        photographer_id: photographerId,
        direction: "out",
        sender: "photographer",
        body:
          body +
          `\n\n--\n[harness: synthetic outbound — approval event was sent but no out message within ${postApproveOutboundWaitMs}ms; check Inngest outbound worker]`,
      });
      if (outErr) throw new Error("harness synthetic outbound insert: " + outErr.message);
      outboundActions.push({ draftId, source: "harness_synthetic" });
      baselineOut = await outboundCountBefore();
      continue;
    }

    throw new Error(
      `After approval/draft.approved (draft ${draftId}), no new outbound message appeared within ${postApproveOutboundWaitMs}ms. ` +
        "Production expects the outbound Inngest function (`outbound-worker`) to claim the draft and insert `messages` (see `outbound.ts`). " +
        "Check that Inngest is running this app, `INNGEST_EVENT_KEY` targets the same environment, and the worker is not failing. " +
        "Or set V3_VERIFY_SYNTHETIC_OUTBOUND_FALLBACK=1 temporarily for transcript-only continuity.",
    );
  }

  return { approvedDraftIds, approvalEvents, outboundActions };
}

async function gatherThreadDiagnostics(
  supabase: SupabaseClient,
  photographerId: string,
  weddingId: string,
  threadId: string,
): Promise<Record<string, unknown>> {
  const { data: msgs } = await supabase
    .from("messages")
    .select("id,sent_at,direction,sender,body")
    .eq("thread_id", threadId)
    .eq("photographer_id", photographerId)
    .order("sent_at", { ascending: true });
  const { data: drafts } = await supabase
    .from("drafts")
    .select("id,status,created_at,body")
    .eq("thread_id", threadId)
    .eq("photographer_id", photographerId);
  const { data: escByW } = await supabase
    .from("escalation_requests")
    .select("id,status,created_at,reason_code,thread_id,wedding_id")
    .eq("photographer_id", photographerId)
    .eq("wedding_id", weddingId);
  return {
    threadId,
    weddingId,
    messages: msgs ?? [],
    drafts: drafts ?? [],
    escalations: escByW ?? [],
  };
}

async function fetchThreadMetadata(supabase: SupabaseClient, threadId: string) {
  const { data, error } = await supabase
    .from("threads")
    .select("id,title,wedding_id,last_activity_at,last_inbound_at,last_outbound_at,ai_routing_metadata,needs_human")
    .eq("id", threadId)
    .maybeSingle();
  if (error) return { error: error.message, row: null };
  return { error: null, row: data };
}

async function fetchInngestRunsSnippet(eventId: string | null): Promise<string | null> {
  if (!eventId || !inngestSigningKey) return null;
  try {
    const r = await fetch(`https://api.inngest.com/v1/events/${eventId}/runs`, {
      headers: { Authorization: `Bearer ${inngestSigningKey}` },
    });
    const t = await r.text();
    if (!r.ok) return `(runs API ${r.status}) ${t.slice(0, 500)}`;
    return t.slice(0, 24_000);
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

type TurnRecord = {
  caseId: string;
  expectedBehaviorClass: string;
  sender: string;
  subject: string;
  inngestEventId: string | null;
  inbound: InboundRow | null;
  wait: WaitResult | null;
  threadMetadata: Awaited<ReturnType<typeof fetchThreadMetadata>>["row"];
  inngestRunsSnippet: string | null;
  /** After stable wait: `approval/draft.approved` → outbound worker + poll; optional synthetic only if env allows */
  draftFinalization?: {
    approvedDraftIds: string[];
    approvalEvents: Array<{
      draftId: string;
      inngestHttpOk: boolean;
      inngestHttpStatus: number;
      inngestEventId: string | null;
      inngestSnippet: string;
    }>;
    outboundActions: { draftId: string; source: "system" | "harness_synthetic" }[];
  };
  outcomeSummary: {
    draftCount: number;
    outboundCount: number;
    escalationCount: number;
    draftKinds: Record<string, number>;
    hadOutbound: boolean;
    hadDraft: boolean;
    hadEscalation: boolean;
  };
};

type V3PreflightGateRow = {
  gateId: V3GateId;
  envVar: string;
  scope: "triage" | "intake";
  whenOffLegacy: string;
  rawValue: string | null;
  /** Mirrors Edge: enabled only when value is `1` or `true`. */
  parsedOn: boolean;
  requiredByHarness: boolean;
};

type V3PreflightReport = {
  skipped: boolean;
  /** Resolved path if `scripts/v3_verify_gate_posture.env` (or `V3_VERIFY_GATE_POSTURE_FILE`) was loaded. */
  gatePostureFilePath: string | null;
  gateMode: "strict_lifecycle" | "scenario";
  scenarioCaseIds: string[];
  requireIntakePostBootstrapRequested: boolean;
  requiredGateIds: V3GateId[];
  /** Human-readable explanation of how required gates were chosen. */
  requirementRationale: string;
  expectedBranchSummary: string;
  requiredGateEnvVars: string[];
  gates: V3PreflightGateRow[];
  /** True iff every required gate reads as ON in `process.env` (local `.env`); Edge secrets must match for real behavior. */
  scenarioValidForLiveV3Verification: boolean;
  missingRequiredGateIds: V3GateId[];
  notes: string[];
};

type ReportJson = {
  schema: "v3_thread_verification_v1";
  generatedAt: string;
  mode: "email" | "burst";
  runId: string;
  photographerId: string;
  weddingId: string;
  fixtureClientEmail: string;
  coldSender: string | null;
  productNote:
    | string
    | undefined;
  dryRun: boolean;
  v3Preflight: V3PreflightReport | null;
  scenarioFailure: { caseId: string; message: string; diagnostics?: Record<string, unknown> } | null;
  threadIdsObserved: string[];
  turns: TurnRecord[];
  transcript: {
    messages: {
      id: string;
      thread_id: string;
      sent_at: string;
      direction: string;
      sender: string;
      body: string;
    }[];
    drafts: {
      id: string;
      thread_id: string;
      created_at: string;
      status: string;
      kind: string;
      body_preview: string;
    }[];
    escalations: {
      id: string;
      thread_id: string | null;
      wedding_id: string | null;
      created_at: string;
      status: string;
      reason_code: string;
    }[];
  };
  /** How this run isolated DB state (fresh wedding under fixture photographer vs baseline fixture wedding). */
  testIsolation: {
    harnessScenario: string;
    freshWeddingCreatedForRun: boolean;
    fixtureBaselineWeddingId: string;
    activeWeddingId: string;
    clientWeddingIdBeforeRepoint: string | null;
    /** When true, run inserted tagged `playbook_rules` + `memories` and removed them on cleanup. */
    v3PolicyLayersSeeded: boolean;
  };
};

/** Resolve thread ids from persisted messages (helps burst mode where we do not wait per turn). */
async function resolveThreadIdsFromMessages(
  supabase: SupabaseClient,
  photographerId: string,
  runStartedAt: string,
  senders: string[],
): Promise<string[]> {
  const ids = new Set<string>();
  for (const sender of senders) {
    const { data, error } = await supabase
      .from("messages")
      .select("thread_id")
      .eq("photographer_id", photographerId)
      .eq("sender", sender)
      .gte("sent_at", runStartedAt);
    if (error) continue;
    for (const r of data ?? []) {
      if (r.thread_id) ids.add(r.thread_id);
    }
  }
  return [...ids];
}

async function collectTranscript(
  supabase: SupabaseClient,
  photographerId: string,
  weddingId: string,
  threadIds: string[],
  runStartedAt: string,
): Promise<ReportJson["transcript"]> {
  const ids = [...new Set(threadIds)].filter(Boolean);
  if (ids.length === 0) {
    return { messages: [], drafts: [], escalations: [] };
  }

  const { data: messages, error: mErr } = await supabase
    .from("messages")
    .select("id,thread_id,sent_at,direction,sender,body")
    .eq("photographer_id", photographerId)
    .in("thread_id", ids)
    .gte("sent_at", runStartedAt)
    .order("sent_at", { ascending: true });
  if (mErr) throw mErr;

  const { data: drafts, error: dErr } = await supabase
    .from("drafts")
    .select("id,thread_id,created_at,status,body,instruction_history")
    .eq("photographer_id", photographerId)
    .in("thread_id", ids)
    .gte("created_at", runStartedAt)
    .order("created_at", { ascending: true });
  if (dErr) throw dErr;

  const { data: escalations, error: eErr } = await supabase
    .from("escalation_requests")
    .select("id,thread_id,wedding_id,created_at,status,reason_code")
    .eq("photographer_id", photographerId)
    .eq("wedding_id", weddingId)
    .gte("created_at", runStartedAt)
    .order("created_at", { ascending: true });
  if (eErr) throw eErr;

  return {
    messages: (messages ?? []).map((m) => ({
      id: m.id,
      thread_id: m.thread_id,
      sent_at: m.sent_at,
      direction: m.direction,
      sender: m.sender,
      body: m.body,
    })),
    drafts: (drafts ?? []).map((d) => ({
      id: d.id,
      thread_id: d.thread_id,
      created_at: d.created_at,
      status: d.status,
      kind: classifyDraft(d),
      body_preview: String(d.body ?? "").slice(0, 400),
    })),
    escalations: (escalations ?? []).map((e) => ({
      id: e.id,
      thread_id: e.thread_id,
      wedding_id: e.wedding_id,
      created_at: e.created_at,
      status: e.status,
      reason_code: e.reason_code,
    })),
  };
}

function buildV3PreflightReport(opts: {
  mode: "email" | "burst";
  dryRun: boolean;
  gateMode: "strict_lifecycle" | "scenario";
  cases: Case[];
  requireIntakePostBootstrap: boolean;
}): V3PreflightReport {
  const skipReason =
    opts.dryRun || opts.mode === "burst" || skipV3Preflight
      ? opts.dryRun
        ? "dry run"
        : opts.mode === "burst"
          ? "burst mode"
          : "V3_VERIFY_SKIP_V3_PREFLIGHT"
      : null;

  const { required: requiredGateSet, rationale: requirementRationale } = computeRequiredV3GateIds({
    gateMode: opts.gateMode,
    cases: opts.cases,
    requireIntakePostBootstrap: opts.requireIntakePostBootstrap,
  });

  const gates: V3PreflightGateRow[] = V3_LIVE_GATE_REGISTRY.map((def) => {
    const raw = process.env[def.envVar];
    const rawValue = raw !== undefined && raw !== "" ? raw : null;
    return {
      gateId: def.id,
      envVar: def.envVar,
      scope: def.scope,
      whenOffLegacy: def.whenOffLegacy,
      rawValue,
      parsedOn: isGateOnHarness(raw),
      requiredByHarness: skipReason == null && requiredGateSet.has(def.id),
    };
  });

  const gateOrder = new Map(V3_LIVE_GATE_REGISTRY.map((d, i) => [d.id, i]));
  const sortGateIds = (ids: V3GateId[]) =>
    [...ids].sort((a, b) => (gateOrder.get(a) ?? 0) - (gateOrder.get(b) ?? 0));

  const missingRequiredGateIds = sortGateIds(
    gates.filter((g) => g.requiredByHarness && !g.parsedOn).map((g) => g.gateId),
  );

  const scenarioValidForLiveV3Verification = skipReason != null || missingRequiredGateIds.length === 0;

  const requiredGateIds = sortGateIds([...requiredGateSet]);
  const requiredGateEnvVars = requiredGateIds
    .map((id) => V3_LIVE_GATE_REGISTRY.find((d) => d.id === id)?.envVar)
    .filter((x): x is string => Boolean(x));

  const notes: string[] = [];
  if (v3GatePostureFileResolved) {
    notes.push(
      `Gate posture file loaded: \`${v3GatePostureFileResolved}\` — allowlisted triage/intake keys override base \`.env\` for preflight (mirror Edge \`traffic-cop-triage\` / intake).`,
    );
  } else {
    notes.push(
      "No gate posture file found (`scripts/v3_verify_gate_posture.env` or `V3_VERIFY_GATE_POSTURE_FILE`). Copy `scripts/v3_verify_gate_posture.env.example` to set intended live gates.",
    );
  }
  notes.push(
    "Gate parsing matches Edge: **on** only when the value is exactly `1` or `true` (see `triageShadowOrchestratorClientV1Gate.ts` and `intakeLivePostBootstrapOrchestratorGate.ts`).",
  );
  notes.push(
    "**Deployed** Supabase Edge secrets must still match this posture for the pipeline to behave as preflight assumes — a mixed legacy + live transcript invalidates this verification goal.",
  );
  if (skipReason) {
    notes.push(`Preflight enforcement skipped (${skipReason}).`);
  }

  return {
    skipped: skipReason != null,
    gatePostureFilePath: v3GatePostureFileResolved,
    gateMode: opts.gateMode,
    scenarioCaseIds: opts.cases.map((c) => c.id),
    requireIntakePostBootstrapRequested: opts.requireIntakePostBootstrap,
    requiredGateIds,
    requirementRationale,
    expectedBranchSummary:
      "Main-path **known wedding** email in triage uses distinct live gates per intent: **CUT4** concierge, **CUT5** project management, **CUT6** logistics, **CUT7** commercial, **CUT8** studio. " +
      "When a gate is off, triage keeps the legacy `ai/intent.*` worker for that intent (often compute-only or non-orchestrator drafts). " +
      "**INTAKE** post-bootstrap email is evaluated in **`intake.ts`**, not triage.",
    requiredGateEnvVars,
    gates,
    scenarioValidForLiveV3Verification,
    missingRequiredGateIds,
    notes,
  };
}

function buildMarkdown(j: ReportJson): string {
  const lines: string[] = [];
  lines.push(`# V3 thread verification`);
  lines.push(``);
  lines.push(`- **Generated:** ${j.generatedAt}`);
  lines.push(`- **Mode:** ${j.mode}`);
  lines.push(`- **Run ID:** ${j.runId}`);
  lines.push(`- **Photographer:** \`${j.photographerId}\``);
  lines.push(`- **Wedding (active for run):** \`${j.weddingId}\``);
  lines.push(`- **Fixture email:** ${j.fixtureClientEmail}`);
  lines.push(`- **Harness scenario:** \`${j.testIsolation.harnessScenario}\``);
  lines.push(
    `- **Fresh wedding for run:** ${j.testIsolation.freshWeddingCreatedForRun ? "yes (new row; baseline fixture was `" + j.testIsolation.fixtureBaselineWeddingId + "`)" : "no (using fixture baseline wedding)"}`,
  );
  if (j.testIsolation.freshWeddingCreatedForRun) {
    lines.push(`- **Fixture baseline wedding id (reference):** \`${j.testIsolation.fixtureBaselineWeddingId}\``);
    lines.push(
      `- **Client \`wedding_id\` before repoint:** ${j.testIsolation.clientWeddingIdBeforeRepoint ? `\`${j.testIsolation.clientWeddingIdBeforeRepoint}\`` : "(none / new client)"}`,
    );
  }
  lines.push(
    `- **V3 policy layers seeded (playbook_rules + case memory):** ${j.testIsolation.v3PolicyLayersSeeded ? "yes (tagged rows; cleaned up after run)" : "no"}`,
  );
  if (j.coldSender) lines.push(`- **Cold sender (burst):** ${j.coldSender}`);
  lines.push(`- **Dry run:** ${j.dryRun}`);
  lines.push(``);
  if (j.v3Preflight) {
    const p = j.v3Preflight;
    lines.push(`## V3 gate preflight`);
    lines.push(``);
    lines.push(p.expectedBranchSummary);
    lines.push(``);
    lines.push(
      `- **Gate posture file:** ${p.gatePostureFilePath ? `\`${p.gatePostureFilePath}\`` : "(none — use \`scripts/v3_verify_gate_posture.env.example\`)"}`,
    );
    lines.push(`- **Gate mode:** \`${p.gateMode}\` (${p.gateMode === "strict_lifecycle" ? "all CUT4–CUT8" : "union for selected cases"})`);
    lines.push(`- **Cases in this run:** ${p.scenarioCaseIds.map((x) => `\`${x}\``).join(", ")}`);
    lines.push(
      `- **Require intake post-bootstrap email:** ${p.requireIntakePostBootstrapRequested ? "yes (`INTAKE_LIVE_ORCHESTRATOR_POST_BOOTSTRAP_EMAIL_V1`)" : "no"}`,
    );
    lines.push(`- **Requirement rationale:** ${p.requirementRationale}`);
    lines.push(
      `- **Preflight enforced:** ${p.skipped ? "no (see notes)" : "yes"} · **Valid for live V3 verification (all required gates ON):** ${p.scenarioValidForLiveV3Verification ? "yes" : "**no**"}`,
    );
    if (p.requiredGateIds.length > 0) {
      lines.push(`- **Required gate ids:** ${p.requiredGateIds.map((x) => `\`${x}\``).join(", ")}`);
    } else {
      lines.push(`- **Required gate ids:** (none — preflight skipped)`);
    }
    if (p.requiredGateEnvVars.length > 0) {
      lines.push(`- **Required env vars:** ${p.requiredGateEnvVars.map((x) => `\`${x}\``).join(", ")}`);
    } else {
      lines.push(`- **Required env vars:** (none — preflight skipped or no gates required)`);
    }
    if (p.missingRequiredGateIds.length > 0) {
      lines.push(`- **Missing / OFF required gates:** ${p.missingRequiredGateIds.map((x) => `\`${x}\``).join(", ")}`);
    }
    lines.push(``);
    for (const g of p.gates) {
      const req = g.requiredByHarness ? "**required**" : "informational";
      lines.push(
        `- **${g.gateId}** (\`${g.envVar}\`, ${g.scope}) — if OFF → \`${g.whenOffLegacy}\` · raw=${g.rawValue === null ? "(unset)" : JSON.stringify(g.rawValue)} → **${g.parsedOn ? "ON" : "OFF"}** (${req})`,
      );
    }
    lines.push(``);
    for (const n of p.notes) {
      lines.push(`- ${n}`);
    }
    lines.push(``);
  }
  lines.push(`## Product note`);
  lines.push(``);
  lines.push(j.productNote ?? "(none)");
  lines.push(``);
  lines.push(`## Thread ids observed`);
  lines.push(``);
  lines.push(j.threadIdsObserved.map((id) => `- \`${id}\``).join("\n") || "(none)");
  lines.push(``);
  if (j.scenarioFailure) {
    lines.push(`## Scenario failure`);
    lines.push(``);
    lines.push(`- **Case:** ${j.scenarioFailure.caseId}`);
    lines.push(`- **Message:** ${j.scenarioFailure.message}`);
    if (j.scenarioFailure.diagnostics) {
      lines.push("");
      lines.push("```json");
      lines.push(JSON.stringify(j.scenarioFailure.diagnostics, null, 2));
      lines.push("```");
    }
    lines.push(``);
  }
  lines.push(`## Turns`);
  lines.push(``);
  for (const t of j.turns) {
    lines.push(`### ${t.caseId}`);
    lines.push(``);
    lines.push(`- **Sender:** ${t.sender}`);
    lines.push(`- **Subject:** ${t.subject}`);
    lines.push(`- **Expected:** ${t.expectedBehaviorClass}`);
    lines.push(`- **Inbound message id:** ${t.inbound?.id ?? "(not found)"}`);
    lines.push(`- **Thread id:** ${t.inbound?.thread_id ?? "(n/a)"}`);
    lines.push(`- **Wait:** ${t.wait?.status ?? "n/a"} — ${t.wait?.notes ?? ""} (${t.wait?.waitedMs ?? 0}ms)`);
    if (t.draftFinalization && t.draftFinalization.approvedDraftIds.length > 0) {
      lines.push(`- **Draft finalize (production path):** drafts ${t.draftFinalization.approvedDraftIds.join(", ")}`);
      for (const ev of t.draftFinalization.approvalEvents) {
        lines.push(
          `- **approval/draft.approved** draft \`${ev.draftId}\`: HTTP ${ev.inngestHttpStatus} · Inngest event id: ${ev.inngestEventId ?? "(parse failed)"}`,
        );
      }
      lines.push(
        `- **Outbound:** ${t.draftFinalization.outboundActions.map((a) => `${a.draftId} (${a.source})`).join("; ") || "(none)"}`,
      );
    }
    lines.push(
      `- **Outcome:** drafts ${t.outcomeSummary.draftCount}, outbound ${t.outcomeSummary.outboundCount}, escalations ${t.outcomeSummary.escalationCount}`,
    );
    if (t.threadMetadata) {
      lines.push(`- **Thread metadata:** \`ai_routing_metadata\` = ${JSON.stringify(t.threadMetadata.ai_routing_metadata)}`);
    }
    lines.push(``);
  }
  lines.push(`## Transcript (messages, chronological)`);
  lines.push(``);
  for (const m of j.transcript.messages) {
    lines.push(`### ${m.sent_at} — ${m.direction} — ${m.sender}`);
    lines.push(``);
    lines.push(`thread: \`${m.thread_id}\``);
    lines.push(``);
    lines.push("```");
    lines.push(m.body);
    lines.push("```");
    lines.push(``);
  }
  lines.push(`## Drafts (harness window)`);
  lines.push(``);
  for (const d of j.transcript.drafts) {
    lines.push(`- **${d.created_at}** [\`${d.id}\`] ${d.status} (${d.kind}) — ${d.body_preview.slice(0, 120)}…`);
  }
  lines.push(``);
  lines.push(`## Escalations (wedding scope, harness window)`);
  lines.push(``);
  for (const e of j.transcript.escalations) {
    lines.push(`- **${e.created_at}** [\`${e.id}\`] ${e.status} — ${e.reason_code}`);
  }
  return lines.join("\n");
}

async function main(): Promise<void> {
  if (!url || !sr) {
    console.error("Missing VITE_SUPABASE_URL / SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }
  if (!dryRun && !inngestKey) {
    console.error("Missing INNGEST_EVENT_KEY (required unless DRY_RUN=1)");
    process.exit(1);
  }

  if (!existsSync(fixturesPath)) {
    console.error("Fixtures file not found:", fixturesPath);
    process.exit(1);
  }

  const fixtures = JSON.parse(readFileSync(fixturesPath, "utf8")) as Fixtures;
  const { photographerId, weddingId: fixtureBaselineWeddingId, email: fixtureEmail } = fixtures;

  const runId = `V3VERIFY-${Date.now()}`;
  const coldSender = `v3verify_cold_${runId.replace(/[^a-zA-Z0-9]/g, "")}@qa.atelier.test`;
  const burstWithColdLead = mode === "burst";

  let cases: Case[];
  if (v3VerifyScenario === "conversation_smoke_3") {
    cases = buildConversationSmoke3Cases(runId);
  } else {
    cases = buildCases(runId, coldSender, { burstWithColdLead });
  }
  if (maxTurns !== null) {
    cases = cases.slice(0, maxTurns);
    console.log("V3_VERIFY_MAX_TURNS:", maxTurns, "(smoke / partial scenario)");
  }

  const supabase = createClient(url, sr, { auth: { persistSession: false, autoRefreshToken: false } });

  let activeWeddingId = fixtureBaselineWeddingId;
  let freshWeddingForRun = false;
  let clientPriorWeddingId: string | null = null;

  let previousSettings: Record<string, unknown> | null = null;
  let previousStage: string | null = null;
  let stageWasMutated = false;
  /** True when we inserted tagged `playbook_rules` + case `memories` for this run (conversation smoke). */
  let v3PolicyLayersSeeded = false;

  /** Harness metadata only — **not** a policy source (V3 policy lives in `playbook_rules` + case memory; see `seedV3HarnessPolicyLayersForConversationSmoke`). */
  const qaHarnessSettingsMeta = {
    run_id: runId,
    label: "V3 worker verification harness (QA)",
    updated_at: new Date().toISOString(),
  };

  const runStartedAt = new Date().toISOString();

  if (!dryRun) {
    const { data: ph, error: pErr } = await supabase
      .from("photographers")
      .select("id, settings")
      .eq("id", photographerId)
      .single();
    if (pErr || !ph) {
      console.error("photographer fetch failed:", pErr?.message);
      process.exit(1);
    }
    previousSettings =
      ph.settings && typeof ph.settings === "object" && !Array.isArray(ph.settings)
        ? { ...(ph.settings as Record<string, unknown>) }
        : {};

    const merged = {
      ...previousSettings,
      v3_worker_verification_harness: qaHarnessSettingsMeta,
    };
    const { error: upPh } = await supabase.from("photographers").update({ settings: merged }).eq("id", photographerId);
    if (upPh) {
      console.error("Failed to merge harness metadata into photographers.settings:", upPh.message);
      process.exit(1);
    }
    console.log("Merged harness metadata into photographers.settings.v3_worker_verification_harness (non-policy trace only)");

    const { data: clSnap, error: clSnapErr } = await supabase
      .from("clients")
      .select("wedding_id")
      .eq("email", fixtureEmail)
      .maybeSingle();
    if (clSnapErr) {
      console.error("client snapshot (for restore) failed:", clSnapErr.message);
      process.exit(1);
    }
    clientPriorWeddingId = clSnap?.wedding_id ?? null;

    if (shouldUseFreshWeddingForRun({ mode, dryRun: false, scenario: v3VerifyScenario })) {
      const { weddingId: wid } = await createFreshQaWeddingForRun(supabase, photographerId, runId);
      activeWeddingId = wid;
      freshWeddingForRun = true;
      console.log(
        "Fresh QA wedding row for isolation:",
        activeWeddingId,
        "(fixture baseline wedding:",
        fixtureBaselineWeddingId + ")",
      );
    }

    await ensureFixtureClientMapsToWedding(supabase, activeWeddingId, fixtureEmail);

    const skipPolicySeed = process.env.V3_VERIFY_SKIP_POLICY_SEED === "1" || process.env.V3_VERIFY_SKIP_POLICY_SEED === "true";
    if (mode === "email" && v3VerifyScenario === "conversation_smoke_3" && !skipPolicySeed) {
      try {
        await seedV3HarnessPolicyLayersForConversationSmoke(supabase, photographerId, activeWeddingId, runId);
        v3PolicyLayersSeeded = true;
      } catch (e) {
        console.error("[v3 harness] policy seed failed:", e instanceof Error ? e.message : e);
        process.exit(1);
      }
    } else if (skipPolicySeed && v3VerifyScenario === "conversation_smoke_3") {
      console.log("V3_VERIFY_SKIP_POLICY_SEED: skipping playbook_rules / memories seed");
    }

    const { data: wRow, error: wErr } = await supabase
      .from("weddings")
      .select("id, stage")
      .eq("id", activeWeddingId)
      .single();
    if (wErr || !wRow) {
      console.error("wedding fetch failed:", wErr?.message);
      process.exit(1);
    }
    previousStage = wRow.stage ?? null;
    /** Triage email path: bump wedding stage when needed for intake/routing gates. */
    if (mode === "email") {
      const activeStages = new Set(["booked", "prep", "final_balance"]);
      if (!activeStages.has(String(wRow.stage))) {
        console.log(`Setting wedding stage prep (was ${wRow.stage}) for active-intent coverage…`);
        const { error: stErr } = await supabase.from("weddings").update({ stage: "prep" }).eq("id", activeWeddingId);
        if (stErr) {
          console.error("Failed to set stage:", stErr.message);
          process.exit(1);
        }
        stageWasMutated = true;
      } else {
        console.log("Wedding stage already active:", wRow.stage);
      }
    }
  } else {
    console.log("DRY_RUN: skipping DB profile merge and stage tweak");
  }

  const ingestUrl = inngestKey ? "https://inn.gs/e/" + encodeURIComponent(inngestKey) : "";
  const productNote =
    "**Ingress:** `comms/email.received` → Inngest triage (`traffic-cop-triage`) and downstream V3 routing. " +
    "This harness does **not** send `ai/intent.persona` directly. " +
    "Triage often creates **one new `threads` row per inbound**; the report merges **all thread ids** observed for this client in the run window, ordered by `messages.sent_at`. " +
    "After each turn stabilizes, the harness emits **`approval/draft.approved`** to Inngest (same as `api-resolve-draft`), then waits for the **outbound** worker to insert a real **out** message. Synthetic outbound only if **`V3_VERIFY_SYNTHETIC_OUTBOUND_FALLBACK=1`**.";

  const productNoteBurst = "burst mode: fires `comms/email.received` with fixed delay only (no outcome wait).";

  console.log("\n========== V3 Worker Verification ==========");
  console.log(
    "mode:",
    mode,
    mode === "email" ? "(comms/email.received → triage + finalize drafts/outbound)" : "(burst delay only)",
  );
  console.log("runId:", runId);
  console.log("photographerId:", photographerId);
  console.log("V3_VERIFY_SCENARIO:", v3VerifyScenario);
  console.log("activeWeddingId (run):", activeWeddingId);
  console.log("freshWeddingForRun:", freshWeddingForRun);
  if (freshWeddingForRun) console.log("fixtureBaselineWeddingId (reference):", fixtureBaselineWeddingId);
  console.log("fixture client email:", fixtureEmail);
  if (burstWithColdLead) console.log("cold lead email (case 1):", coldSender);
  if (mode === "burst") console.log(`delay between cases (ms): ${delayMs}`);
  else
    console.log(
      `poll ${pollMs}ms · quiet ${quietMs}ms · turn max ${turnMaxMs}ms · post-approve outbound wait ${postApproveOutboundWaitMs}ms · turn gap ${turnGapMs}ms`,
    );
  console.log("V3_VERIFY_GATE_MODE:", v3VerifyGateMode);
  if (requireIntakePostBootstrapHarness) console.log("V3_VERIFY_REQUIRE_INTAKE_POST_BOOTSTRAP_EMAIL: on");
  console.log("===========================================\n");

  const productNoteForReport = mode === "email" ? productNote : productNoteBurst;

  const v3Preflight = buildV3PreflightReport({
    mode,
    dryRun,
    gateMode: v3VerifyGateMode,
    cases,
    requireIntakePostBootstrap: requireIntakePostBootstrapHarness,
  });

  console.log("--- V3 gate preflight (all gates checked; `1`/`true` = ON) ---");
  console.log(`  mode: ${v3Preflight.gateMode} · cases: ${v3Preflight.scenarioCaseIds.join(", ")}`);
  for (const g of v3Preflight.gates) {
    const rawDisp = g.rawValue === null ? "(unset)" : g.rawValue;
    console.log(
      `  ${g.gateId} ${g.envVar}=${rawDisp} → ${g.parsedOn ? "ON" : "OFF"}${g.requiredByHarness ? " [required]" : " [info]"}`,
    );
  }
  console.log(
    `  Valid for live V3 verification (required gates ON): ${v3Preflight.scenarioValidForLiveV3Verification ? "yes" : "NO"}`,
  );
  if (v3Preflight.missingRequiredGateIds.length > 0) {
    console.log(`  Missing required gate ids: ${v3Preflight.missingRequiredGateIds.join(", ")}`);
  }
  if (v3Preflight.skipped) console.log("  (preflight enforcement skipped — see report notes)");
  console.log("");

  const results: { caseId: string; httpStatus: number; ok: boolean; snippet: string }[] = [];
  const threadIdsObserved: string[] = [];
  const turns: TurnRecord[] = [];
  let scenarioFailure: { caseId: string; message: string; diagnostics?: Record<string, unknown> } | null = null;

  if (!dryRun && mode === "email" && !v3Preflight.skipped && !v3Preflight.scenarioValidForLiveV3Verification) {
    const missing = v3Preflight.gates.filter((g) => g.requiredByHarness && !g.parsedOn);
    scenarioFailure = {
      caseId: "_preflight",
      message:
        "V3 gate preflight failed: one or more **required** live cutover gates are OFF or unset in process.env. " +
        "A mixed legacy + live run is **invalid** for this harness (see report `## V3 gate preflight`). " +
        "Set every required `TRIAGE_LIVE_ORCHESTRATOR_*` / `INTAKE_LIVE_ORCHESTRATOR_*` secret to `1` or `true` on **Supabase Edge** and mirror in local `.env`, " +
        "or use `V3_VERIFY_GATE_MODE=scenario` with a smaller `V3_VERIFY_MAX_TURNS` so fewer gates apply. " +
        "`V3_VERIFY_SKIP_V3_PREFLIGHT=1` bypasses enforcement (not recommended).",
      diagnostics: {
        code: "V3_GATE_PREFLIGHT_FAILED",
        missingGateIds: v3Preflight.missingRequiredGateIds,
        missingGateEnvVars: missing.map((g) => g.envVar),
        v3Preflight,
      },
    };
    console.error("\n*** V3 GATE PREFLIGHT FAILED — aborting scenario (no comms/email.received sends) ***\n");
    console.error(scenarioFailure.message);
    for (const g of missing) {
      console.error(
        `  - ${g.gateId} \`${g.envVar}\` (${g.scope}) → need \`1\` or \`true\`; got ${g.rawValue === null ? "(unset)" : JSON.stringify(g.rawValue)} (off → ${g.whenOffLegacy})`,
      );
    }
    console.error("");
  }

  for (let i = 0; i < cases.length && !scenarioFailure; i++) {
    const c = cases[i];
    const from = c.sender === "cold_lead" ? coldSender : fixtureEmail;
    const marker = `[${c.id}] ${runId}`;
    const event = {
      name: "comms/email.received",
      data: {
        photographer_id: photographerId,
        raw_email: {
          from,
          body: c.body + footer(c.id, runId),
          subject: c.subject,
        },
      },
    };

    console.log(`\n--- Case ${i + 1}/${cases.length}: ${c.id} ---`);
    console.log("subject:", c.subject);
    console.log("sender:", from);

    if (dryRun) {
      console.log("request: (dry run — not sent)");
      results.push({ caseId: c.id, httpStatus: 0, ok: true, snippet: "DRY_RUN" });
      turns.push({
        caseId: c.id,
        expectedBehaviorClass: c.expectedBehaviorClass,
        sender: from,
        subject: c.subject,
        inngestEventId: null,
        inbound: null,
        wait: null,
        threadMetadata: null,
        inngestRunsSnippet: null,
        outcomeSummary: {
          draftCount: 0,
          outboundCount: 0,
          escalationCount: 0,
          draftKinds: {},
          hadOutbound: false,
          hadDraft: false,
          hadEscalation: false,
        },
      });
      continue;
    }

    const res = await fetch(ingestUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify([event]),
    });
    const text = await res.text();
    const ok = res.ok;
    results.push({ caseId: c.id, httpStatus: res.status, ok, snippet: text.slice(0, 300) });
    console.log("result:", res.status, ok ? "ok" : "FAIL", text.slice(0, 200));

    let eventId: string | null = null;
    try {
      eventId = JSON.parse(text).ids?.[0] ?? null;
    } catch {
      /* */
    }

    if (mode === "burst") {
      if (i < cases.length - 1) {
        console.log(`waiting ${delayMs}ms before next case (burst)…`);
        await sleep(delayMs);
      }
      turns.push({
        caseId: c.id,
        expectedBehaviorClass: c.expectedBehaviorClass,
        sender: from,
        subject: c.subject,
        inngestEventId: eventId,
        inbound: null,
        wait: null,
        threadMetadata: null,
        inngestRunsSnippet: await fetchInngestRunsSnippet(eventId),
        outcomeSummary: {
          draftCount: 0,
          outboundCount: 0,
          escalationCount: 0,
          draftKinds: {},
          hadOutbound: false,
          hadDraft: false,
          hadEscalation: false,
        },
      });
      continue;
    }

    // email mode: triage path — strict persisted outcome only
    const inbound = await waitForInboundWithMarker(supabase, photographerId, marker, turnMaxMs);
    if (inbound?.thread_id && !threadIdsObserved.includes(inbound.thread_id)) {
      threadIdsObserved.push(inbound.thread_id);
    }
    if (!inbound) {
      scenarioFailure = {
        caseId: c.id,
        message: "Inbound with case marker not found within turn max — triage/ingestion may have failed.",
        diagnostics: { marker, eventId },
      };
      break;
    }

    console.log("inbound persisted:", inbound.id, "thread:", inbound.thread_id);

    const wait = await waitForTurnProcessingStrict(
      supabase,
      photographerId,
      activeWeddingId,
      inbound.thread_id,
      inbound.sent_at,
    );
    console.log("turn wait:", wait.status, `(${wait.waitedMs}ms)`, wait.notes.slice(0, 120));

    if (wait.status !== "stable") {
      scenarioFailure = {
        caseId: c.id,
        message: wait.notes,
        diagnostics: {
          waitStatus: wait.status,
          threadId: inbound.thread_id,
          weddingId: activeWeddingId,
          artifacts: wait.finalArtifacts,
        },
      };
      break;
    }

    let draftFinalization: TurnRecord["draftFinalization"];
    try {
      console.log("[finalize] emitting approval/draft.approved (production path) / polling for outbound…");
      draftFinalization = await finalizePendingDraftsForTurn(
        supabase,
        photographerId,
        inbound.thread_id,
        inbound.sent_at,
        ingestUrl,
      );
      if (draftFinalization.approvedDraftIds.length > 0) {
        console.log(
          "[finalize] approval events sent for:",
          draftFinalization.approvedDraftIds.join(", "),
          "outbound:",
          draftFinalization.outboundActions.map((a) => `${a.source}`).join(", "),
        );
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      scenarioFailure = {
        caseId: c.id,
        message: "draft finalize failed: " + msg,
        diagnostics: await gatherThreadDiagnostics(supabase, photographerId, activeWeddingId, inbound.thread_id),
      };
      break;
    }

    const tm = await fetchThreadMetadata(supabase, inbound.thread_id);
    const draftKinds: Record<string, number> = {};
    for (const d of wait.finalArtifacts.drafts) {
      const k = classifyDraft(d);
      draftKinds[k] = (draftKinds[k] ?? 0) + 1;
    }

    turns.push({
      caseId: c.id,
      expectedBehaviorClass: c.expectedBehaviorClass,
      sender: from,
      subject: c.subject,
      inngestEventId: eventId,
      inbound,
      wait,
      threadMetadata: tm.row,
      inngestRunsSnippet: await fetchInngestRunsSnippet(eventId),
      draftFinalization,
      outcomeSummary: {
        draftCount: wait.finalArtifacts.drafts.length,
        outboundCount: wait.finalArtifacts.outbound.length,
        escalationCount: wait.finalArtifacts.escalations.length,
        draftKinds,
        hadOutbound: wait.finalArtifacts.outbound.length > 0,
        hadDraft: wait.finalArtifacts.drafts.length > 0,
        hadEscalation: wait.finalArtifacts.escalations.length > 0,
      },
    });

    if (i < cases.length - 1 && turnGapMs > 0) {
      console.log(`[wait] ${turnGapMs}ms before next inbound…`);
      await sleep(turnGapMs);
    }
  }

  if (!dryRun && previousSettings !== null) {
    if (v3PolicyLayersSeeded) {
      await cleanupV3HarnessPolicyArtifacts(supabase, photographerId);
      console.log("Removed tagged V3 harness playbook_rules + case memories (cleanup).");
    }

    const { error: restoreErr } = await supabase
      .from("photographers")
      .update({ settings: previousSettings })
      .eq("id", photographerId);
    if (restoreErr) {
      console.warn("Could not restore photographers.settings (remove v3_worker_verification_harness manually):", restoreErr.message);
    } else {
      console.log("\nRestored photographers.settings to pre-run snapshot.");
    }

    if (stageWasMutated && previousStage !== null) {
      const { error: rs } = await supabase.from("weddings").update({ stage: previousStage }).eq("id", activeWeddingId);
      if (rs) console.warn("Could not restore wedding stage:", rs.message);
      else console.log("Restored wedding.stage to:", previousStage);
    }

    if (freshWeddingForRun && clientPriorWeddingId !== null) {
      const { data: clRow, error: clFindErr } = await supabase
        .from("clients")
        .select("id")
        .eq("email", fixtureEmail)
        .maybeSingle();
      if (clFindErr) {
        console.warn("Could not find fixture client to restore wedding_id:", clFindErr.message);
      } else if (clRow?.id) {
        const { error: cr } = await supabase
          .from("clients")
          .update({ wedding_id: clientPriorWeddingId })
          .eq("id", clRow.id);
        if (cr) console.warn("Could not restore clients.wedding_id:", cr.message);
        else
          console.log(
            "Restored fixture client wedding_id to pre-run value:",
            clientPriorWeddingId,
            "(isolation wedding left in DB:",
            activeWeddingId + ")",
          );
      }
    }
  }

  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const reportsDir = join(root, "reports");
  mkdirSync(reportsDir, { recursive: true });
  const baseName = `v3-thread-verification-${ts}`;

  let transcript: ReportJson["transcript"] = { messages: [], drafts: [], escalations: [] };
  let finalThreadIds = threadIdsObserved;
  if (!dryRun) {
    const sendersForResolve = [fixtureEmail];
    if (burstWithColdLead) sendersForResolve.push(coldSender);
    let mergedThreadIds = [...new Set([...threadIdsObserved])];
    try {
      const resolved = await resolveThreadIdsFromMessages(supabase, photographerId, runStartedAt, sendersForResolve);
      mergedThreadIds = [...new Set([...mergedThreadIds, ...resolved])];
    } catch {
      /* */
    }
    finalThreadIds = mergedThreadIds;
    if (mergedThreadIds.length > 0) {
      try {
        transcript = await collectTranscript(supabase, photographerId, activeWeddingId, mergedThreadIds, runStartedAt);
      } catch (e) {
        console.warn("Transcript collection failed:", e instanceof Error ? e.message : e);
      }
    }
  }

  const reportJson: ReportJson = {
    schema: "v3_thread_verification_v1",
    generatedAt: new Date().toISOString(),
    mode,
    runId,
    photographerId,
    weddingId: activeWeddingId,
    fixtureClientEmail: fixtureEmail,
    coldSender: burstWithColdLead ? coldSender : null,
    productNote: productNoteForReport,
    dryRun,
    v3Preflight,
    scenarioFailure,
    threadIdsObserved: finalThreadIds,
    turns,
    transcript,
    testIsolation: {
      harnessScenario: v3VerifyScenario,
      freshWeddingCreatedForRun: freshWeddingForRun,
      fixtureBaselineWeddingId,
      activeWeddingId,
      clientWeddingIdBeforeRepoint: clientPriorWeddingId,
      v3PolicyLayersSeeded,
    },
  };

  const jsonPath = join(reportsDir, `${baseName}.json`);
  const mdPath = join(reportsDir, `${baseName}.md`);
  writeFileSync(jsonPath, JSON.stringify(reportJson, null, 2), "utf8");
  writeFileSync(mdPath, buildMarkdown(reportJson), "utf8");
  console.log(`\nWrote:\n  ${jsonPath}\n  ${mdPath}`);

  console.log("\n========== Operator verification checklist ==========");
  if (mode === "email") {
    console.log("1. Ingress: `comms/email.received` → triage + V3 routing (no direct persona events from harness).");
    console.log(
      "2. Gate preflight: default `V3_VERIFY_GATE_MODE=scenario` unions required CUT4–CUT8 gates for the cases you run; use `strict_lifecycle` to require all five triage gates (+ optional intake env).",
    );
    console.log(
      "3. Per turn: stable draft/out/esc → emit approval/draft.approved → wait for outbound worker (synthetic only if V3_VERIFY_SYNTHETIC_OUTBOUND_FALLBACK=1).",
    );
    console.log("4. Artifacts: reports/v3-thread-verification-*.md + .json");
  } else {
    console.log("1. Burst: check Inngest manually; no per-turn outcome wait.");
    console.log("2. Artifacts: reports/v3-thread-verification-*.md + .json");
  }
  console.log("====================================================\n");

  const failed = results.filter((r) => !r.ok);
  if (failed.length > 0) {
    console.error("Some Inngest sends failed:", failed);
    process.exit(1);
  }
  if (scenarioFailure) {
    console.error("Scenario failed:", scenarioFailure.caseId, scenarioFailure.message);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
