/**
 * V3 real-conversation stress replay - batch 2 (stress tests 3, 4, 5, 7).
 *
 * Run: npx tsx scripts/v3_stress_replay_batch2.ts
 * npm run v3:stress-replay-batch2
 */
import { existsSync, mkdirSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import type { StressReplayDecisionPoint } from "../supabase/functions/_shared/qa/v3StressReplayBatch1Harness.ts";
import { runBatch2Harness } from "../supabase/functions/_shared/qa/v3StressReplayBatch2Harness.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

function laneSummary(r: Awaited<ReturnType<typeof runBatch2Harness>>[number]): string {
  const lanes: string[] = [];
  if (r.multiWeddingIdentityAmbiguous) lanes.push("identity_phase1_multi_wedding");
  if (r.identityEntityPhase2Detected) lanes.push("identity_entity_phase2");
  if (r.irregularSettlementDetected) lanes.push("irregular_settlement");
  if (r.bankingComplianceExceptionDetected) lanes.push("banking_compliance_exception");
  if (r.visualAssetVerificationDetected) lanes.push("visual_asset_verification");
  if (r.sensitivePersonalDocumentDetected) lanes.push("sensitive_personal_document");
  if (r.authorityPolicyDetected) lanes.push("authority_policy_ap1");
  if (r.highMagnitudeClientConcessionDetected) lanes.push("high_magnitude_client_concession");
  if (r.strategicTrustRepairDetected) lanes.push("strategic_trust_repair");
  if (r.nonCommercialDetected) lanes.push("non_commercial_escalation");
  if (r.workflowRoutineDraftSuppressed) lanes.push("workflow_routine_send_suppressed");
  return lanes.length ? lanes.join(", ") : "(none — proposals + verifier only)";
}

async function main(): Promise<void> {
  const results = await runBatch2Harness();
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const reportName = `v3-stress-replay-batch2-${stamp}.md`;
  const reportsDir = join(root, "reports");
  if (!existsSync(reportsDir)) mkdirSync(reportsDir, { recursive: true });
  const outPath = join(reportsDir, reportName);

  const lines: string[] = [];
  lines.push("# V3 stress replay - batch 2 (stress tests 3, 4, 5, 7)");
  lines.push("");
  lines.push(`**Generated:** ${new Date().toISOString()}`);
  lines.push("");
  lines.push("## Method");
  lines.push("");
  lines.push("- Harness: [`supabase/functions/_shared/qa/v3StressReplayBatch2Harness.ts`](../supabase/functions/_shared/qa/v3StressReplayBatch2Harness.ts)");
  lines.push(
    "- Shared evaluators: [`v3StressReplayBatch1Harness.ts`](../supabase/functions/_shared/qa/v3StressReplayBatch1Harness.ts) (`evaluateDecisionPoint`, verifier replay parity).",
  );
  lines.push(
    "- Sources: `Ana real pdf/3|4|5|7/stress test *.txt` + [REAL_CONVERSATION_STRESS_TEST_PLAN.md](../docs/v3/REAL_CONVERSATION_STRESS_TEST_PLAN.md).",
  );
  lines.push(
    "- Runtime: deterministic `proposeClientOrchestratorCandidateActions` + `executeToolVerifierReplay` + local outcome map (no DB / no Inngest).",
  );
  lines.push("");
  lines.push("## Summary table");
  lines.push("");
  lines.push(
    "| ID | ST | Verifier | Outcome | Result class | AP1? | CCM? | STR? | NC? | ISR? | BC? | VAV? | SPD? | IE2? | Multi-wedding? | Workflow suppress? | Operator? | Detector / lane summary |",
  );
  lines.push(
    "|----|----|----------|---------|--------------|------|------|------|-----|------|-----|------|------|------|----------------|-------------------|-----------|-------------------------|",
  );
  for (const r of results) {
    const d = r.decisionPoint;
    lines.push(
      `| ${d.id} | ${d.stressTest} | ${r.verifierSuccess ? "pass" : "fail"} | ${r.orchestratorOutcome} | ${r.resultClass} | ${r.authorityPolicyDetected ? "yes" : "no"} | ${r.highMagnitudeClientConcessionDetected ? "yes" : "no"} | ${r.strategicTrustRepairDetected ? "yes" : "no"} | ${r.nonCommercialDetected ? "yes" : "no"} | ${r.irregularSettlementDetected ? "yes" : "no"} | ${r.bankingComplianceExceptionDetected ? "yes" : "no"} | ${r.visualAssetVerificationDetected ? "yes" : "no"} | ${r.sensitivePersonalDocumentDetected ? "yes" : "no"} | ${r.identityEntityPhase2Detected ? "yes" : "no"} | ${r.multiWeddingIdentityAmbiguous ? "yes" : "no"} | ${r.workflowRoutineDraftSuppressed ? "yes" : "no"} | ${r.operatorRoutingProposed ? "yes" : "no"} | ${laneSummary(r)} |`,
    );
  }
  lines.push("");
  lines.push("## Per stress test — condensed findings");
  lines.push("");
  for (const st of [3, 4, 5, 7] as const) {
    const subset = results.filter((r) => r.decisionPoint.stressTest === st);
    lines.push(`### Stress test ${st}`);
    lines.push("");
    lines.push("| Decision point | Proposal families | Verifier | Outcome | Class | Lanes fired | V3 OK | Product slice still needed |");
    lines.push("|----------------|-------------------|----------|---------|-------|-------------|-------|---------------------------|");
    for (const r of subset) {
      const d = r.decisionPoint;
      const v3ok = summarizeV3Ok(r);
      const gap = gapStillNeeded(d.primaryGapIfUnmet, r);
      lines.push(
        `| ${d.id} | ${r.proposalFamilies.join(", ")} | ${r.verifierSuccess ? "pass" : "fail"} | ${r.orchestratorOutcome} | ${r.resultClass} | ${laneSummary(r)} | ${v3ok} | ${gap} |`,
      );
    }
    lines.push("");
  }

  lines.push("## Per decision point (detail)");
  lines.push("");

  for (const r of results) {
    const d = r.decisionPoint;
    lines.push(`### ${d.id} (Stress test ${d.stressTest})`);
    lines.push("");
    lines.push(`**Title:** ${d.title}`);
    lines.push("");
    lines.push("**Expected (product / stress notes)**");
    lines.push("");
    lines.push(d.expectedProductBehavior);
    lines.push("");
    lines.push("**Gap category if unmet**");
    lines.push("");
    lines.push(`\`${d.primaryGapIfUnmet}\``);
    lines.push("");
    lines.push("**Observed (this harness)**");
    lines.push("");
    lines.push(`- Proposal action families: ${r.proposalFamilies.join(", ")}`);
    lines.push(`- Verifier: ${r.verifierSuccess ? "passed" : "blocked"}`);
    lines.push(`- Mapped outcome: \`${r.orchestratorOutcome}\``);
    lines.push(`- Class: **${r.resultClass}**`);
    lines.push(`- **Detector / policy lanes:** ${laneSummary(r)}`);
    lines.push(
      `- Workflow blocks routine client \`send_message\`: **${r.workflowRoutineDraftSuppressed ? "yes" : "no"}**`,
    );
    lines.push(
      `- Multi-wedding identity (Phase 1): **${r.multiWeddingIdentityAmbiguous ? "yes" : "no"}**`,
    );
    lines.push(`- Identity/entity Phase 2: **${r.identityEntityPhase2Detected ? "yes" : "no"}**`);
    lines.push(
      `- Irregular settlement / tax-avoidance gate (ISR): **${r.irregularSettlementDetected ? "yes" : "no"}**`,
    );
    lines.push(
      `- Banking/compliance exception: **${r.bankingComplianceExceptionDetected ? "yes" : "no"}**`,
    );
    lines.push(`- Visual/asset verification: **${r.visualAssetVerificationDetected ? "yes" : "no"}**`);
    lines.push(
      `- Sensitive identity-document handling (SPD): **${r.sensitivePersonalDocumentDetected ? "yes" : "no"}**`,
    );
    lines.push(`- Authority policy (AP1): **${r.authorityPolicyDetected ? "yes" : "no"}**`);
    lines.push(
      `- High-magnitude client/payer concession (CCM): **${r.highMagnitudeClientConcessionDetected ? "yes" : "no"}**`,
    );
    lines.push(
      `- Strategic trust-repair / contradiction-expectation (STR): **${r.strategicTrustRepairDetected ? "yes" : "no"}**`,
    );
    lines.push(`- Non-commercial escalation (NC): **${r.nonCommercialDetected ? "yes" : "no"}**`);
    lines.push(`- Operator routing candidate: **${r.operatorRoutingProposed ? "yes" : "no"}**`);
    lines.push("");
    lines.push("**What V3 handled correctly**");
    lines.push("");
    lines.push(detailV3HandledWell(r));
    lines.push("");
    lines.push("**What still requires a product slice**");
    lines.push("");
    lines.push(detailProductSlice(d, r));
    lines.push("");
  }

  lines.push("## Aggregate: what batch 2 added vs batch 1 lanes");
  lines.push("");
  lines.push(
    "- **Tax / shadow-finance phrasing** (cash + VAT): handled by **ISR** (`irregular_settlement_safe` on `st3-cash-commission-vat-avoidance`) — distinct from BC payment-rail detection.",
  );
  lines.push(
    "- **Client-originated large concessions** (`st4-client-jumbo-album-discount`, `st7-client-hard-cap-reduce-price`): **CCM** (`high_magnitude_client_concession_safe`) — distinct from AP1 (same sender, magnitude too high for routine path).",
  );
  lines.push(
    "- **Planner / commercial authority** (5 / 7): AP1 + operator routing shows up on budget redlines, fee moves, and dual-quote turf messages when messengers are `planner`.",
  );
  lines.push(
    "- **Visual lane** catches layout/spread/Canva-shaped text; **SPD** covers government-ID / passport / DOB-on-security-list-shaped planner asks (`st4-planner-passport-pii-thread`) — distinct from VAV/BC.",
  );
  lines.push(
    "- **STR (strategic trust-repair)** — contradiction / expectation-mismatch / credibility-risk inbound (`st7-fully-booked-reversal-confusion` → `strategic_trust_repair_safe`); operator routing precedes routine send; distinct from NC and AP1.",
  );
  lines.push("");
  lines.push("## Top 3 highest-value gaps (batch 2)");
  lines.push("");
  lines.push(
    "1. **Broader settlement edge cases** — ISR covers narrow conjunctions; expand only with regression tests if new real threads slip through.",
  );
  lines.push(
    "2. **CCM edge cases** — narrow conjunctions and numeric heuristics; expand with regression tests if real threads slip through.",
  );
  lines.push(
    "3. **STR edge cases** — narrow prior-reference + mismatch conjunctions; expand with regression tests if contradiction threads slip through without operator routing.",
  );
  lines.push("");
  lines.push("## Recommended next single implementation slice after batch 2");
  lines.push("");
  lines.push(
    "**Operator tooling for STR threads** — deterministic proposal gate surfaces `v3_strategic_trust_repair`; product still owns human reply templates, CRM notes, and durable pause/resume around reconciliation.",
  );
  lines.push("");

  writeFileSync(outPath, lines.join("\n"), "utf8");
  console.log(`Wrote ${outPath}`);
}

function summarizeV3Ok(r: Awaited<ReturnType<typeof runBatch2Harness>>[number]): string {
  if (!r.verifierSuccess) return "Verifier blocked unsafe mode";
  if (r.authorityPolicyDetected && r.resultClass === "authority_policy_safe") return "AP1 blocked routine commit draft";
  if (r.highMagnitudeClientConcessionDetected && r.resultClass === "high_magnitude_client_concession_safe") {
    return "CCM lane + gated draft path";
  }
  if (r.strategicTrustRepairDetected && r.resultClass === "strategic_trust_repair_safe") {
    return "STR lane + gated draft path";
  }
  if (r.nonCommercialDetected && r.resultClass === "non_commercial_escalation_safe") {
    return "NC lane + gated draft path";
  }
  if (r.irregularSettlementDetected && r.resultClass === "irregular_settlement_safe") return "ISR lane + gated draft path";
  if (r.bankingComplianceExceptionDetected && r.resultClass === "banking_compliance_exception_safe") return "BC lane + gated draft path";
  if (r.visualAssetVerificationDetected && r.resultClass === "visual_asset_verification_safe") return "VAV lane + gated draft path";
  if (r.sensitivePersonalDocumentDetected && r.resultClass === "sensitive_identity_document_safe") {
    return "SPD lane + gated draft path";
  }
  if (r.identityEntityPhase2Detected && r.resultClass === "identity_entity_routing_safe") return "IE2 lane + operator/clarify path";
  if (r.multiWeddingIdentityAmbiguous && r.resultClass === "identity_ambiguity_safe") return "Multi-wedding disambiguation path";
  if (r.operatorRoutingProposed && r.resultClass === "operator_surface") return "Operator candidate surfaced";
  if (r.resultClass === "safe_draft_path" && r.operatorRoutingProposed) return "Draft-safe + operator optional";
  if (r.resultClass === "safe_draft_path") return "Draft-only path (see gap)";
  if (r.resultClass === "workflow_suppresses_routine_send") return "Workflow suppressed routine send";
  return "See detail";
}

function gapStillNeeded(
  cat: string,
  r: Awaited<ReturnType<typeof runBatch2Harness>>[number],
): string {
  if (cat === "none_observed") return "—";
  const anyLane =
    r.authorityPolicyDetected ||
    r.highMagnitudeClientConcessionDetected ||
    r.strategicTrustRepairDetected ||
    r.nonCommercialDetected ||
    r.irregularSettlementDetected ||
    r.bankingComplianceExceptionDetected ||
    r.visualAssetVerificationDetected ||
    r.sensitivePersonalDocumentDetected ||
    r.identityEntityPhase2Detected ||
    r.multiWeddingIdentityAmbiguous ||
    r.workflowRoutineDraftSuppressed ||
    r.operatorRoutingProposed ||
    !r.verifierSuccess;
  if (!anyLane && cat !== "none_observed") {
    return `\`${cat}\` (no detector lane in harness)`;
  }
  if (r.resultClass === "safe_draft_path" && cat !== "none_observed" && !r.operatorRoutingProposed) {
    return `\`${cat}\` (still: safe_draft_path)`;
  }
  return `\`${cat}\` (mitigated or partial)`;
}

function detailV3HandledWell(r: Awaited<ReturnType<typeof runBatch2Harness>>[number]): string {
  const parts: string[] = [];
  const anyDetector =
    r.authorityPolicyDetected ||
    r.highMagnitudeClientConcessionDetected ||
    r.strategicTrustRepairDetected ||
    r.nonCommercialDetected ||
    r.irregularSettlementDetected ||
    r.bankingComplianceExceptionDetected ||
    r.visualAssetVerificationDetected ||
    r.sensitivePersonalDocumentDetected ||
    r.identityEntityPhase2Detected ||
    r.multiWeddingIdentityAmbiguous ||
    r.workflowRoutineDraftSuppressed;
  if (!r.verifierSuccess) {
    parts.push("- Verifier prevented the mapped auto path for this scenario.");
  }
  if (r.authorityPolicyDetected) {
    parts.push("- AP1 matched and routed away from a naive planner commercial commit draft.");
  }
  if (r.highMagnitudeClientConcessionDetected) {
    parts.push(
      "- CCM matched for client/payer high-magnitude concession language (routing gate — not a pricing approval).",
    );
  }
  if (r.strategicTrustRepairDetected) {
    parts.push(
      "- STR matched for contradiction / expectation-mismatch / credibility-risk language (routing gate — not autonomous reconciliation).",
    );
  }
  if (r.nonCommercialDetected) {
    parts.push(
      "- Non-commercial (legal / PR / artistic dispute) detector matched — operator routing precedes routine send.",
    );
  }
  if (r.irregularSettlementDetected) {
    parts.push(
      "- Irregular settlement / tax-avoidance-shaped gate matched (routing only — not a legal determination); operator routing precedes routine send.",
    );
  }
  if (r.bankingComplianceExceptionDetected) {
    parts.push("- Banking/compliance detector matched and paired with proposal downgrades / operator routing.");
  }
  if (r.visualAssetVerificationDetected) {
    parts.push("- Visual verification detector matched for layout/proof/Canva-shaped inbound text.");
  }
  if (r.sensitivePersonalDocumentDetected) {
    parts.push(
      "- Sensitive identity-document / government-ID detector matched (routing gate — not a DLP or storage decision); operator routing precedes routine send.",
    );
  }
  if (r.identityEntityPhase2Detected) {
    parts.push("- Identity/entity Phase 2 matched for B2B or text-only multi-booking cues.");
  }
  if (r.multiWeddingIdentityAmbiguous) {
    parts.push("- Phase 1 multi-wedding ambiguity blocked routine send in favor of disambiguation posture.");
  }
  if (r.workflowRoutineDraftSuppressed) {
    parts.push("- Workflow state suppressed routine client `send_message` draftability.");
  }
  if (r.operatorRoutingProposed) {
    parts.push("- At least one `operator_notification_routing` candidate was proposed.");
  }
  if (r.verifierSuccess && !anyDetector) {
    parts.push("- No deterministic detector lane fired; proposals reflect default orchestrator heuristics only.");
  }
  parts.push("- `draft_only` execution mode keeps outbound inside approval inbox unless verifier blocks.");
  return parts.join("\n");
}

function detailProductSlice(d: StressReplayDecisionPoint, r: Awaited<ReturnType<typeof runBatch2Harness>>[number]): string {
  const base = `Stress metadata flags **${d.primaryGapIfUnmet}** if expectations are not met.`;
  if (r.resultClass === "safe_draft_path" && !r.operatorRoutingProposed && d.primaryGapIfUnmet !== "none_observed") {
    return `${base} Observed **safe_draft_path** without operator routing — product still owns policy, verifier, or durable workflow outside this harness.`;
  }
  if (r.resultClass === "operator_surface") {
    return `${base} Operator surface present; closing the loop still needs human tools and CRM/memory wiring.`;
  }
  return `${base} See gap category and expected behavior above.`;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
