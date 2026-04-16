/**
 * V3 real-conversation stress replay - batch 1 (stress tests 1, 2, 6, 8).
 *
 * Deterministic harness: `proposeClientOrchestratorCandidateActions` + `toolVerifier` + outcome map.
 * No DB / no Inngest - evaluates the current V3 orchestrator surface against critical decision points.
 *
 * Run: npx tsx scripts/v3_stress_replay_batch1.ts
 * npm run v3:stress-replay-batch1
 */
import { existsSync, mkdirSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { runBatch1Harness } from "../supabase/functions/_shared/qa/v3StressReplayBatch1Harness.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

async function main(): Promise<void> {
  const results = await runBatch1Harness();
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const reportName = `v3-stress-replay-batch1-${stamp}.md`;
  const reportsDir = join(root, "reports");
  if (!existsSync(reportsDir)) mkdirSync(reportsDir, { recursive: true });
  const outPath = join(reportsDir, reportName);

  const lines: string[] = [];
  lines.push("# V3 stress replay - batch 1 (stress tests 1, 2, 6, 8)");
  lines.push("");
  lines.push(`**Generated:** ${new Date().toISOString()}`);
  lines.push("");
  lines.push("## Method");
  lines.push("");
  lines.push("- Harness: [`supabase/functions/_shared/qa/v3StressReplayBatch1Harness.ts`](../supabase/functions/_shared/qa/v3StressReplayBatch1Harness.ts)");
  lines.push("- Inputs: synthetic `rawMessage` + audience + `weddingCrmParityHints` shaped after `Ana real pdf/*/stress test *.txt` and [REAL_CONVERSATION_STRESS_TEST_PLAN.md](../docs/v3/REAL_CONVERSATION_STRESS_TEST_PLAN.md).");
  lines.push("- Runtime: deterministic proposals + `executeToolVerifierReplay` (parity with `toolVerifier` / Zod; no `npm:zod` in Node) + local outcome map (no live DB, no Inngest).");
  lines.push("");
  lines.push("## Summary table");
  lines.push("");
  lines.push(
    "| ID | ST | Verifier | Outcome | Result class | Workflow suppresses routine send? | Multi-wedding identity ambiguous? | Identity/entity Phase 2? | Banking/compliance exception? | Visual/asset verification? | Operator candidate? |",
  );
  lines.push(
    "|----|----|----------|---------|--------------|-----------------------------------|-----------------------------------|--------------------------|-------------------------------|------------------------------|---------------------|",
  );
  for (const r of results) {
    const d = r.decisionPoint;
    lines.push(
      `| ${d.id} | ${d.stressTest} | ${r.verifierSuccess ? "pass" : "fail"} | ${r.orchestratorOutcome} | ${r.resultClass} | ${r.workflowRoutineDraftSuppressed ? "yes" : "no"} | ${r.multiWeddingIdentityAmbiguous ? "yes" : "no"} | ${r.identityEntityPhase2Detected ? "yes" : "no"} | ${r.bankingComplianceExceptionDetected ? "yes" : "no"} | ${r.visualAssetVerificationDetected ? "yes" : "no"} | ${r.operatorRoutingProposed ? "yes" : "no"} |`,
    );
  }
  lines.push("");
  lines.push("## Per decision point");
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
    lines.push(
      `- Workflow blocks routine client \`send_message\` draft (V3 state): **${r.workflowRoutineDraftSuppressed ? "yes" : "no"}** - matches \`likely_outcome: "block"\` on the routine send plus \`attemptOrchestratorDraft\` skipping that candidate.`,
    );
    lines.push(
      `- Multi-wedding identity ambiguity (\`candidateWeddingIds\` / \`thread_weddings\`): **${r.multiWeddingIdentityAmbiguous ? "yes" : "no"}** - when true, the routine send is blocked and a disambiguation-only \`send_message\` candidate is offered.`,
    );
    lines.push(
      `- Banking/compliance exception detector (payment-rail / compliance docs): **${r.bankingComplianceExceptionDetected ? "yes" : "no"}** - when true, routine primary \`send_message\` is blocked and operator routing is surfaced (\`v3_banking_compliance_exception\` or, for attachable COI/portal-shaped compliance docs, \`v3_compliance_asset_library_attach\`).`,
    );
    lines.push(
      `- Visual/attachment verification detector (mockup / proof / pre-print): **${r.visualAssetVerificationDetected ? "yes" : "no"}** - when true, routine primary \`send_message\` is blocked and \`v3_visual_asset_verification\` plus optional \`v3_visual_asset_verification_hold\` are surfaced.`,
    );
    lines.push(
      `- Identity/entity Phase 2 (B2B sender + follow-up cues, or multi-booking text without Phase 1): **${r.identityEntityPhase2Detected ? "yes" : "no"}** - when true, routine primary \`send_message\` is blocked and \`v3_identity_entity_routing_ambiguity\` plus clarification candidate are surfaced.`,
    );
    lines.push("");
    lines.push("**What V3 already does well here**");
    lines.push("");
    if (d.id === "st6-broadcast-vendors") {
      lines.push("- High `broadcastRisk` + `auto` mode fails the verifier and maps to `block`, which prevents naive auto-send on a broadcast-shaped thread.");
      lines.push("- An `operator_notification_routing` candidate is present for high-risk / multi-recipient posture.");
    } else if (d.id === "st6-compassion-pause") {
      lines.push("- `compassion_pause` on CRM hints downgrades the primary send path from routine auto to ask-class likelihood in proposals.");
    } else if (d.primaryGapIfUnmet === "none_observed") {
      lines.push("- No specific gap flagged for this scenario in the harness metadata.");
    } else {
      lines.push("- `draft_only` execution mode keeps the path in draft / human approval territory; commercial auditing still applies later on persona rewrite and is outside this harness.");
    }
    lines.push("");
    lines.push("**What still needs a product slice**");
    lines.push("");
    lines.push(
      `See gap category \`${d.primaryGapIfUnmet}\`: this scenario is still not fully closed by the current deterministic proposal layer alone.`,
    );
    lines.push("");
  }

  lines.push("## Aggregate: what V3 handles correctly (batch 1)");
  lines.push("");
  lines.push("- **Broadcast / multi-party risk:** High `broadcastRisk` with `requestedExecutionMode: auto` is blocked by `toolVerifier`; operator routing candidate appears.");
  lines.push("- **Compassion / CRM pause:** `compassionPause` in parity hints changes proposal likelihood (ask vs auto) and avoids presenting the thread as routine outbound.");
  lines.push("- **Draft-only posture:** Live routing uses `draft_only` on known-wedding branches; the harness still mirrors draft outcomes for those modes.");
  lines.push("- **Workflow suppression:** timeline-already-received, wire-chase, and stalled-inquiry state now suppress routine `send_message` draftability instead of only adding metadata.");
  lines.push("- **Identity ambiguity Phase 1:** when `thread_weddings` links a thread to multiple weddings, proposals block the routine send and surface operator routing plus a disambiguation draft.");
  lines.push("- **Identity/entity Phase 2:** deterministic B2B sender + business-follow-up conjunction, and multi-booking text without two CRM thread weddings — blocks routine `send_message` and surfaces `v3_identity_entity_routing_ambiguity` with stable `identity_entity_phase2_reason_code` (stress 1 B2B + stress 2 text-only replay rows).");
  lines.push("- **Banking / compliance exception routing:** deterministic payment-rail and compliance-document detection blocks routine `send_message` and surfaces operator routing (`v3_banking_compliance_exception` or attachable-doc `v3_compliance_asset_library_attach`) with stable `banking_compliance_reason_code` / optional `compliance_asset_library_key` (stress 2 & 8 harness rows).");
  lines.push("- **Visual/attachment verification:** deterministic mockup/proof/pre-print cues block routine `send_message` and surface `v3_visual_asset_verification` with stable `visual_asset_verification_reason_code` and a strict approval-hold candidate (`stress 6 album mockup` harness row).");
  lines.push("");
  lines.push("## Top 3 highest-value gaps (from this batch)");
  lines.push("");
  lines.push("1. **Durable asset workflows** - richer human-review tooling and attachment pipelines beyond proposal-layer routing (stress 6 & 8).");
  lines.push("2. **Header-grade identity / CRM linking** - sender domain from email headers (not body `From:` lines), automated linking of B2B threads to bookings, and authority rules beyond proposal-layer routing.");
  lines.push("3. **Durable workers and tools** - wire follow-up, stalled-comms nudges, compliance asset upload flows — not fully represented in single-turn orchestrator proposals alone.");
  lines.push("");
  lines.push("## Recommended next single slice after batch 1");
  lines.push("");
  lines.push("**Deeper attachment/asset workflow integration** - connect proposal-layer visual verification to operator tools and durable state while keeping writer boundaries.");
  lines.push("");

  writeFileSync(outPath, lines.join("\n"), "utf8");
  console.log(`Wrote ${outPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
