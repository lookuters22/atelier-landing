/**
 * V3 RBAC / audience safety — live DB proof (Stress Tests 7, 5, 8 participant shapes).
 *
 * Seeds per-case wedding + thread + people + wedding_people + thread_participants + memory,
 * runs the same `buildDecisionContext` path as production via `buildDecisionContextQaProofPair`,
 * and records pre/post redaction + `auditPlannerPrivateLeakage` on controlled draft strings.
 *
 * Run: npx tsx scripts/v3_rbac_audience_proof_harness.ts
 * npm run v3:proof-rbac-audience
 *
 * Requires: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY; optional `supabase/functions/inngest/.qa_fixtures.json` for photographerId.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { buildDecisionContextQaProofPair } from "../supabase/functions/_shared/context/buildDecisionContext.ts";
import { auditPlannerPrivateLeakage } from "../supabase/functions/_shared/orchestrator/auditPlannerPrivateLeakage.ts";
import {
  STRESS_TEST_7_CLEAN_DRAFT_SIMULATION,
  STRESS_TEST_7_LEAKY_DRAFT_SIMULATION,
  STRESS_TEST_RBAC_LIVE_HARNESS_MEMORY,
} from "../supabase/functions/_shared/qa/stressTestAudienceFixtures.ts";
import {
  cleanupCaseLoose,
  seedRbacHarnessCase,
  type RbacHarnessCaseId,
} from "./v3_rbac_audience_seed_module.ts";

export { cleanupCaseLoose, seedRbacHarnessCase, type RbacHarnessCaseId };

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

loadEnv();

const url = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL;
const sr = process.env.SUPABASE_SERVICE_ROLE_KEY;

const fixturesPath = join(root, "supabase/functions/inngest/.qa_fixtures.json");

const STRESS7_MEMORY_BODY = STRESS_TEST_RBAC_LIVE_HARNESS_MEMORY;
const BAD_DRAFT_SIMULATING_LEAK = STRESS_TEST_7_LEAKY_DRAFT_SIMULATION;
const CLEAN_DRAFT = STRESS_TEST_7_CLEAN_DRAFT_SIMULATION;

function textHasStress7Signals(text: string): boolean {
  const t = text.toLowerCase();
  return (
    t.includes("planner commission") ||
    t.includes("agency fee") ||
    t.includes("internal negotiation") ||
    /\bmarkup\b/i.test(text)
  );
}

type CaseResult = {
  case: RbacHarnessCaseId;
  weddingId: string;
  threadId: string;
  memoryId: string;
  personIds: string[];
  visibilityClass: string;
  clientVisibleForPrivateCommercialRedaction: boolean;
  sensitivePresentInMemoryBeforeRedaction: boolean;
  sensitivePresentInMemoryAfterRedaction: boolean;
  sensitivePresentInSelectedMemoryFullContentAfter: boolean;
  leakAudit_badDraft_withAudienceEnforcement: { isValid: boolean; violations: string[] };
  leakAudit_cleanDraft_withAudienceEnforcement: { isValid: boolean; violations: string[] };
  proofChecks: {
    redactionRemovedSensitiveWhenEnforced: boolean;
    cleanDraftPassesUnderEnforcement: boolean;
    badDraftBlockedWhenEnforcementOn: boolean;
    badDraftAllowedWhenEnforcementOff: boolean;
  };
};

async function runCase(
  supabase: SupabaseClient,
  photographerId: string,
  caseId: RbacHarnessCaseId,
  runId: string,
): Promise<CaseResult> {
  const { weddingId, threadId, memoryId, personIds } = await seedRbacHarnessCase(
    supabase,
    photographerId,
    caseId,
    runId,
  );

  const rawMessage =
    "[rbac_proof] Stress Tests 7/5/8 — please confirm next steps. " +
    "(Planner commission / agency fee are in case memory for this harness.)";

  const { preRedaction, postRedaction } = await buildDecisionContextQaProofPair(
    supabase,
    photographerId,
    weddingId,
    threadId,
    "email",
    rawMessage,
    { selectedMemoryIds: [memoryId] },
  );

  const memPre = preRedaction.selectedMemories[0]?.full_content ?? "";
  const memPost = postRedaction.selectedMemories[0]?.full_content ?? "";

  const enforce = postRedaction.audience.clientVisibleForPrivateCommercialRedaction;

  const badWithEnforcementFlag = auditPlannerPrivateLeakage(BAD_DRAFT_SIMULATING_LEAK, enforce);
  const cleanWithEnforcementFlag = auditPlannerPrivateLeakage(CLEAN_DRAFT, enforce);

  const sensitiveBefore = textHasStress7Signals(memPre);
  const sensitiveAfter = textHasStress7Signals(memPost);

  const redactionRemovedSensitiveWhenEnforced = enforce ? !sensitiveAfter && sensitiveBefore : true;
  const cleanDraftPassesUnderEnforcement = cleanWithEnforcementFlag.isValid === true;
  const badDraftBlockedWhenEnforcementOn = enforce ? badWithEnforcementFlag.isValid === false : true;
  const badDraftAllowedWhenEnforcementOff = !enforce ? badWithEnforcementFlag.isValid === true : true;

  return {
    case: caseId,
    weddingId,
    threadId,
    memoryId,
    personIds,
    visibilityClass: postRedaction.audience.visibilityClass,
    clientVisibleForPrivateCommercialRedaction: enforce,
    sensitivePresentInMemoryBeforeRedaction: sensitiveBefore,
    sensitivePresentInMemoryAfterRedaction: sensitiveAfter,
    sensitivePresentInSelectedMemoryFullContentAfter: sensitiveAfter,
    leakAudit_badDraft_withAudienceEnforcement: badWithEnforcementFlag,
    leakAudit_cleanDraft_withAudienceEnforcement: cleanWithEnforcementFlag,
    proofChecks: {
      redactionRemovedSensitiveWhenEnforced,
      cleanDraftPassesUnderEnforcement,
      badDraftBlockedWhenEnforcementOn,
      badDraftAllowedWhenEnforcementOff,
    },
  };
}

async function main(): Promise<void> {
  if (!url || !sr) {
    console.error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }

  let photographerId: string;
  if (existsSync(fixturesPath)) {
    const fx = JSON.parse(readFileSync(fixturesPath, "utf8")) as { photographerId?: string };
    if (!fx.photographerId) {
      console.error(".qa_fixtures.json missing photographerId");
      process.exit(1);
    }
    photographerId = fx.photographerId;
  } else {
    console.error("Missing supabase/functions/inngest/.qa_fixtures.json (need photographerId)");
    process.exit(1);
  }

  const supabase = createClient(url, sr, { auth: { persistSession: false, autoRefreshToken: false } });
  const runId = `RBAC-${Date.now()}`;
  const cases: RbacHarnessCaseId[] = [
    "st7_planner_only",
    "st7_client_visible",
    "st7_mixed_audience",
    "st5_agency_cc_mixed",
    "st5_agency_internal_only",
    "st5_direct_client",
    "st8_planner_groom_mixed",
    "st8_planner_unknown_outreach",
  ];
  const results: CaseResult[] = [];

  for (const c of cases) {
    const r = await runCase(supabase, photographerId, c, runId);
    results.push(r);
    await cleanupCaseLoose(supabase, r.weddingId, r.threadId, r.memoryId, r.personIds);
  }

  const allRedactionOk = results.every(
    (r) =>
      !r.clientVisibleForPrivateCommercialRedaction || r.proofChecks.redactionRemovedSensitiveWhenEnforced,
  );
  const allLeakRulesOk = results.every(
    (r) =>
      r.proofChecks.cleanDraftPassesUnderEnforcement &&
      r.proofChecks.badDraftBlockedWhenEnforcementOn &&
      r.proofChecks.badDraftAllowedWhenEnforcementOff,
  );
  const verdict =
    allRedactionOk && allLeakRulesOk
      ? "PASS — live DB context assembly + redaction + leakage auditor behaviors match expectations for all Stress Test 7/5/8 harness cases."
      : "PARTIAL — see per-case proofChecks and JSON.";

  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const reportsDir = join(root, "reports");
  mkdirSync(reportsDir, { recursive: true });
  const base = `v3-rbac-audience-proof-${ts}`;
  const jsonPath = join(reportsDir, `${base}.json`);
  const mdPath = join(reportsDir, `${base}.md`);

  const jsonOut = {
    schema: "v3_rbac_audience_proof_v2",
    generatedAt: new Date().toISOString(),
    runId,
    photographerId,
    stressTestMemoryExcerpt: STRESS7_MEMORY_BODY.slice(0, 200),
    /** @deprecated same as stressTestMemoryExcerpt — kept for report parsers */
    stressTest7MemoryExcerpt: STRESS7_MEMORY_BODY.slice(0, 200),
    syntheticDrafts: { BAD_DRAFT_SIMULATING_LEAK, CLEAN_DRAFT },
    verdict,
    allRedactionOk,
    allLeakRulesOk,
    cases: results,
  };

  writeFileSync(jsonPath, JSON.stringify(jsonOut, null, 2), "utf8");

  const md = `# V3 RBAC audience safety — live DB proof

- **Generated:** ${new Date().toISOString()}
- **Run ID:** ${runId}
- **JSON:** \`${jsonPath.replace(/\\/g, "/")}\`

## Verdict

${verdict}

## What was proven

1. **Real Supabase path:** \`buildDecisionContextQaProofPair\` → same loads as production (\`buildDecisionContext\`), with **pre**/**post** redaction snapshots.
2. **Shared memory blob:** planner commission, agency fee, internal negotiation / markup language in \`memories.full_content\` (selected for the turn) — same text for all scenarios; participant rows differ by Stress Test family.
3. **Per-case audience:** seeded \`thread_participants\` + \`wedding_people\` for ST7 baseline, ST5 agency CC / internal / direct client, ST8 groom merge + unknown outreach.
4. **Leakage auditor:** deterministic \`auditPlannerPrivateLeakage\` on synthetic “bad” vs “clean” draft strings (same function as persona pipeline).

## Results table

| Case | visibilityClass | clientVisibleRedaction | Sensitive before (memory) | Sensitive after (memory) | redactionRemoved* | bad draft / clean draft (enforced) |
|------|-----------------|-------------------------|---------------------------|--------------------------|-------------------|-------------------------------------|
${results
  .map(
    (r) =>
      `| **${r.case}** | ${r.visibilityClass} | ${r.clientVisibleForPrivateCommercialRedaction} | ${r.sensitivePresentInMemoryBeforeRedaction} | ${r.sensitivePresentInMemoryAfterRedaction} | ${r.proofChecks.redactionRemovedSensitiveWhenEnforced} | bad: ${r.leakAudit_badDraft_withAudienceEnforcement.isValid ? "allowed" : "blocked"} / clean: ${r.leakAudit_cleanDraft_withAudienceEnforcement.isValid ? "ok" : "fail"} |`,
  )
  .join("\n")}

\\* When redaction flag is false (planner-only), memory text may still contain sensitive tokens — expected.

## Stress Tests 7 / 5 / 8 live-style replay status

- **Proven here:** End-to-end **database-backed** decision context, audience resolution, upstream redaction, and leakage auditor rules (plus synthetic draft probes) across eight participant shapes.
- **Offline parity:** \`npm run v3:proof-stress5-8-rbac-audience\` (Vitest).
- **Not in this harness:** Full Inngest \`clientOrchestratorV1\` + Anthropic persona in one run (optional follow-up).

## Raw JSON cases

\`\`\`json
${JSON.stringify(results, null, 2).slice(0, 12000)}
\`\`\`
`;

  writeFileSync(mdPath, md, "utf8");

  console.log(`Wrote:\n  ${mdPath}\n  ${jsonPath}`);
  console.log(JSON.stringify({ verdict, allRedactionOk, allLeakRulesOk }, null, 2));

  if (!allRedactionOk || !allLeakRulesOk) {
    process.exit(2);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
