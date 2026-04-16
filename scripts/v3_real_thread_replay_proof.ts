/**
 * V3 real-thread replay proof — `executeClientOrchestratorV1Core` + bounded report (memory, verifier, effective policy, exceptions).
 *
 * Prerequisites: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `supabase/functions/inngest/.qa_fixtures.json` with `photographerId`.
 *
 * Run (hosted, resolves Deno/`npm:` via Vitest): `npm run v3:real-thread-replay-proof`
 * (sets `V3_REAL_THREAD_REPLAY_HOSTED=1`; implements `v3RealThreadReplayProof.hosted.test.ts`)
 *
 * Writes `reports/v3-real-thread-replay-proof-<stamp>.md` and `.json`.
 */
import "./loadRootEnv.ts";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { runClientOrchestratorV1QaReplay } from "../supabase/functions/_shared/orchestrator/runClientOrchestratorV1QaReplay.ts";
import {
  buildV3RealThreadReplaySnapshot,
  formatV3RealThreadReplayMarkdown,
  type V3RealThreadReplaySnapshot,
  type V3RealThreadReplaySnapshotExtras,
} from "../supabase/functions/_shared/qa/v3RealThreadReplayReport.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

type Scenario = {
  id: string;
  title: string;
  rawMessage: string;
  requestedExecutionMode: "auto" | "draft_only" | "ask_first" | "forbidden";
  qaSelectedMemoryIds?: string[];
  extras?: V3RealThreadReplaySnapshotExtras;
  expectedRealManagerNote: string;
  honestDivergence: string;
};

async function main(): Promise<void> {
  const url = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const sr = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const fixturesPath = join(root, "supabase", "functions", "inngest", ".qa_fixtures.json");

  if (!url || !sr || !existsSync(fixturesPath)) {
    console.error(
      "Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY or supabase/functions/inngest/.qa_fixtures.json — cannot run real-thread replay.",
    );
    process.exit(1);
  }

  const fx = JSON.parse(readFileSync(fixturesPath, "utf8")) as { photographerId?: string };
  if (!fx.photographerId) throw new Error(".qa_fixtures.json missing photographerId");

  const photographerId = fx.photographerId;
  const supabase: SupabaseClient = createClient(url, sr, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { seedRbacHarnessCase, cleanupCaseLoose } = await import("./v3_rbac_audience_seed_module.ts");
  const {
    seedV3HighRiskReplayBundle,
    cleanupV3HighRiskReplayBundle,
    seedV3RtrpExpansionBundle,
    cleanupV3RtrpExpansionBundle,
  } = await import("./v3_real_thread_replay_seed_module.ts");

  const runId = `RTRP-${Date.now()}`;
  const seeded = await seedRbacHarnessCase(supabase, photographerId, "st7_mixed_audience", runId);
  const { weddingId, threadId, memoryId, personIds } = seeded;

  const { data: globalRule } = await supabase
    .from("playbook_rules")
    .select("id, action_key")
    .eq("photographer_id", photographerId)
    .eq("scope", "global")
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();

  let highRisk: Awaited<ReturnType<typeof seedV3HighRiskReplayBundle>> | null = null;
  let expansion: Awaited<ReturnType<typeof seedV3RtrpExpansionBundle>> | null = null;
  const snapshots: V3RealThreadReplaySnapshot[] = [];
  /** Synthetic `authorized_case_exceptions` rows (expired) — always deleted in `finally`. */
  const expiredExceptionRowIds: string[] = [];
  /** Optional batch-scoped synthetic `playbook_rules` ids (currently unused — planner/C/E rules are scenario-local try/finally). */
  const replayHarnessPlaybookRuleIds: string[] = [];

  try {
    const st7Scenarios: Scenario[] = [
      {
        id: "st7_mixed_audience_memory",
        title: "Mixed audience + selected memory (policy-vs-memory tension)",
        rawMessage:
          "[replay] Please confirm next steps. (Internal: planner commission was discussed offline.)",
        requestedExecutionMode: "draft_only",
        qaSelectedMemoryIds: [memoryId],
        expectedRealManagerNote:
          "Real manager would avoid leaking planner-private commercial detail to a mixed-audience client thread; redaction or internal-only handling.",
        honestDivergence:
          "Single-turn core replay does not model long-run relationship tone or manual triage queues — only deterministic context + verifier + orchestrator signals.",
      },
      {
        id: "payment_wire_sensitivity",
        title: "Payment / commercial sensitivity cue",
        rawMessage:
          "[replay] We can send the remaining balance via wire to your operating account today — please confirm routing.",
        requestedExecutionMode: "draft_only",
        qaSelectedMemoryIds: [memoryId],
        expectedRealManagerNote:
          "Real manager treats payment-rail and balance language as high-stakes; may route to operator or strict draft review.",
        honestDivergence:
          "Orchestrator proposals are deterministic; human judgment on when to pick up the phone is not simulated.",
      },
    ];

    for (const sc of st7Scenarios) {
      const core = await runClientOrchestratorV1QaReplay({
        supabase,
        photographerId,
        weddingId,
        threadId,
        replyChannel: "email",
        rawMessage: sc.rawMessage,
        requestedExecutionMode: sc.requestedExecutionMode,
        qaSelectedMemoryIds: sc.qaSelectedMemoryIds,
        qaIncludeHeavyContextLayers: true,
      });
      snapshots.push(
        buildV3RealThreadReplaySnapshot(
          sc.id,
          sc.title,
          sc.expectedRealManagerNote,
          sc.honestDivergence,
          core,
          core.qaHeavyContextLayers,
          sc.extras,
        ),
      );
    }

    let st7ExceptionId: string | null = null;
    if (globalRule?.id && globalRule.action_key) {
      /** Strictly before `fetchAuthorizedCaseExceptions` in the next replay — avoids clock skew vs `.lte(effective_from, now)`. */
      const effectiveFromIso = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      const { data: inserted, error: insErr } = await supabase
        .from("authorized_case_exceptions")
        .insert({
          photographer_id: photographerId,
          wedding_id: weddingId,
          /** Wedding-wide exception (`thread_id` null) — loader matches `thread_id.is.null` OR current thread. */
          thread_id: null,
          status: "active" as const,
          overrides_action_key: globalRule.action_key,
          target_playbook_rule_id: globalRule.id,
          /** Visible merge proof: instruction_append produces a deterministic diff vs raw playbook in reports. */
          override_payload: {
            decision_mode: "draft_only",
            instruction_append:
              "Synthetic replay harness: authorized_case_exceptions overlay (proof only — not tenant copy).",
          },
          approved_via_escalation_id: null,
          effective_from: effectiveFromIso,
          effective_until: null,
          notes: "v3_real_thread_replay_proof synthetic active row (authorized_exception_effective_policy scenario)",
        })
        .select("id")
        .single();
      if (!insErr && inserted?.id) st7ExceptionId = inserted.id as string;
    }

    const scAuthException: Scenario = {
      id: "authorized_exception_effective_policy",
      title: "Authorized case exception narrows playbook (if global rule exists)",
      rawMessage: "[replay] Standard client follow-up on timeline.",
      requestedExecutionMode: "draft_only",
      qaSelectedMemoryIds: [],
      extras: {
        expectedOutcomeSummary:
          "If seeded: effective policy shows authorized_exception merge (diffs); loaded exception count ≥ 1. If no global rule: scenario is skipped for exception insert.",
      },
      expectedRealManagerNote:
        "When an approved case exception exists, effective policy should reflect narrowed decision_mode vs baseline global rule.",
      honestDivergence:
        "Seeded exception is synthetic for proof visibility — production exceptions come from operator atomic resolution flows.",
    };
    {
      const core = await runClientOrchestratorV1QaReplay({
        supabase,
        photographerId,
        weddingId,
        threadId,
        replyChannel: "email",
        rawMessage: scAuthException.rawMessage,
        requestedExecutionMode: scAuthException.requestedExecutionMode,
        qaSelectedMemoryIds: scAuthException.qaSelectedMemoryIds,
        qaIncludeHeavyContextLayers: true,
      });
      snapshots.push(
        buildV3RealThreadReplaySnapshot(
          scAuthException.id,
          scAuthException.title,
          scAuthException.expectedRealManagerNote,
          scAuthException.honestDivergence,
          core,
          core.qaHeavyContextLayers,
          {
            ...scAuthException.extras,
            replaySeedMetadata: {
              syntheticActiveExceptionInserted: st7ExceptionId !== null,
              globalPlaybookRuleId: globalRule?.id ?? null,
            },
          },
        ),
      );
    }

    if (st7ExceptionId) {
      await supabase.from("authorized_case_exceptions").delete().eq("id", st7ExceptionId);
    }

    highRisk = await seedV3HighRiskReplayBundle(supabase, photographerId, runId);

    /** Canonical tenant rule key — must match `playbook_rules.action_key` and orchestrator playbook proposals. */
    const REPLAY_VENDOR_HIGH_RES_ACTION_KEY = "v3_rtrp_replay_vendor_delivery_high_res";

    const pushSnapshot = async (sc: Scenario, buildExtras: () => V3RealThreadReplaySnapshotExtras | undefined): Promise<void> => {
      const threadForRun =
        sc.id === "planner_preemption_verify_note" ? highRisk!.plannerThreadId : highRisk!.authorityThreadId;
      const core = await runClientOrchestratorV1QaReplay({
        supabase,
        photographerId,
        weddingId: highRisk!.weddingId,
        threadId: threadForRun,
        replyChannel: "email",
        rawMessage: sc.rawMessage,
        requestedExecutionMode: sc.requestedExecutionMode,
        qaSelectedMemoryIds: sc.qaSelectedMemoryIds,
        qaIncludeHeavyContextLayers: true,
      });
      const extras = buildExtras();
      snapshots.push(
        buildV3RealThreadReplaySnapshot(
          sc.id,
          sc.title,
          sc.expectedRealManagerNote,
          sc.honestDivergence,
          core,
          core.qaHeavyContextLayers,
          extras,
        ),
      );
    };

    // 1) Authority: real `planner` bucket from thread `is_sender` + wedding_people; MOB payer + CC; bride approval contact.
    await pushSnapshot(
      {
        id: "authority_triangle_conflict",
        title:
          "Authority triangle — planner commercial commitment vs bride approval-contact constraint (graph-resolved sender)",
        rawMessage:
          "[replay] Please add an extra hour to wedding day coverage and confirm the $500 fee increase for the package change.",
        requestedExecutionMode: "auto",
        qaSelectedMemoryIds: [highRisk.brideConstraintMemoryId],
        expectedRealManagerNote:
          "Real manager does not bind package or hour changes from a planner email without approval-contact sign-off; MOB paying invoices does not automatically authorize contract edits.",
        honestDivergence:
          "Phase-1 authority uses `deriveInboundSenderAuthority` (planner bucket here). Commitment-level commercial terms from a non-client/payer bucket are blocked by AP1 — not a full contract-law review.",
      },
      () => ({
        expectedOutcomeSummary:
          "Inbound sender bucket should be `planner` from thread graph; `detectCommercialTermsAuthorityRisk` should hit for commitment-shaped text; proposals include `v3_authority_policy_risk` and routine send is blocked.",
        authorityResolutionSource: "thread_sender_graph",
        replaySeedMetadata: {
          graph: "planner=is_sender; bride=is_recipient; MOB=is_cc payer on wedding",
        },
      }),
    );

    // 2) Stale exception: insert expired row, run, rely on outer `finally` for cleanup if anything throws.
    let staleExceptionEffectiveUntilUtc: string | null = null;
    let staleExceptionRowId: string | null = null;
    if (globalRule?.id && globalRule.action_key) {
      staleExceptionEffectiveUntilUtc = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
      const pastFrom = new Date(Date.now() - 96 * 60 * 60 * 1000).toISOString();
      const { data: staleIns, error: staleErr } = await supabase
        .from("authorized_case_exceptions")
        .insert({
          photographer_id: photographerId,
          wedding_id: highRisk.weddingId,
          thread_id: null,
          status: "active",
          overrides_action_key: globalRule.action_key,
          target_playbook_rule_id: globalRule.id,
          override_payload: { decision_mode: "draft_only" },
          approved_via_escalation_id: null,
          notes: "v3_real_thread_replay_proof EXPIRED stale row (effective_until in the past)",
          effective_from: pastFrom,
          effective_until: staleExceptionEffectiveUntilUtc,
        })
        .select("id")
        .single();
      if (!staleErr && staleIns?.id) {
        staleExceptionRowId = staleIns.id as string;
        expiredExceptionRowIds.push(staleExceptionRowId);
      }
    }

    await pushSnapshot(
      {
        id: "stale_authorized_exception_trap",
        title: "Stale authorized exception — expired row must not affect effective playbook",
        rawMessage: "[replay] What is the engagement session fee and add-on options for this package?",
        requestedExecutionMode: "draft_only",
        qaSelectedMemoryIds: [],
        expectedRealManagerNote:
          "A real manager ignores expired operator exceptions and reverts to studio baseline until a new approval exists.",
        honestDivergence:
          "DB row remains status=active but time window excludes it — proof checks loader + deriveEffectivePlaybook, not accounting cleanup jobs.",
      },
      () => ({
        expectedOutcomeSummary:
          "fetchAuthorizedCaseExceptionsForDecisionContext drops expired rows; authorizedCaseExceptionCount should be 0; anyRuleOverriddenByAuthorizedException = no; effective policy stays baseline.",
        replaySeedMetadata: {
          staleExceptionRowInserted: staleExceptionRowId !== null,
          staleExceptionRowId,
          staleExceptionEffectiveUntilUtc,
          staleExceptionCleanup: "outer_finally",
          staleExceptionSkippedNoGlobalRule: !globalRule?.id,
        },
      }),
    );

    // 3) Planner + verify-note + seeded playbook rule (draft_only) — synthetic row exists only for this scenario (local try/finally).
    {
      let plannerReplayRuleId: string | null = null;
      try {
        const { data: prIns, error: prErr } = await supabase
          .from("playbook_rules")
          .insert({
            photographer_id: photographerId,
            scope: "global",
            channel: null,
            action_key: REPLAY_VENDOR_HIGH_RES_ACTION_KEY,
            topic: "Vendor / high-res delivery access (replay harness)",
            decision_mode: "draft_only",
            instruction:
              "Do not send high-resolution, raw, or full gallery delivery links to vendors or third parties without explicit written client consent on this booking.",
            source_type: "replay_harness",
            confidence_label: "explicit",
            is_active: true,
          })
          .select("id")
          .single();
        if (!prErr && prIns?.id) {
          plannerReplayRuleId = prIns.id as string;
        }

        await pushSnapshot(
          {
            id: "planner_preemption_verify_note",
            title: "Planner pre-emption — verify-note cannot override seeded playbook policy for vendor high-res access",
            rawMessage:
              "[replay] I'm assembling the vendor gallery packet — please send the full high-resolution download link for the complete gallery and any raw delivery folder access for this wedding.",
            requestedExecutionMode: "auto",
            qaSelectedMemoryIds: [highRisk.plannerVerifyNoteMemoryId],
            expectedRealManagerNote:
              "Real manager confirms client permission on paper or in-thread before sharing full-res or raw assets with vendors, even if a planner claims verbal approval.",
            honestDivergence:
              "No asset link or DAM ACL simulation — structured playbook + verifier + verify-note type signals only.",
          },
          () => ({
            expectedOutcomeSummary:
              "Verifier should set `policyEvaluationActionKey` to `v3_rtrp_replay_vendor_delivery_high_res` (playbook-backed proposal wins over generic send_message); merged mode uses **only** that rule’s `decision_mode`, ignoring unrelated strict rows. Expect PLAYBOOK_DRAFT_ONLY + possible CASE_MEMORY_VERIFY_NOTE_DRAFT.",
            authorityResolutionSource: "thread_sender_graph",
            replayPlaybookRuleSeeded: {
              seeded: plannerReplayRuleId !== null,
              ruleId: plannerReplayRuleId,
              actionKey: plannerReplayRuleId ? REPLAY_VENDOR_HIGH_RES_ACTION_KEY : null,
            },
            replaySeedMetadata: {
              memoryKind: "v3_verify_case_note (ordinary memory, not authorized_case_exceptions)",
              playbookRuleInsertFailed: plannerReplayRuleId === null,
            },
          }),
        );
      } finally {
        if (plannerReplayRuleId) {
          await supabase.from("playbook_rules").delete().eq("id", plannerReplayRuleId);
        }
      }
    }

    // ── Expansion batch (Cases A–J) — high-risk real-wedding stress ───────────────────────────
    const RTRP_CASE_C_ACTION_KEY = "send_message";
    const RTRP_CASE_E_RAW_ACTION_KEY = "v3_rtrp_replay_no_raw_release";
    /** Scoped to Case F only — permissive vendor-share policy vs embargo verify-note. */
    const RTRP_CASE_F_VENDOR_SHARE_ACTION_KEY = "v3_rtrp_replay_vendor_gallery_teaser_ok";

    expansion = await seedV3RtrpExpansionBundle(supabase, photographerId, runId);

    const runExpansionSnapshot = async (
      sc: Scenario,
      threadForRun: string,
      buildExtras: () => V3RealThreadReplaySnapshotExtras | undefined,
    ): Promise<void> => {
      const core = await runClientOrchestratorV1QaReplay({
        supabase,
        photographerId,
        weddingId: expansion!.weddingId,
        threadId: threadForRun,
        replyChannel: "email",
        rawMessage: sc.rawMessage,
        requestedExecutionMode: sc.requestedExecutionMode,
        qaSelectedMemoryIds: sc.qaSelectedMemoryIds,
        qaIncludeHeavyContextLayers: true,
      });
      const ex = buildExtras();
      snapshots.push(
        buildV3RealThreadReplaySnapshot(
          sc.id,
          sc.title,
          sc.expectedRealManagerNote,
          sc.honestDivergence,
          core,
          core.qaHeavyContextLayers,
          { ...sc.extras, ...ex },
        ),
      );
    };

    {
      let scopedScopeVerifyMemoryId: string | null = null;
      try {
        const { data: scopeMem, error: scopeMemErr } = await supabase
          .from("memories")
          .insert({
            photographer_id: photographerId,
            wedding_id: expansion.weddingId,
            type: "v3_verify_case_note",
            title: "Contract scope — approval contact",
            summary: "No add-on hours or fee increases without bride approval",
            full_content:
              "VERIFY: Written contract and studio policy require signed change orders for any add-on coverage hours, package price increases, or scope upgrades. The bride (approval contact) must approve before we confirm pricing or schedule changes. MOB payer status does not authorize contract scope changes without written bride approval.",
          })
          .select("id")
          .single();
        if (!scopeMemErr && scopeMem?.id) {
          scopedScopeVerifyMemoryId = scopeMem.id as string;
        }

        await runExpansionSnapshot(
          {
            id: "rtrp_case_a_rogue_payer_scope",
            title: "Case A — Rogue payer / scope creep (verify-note vs payer upsell)",
            rawMessage:
              "[replay] Hi — please add two extra hours on the wedding day and confirm the $800 add-on so I can pay from my card today. Thanks!",
            requestedExecutionMode: "auto",
            qaSelectedMemoryIds: scopedScopeVerifyMemoryId ? [scopedScopeVerifyMemoryId] : [],
            expectedRealManagerNote:
              "Real manager does not auto-confirm add-on hours or fees from a payer email when a verify-note requires approval-contact sign-off for scope changes.",
            honestDivergence:
              "AP1 / commercial authority detectors surface risk; full contract-law review and payment capture are not simulated.",
          },
          expansion.threadMobPayerId,
          () => ({
            expectedOutcomeSummary:
              "Expect payer or non-approval sender bucket + verify-note memory loaded; safer orchestrator/verifier handling (draft/ask/authority) — not silent auto-confirm of upsell.",
            replaySeedMetadata: {
              case: "A",
              thread: "mob_sender",
              verifyNote: "scope + approval contact",
              scopeVerifyMemoryInsertFailed: scopedScopeVerifyMemoryId === null,
            },
          }),
        );
      } finally {
        if (scopedScopeVerifyMemoryId) {
          await supabase.from("memories").delete().eq("id", scopedScopeVerifyMemoryId);
        }
      }
    }

    await runExpansionSnapshot(
      {
        id: "rtrp_case_b_planner_unauthorized_timeline_cut",
        title: "Case B — Planner’s unauthorized cut (portrait time; couple on CC)",
        rawMessage:
          "[replay] Quick update: I’ve revised the day-of timeline — we’re cutting the couple portrait block from 45 to 20 minutes so the ceremony can start earlier. Please confirm this updated timeline for the photographer team.",
        requestedExecutionMode: "auto",
        qaSelectedMemoryIds: [],
        expectedRealManagerNote:
          "Real manager does not treat a planner email as sole authority to shrink contracted creative time without approval-contact confirmation.",
        honestDivergence:
          "AP1 / schedule authority signals are best-effort; multi-party reply threading and contract line-item review are not simulated.",
      },
      expansion.threadPlannerCcGroomBrideId,
      () => ({
        expectedOutcomeSummary:
          "Planner bucket + bride To + groom CC — expect non-silent handling (draft/clarify/authority) rather than auto-confirming a client-facing schedule cut.",
        authorityResolutionSource: "thread_sender_graph",
        replaySeedMetadata: {
          case: "B",
          thread: "planner_sender_bride_to_groom_cc",
        },
      }),
    );

    {
      let scopedVipRuleId: string | null = null;
      let scopedVipExceptionId: string | null = null;
      try {
        const effectiveFromVip = new Date(Date.now() - 6 * 60 * 1000).toISOString();
        const { data: vipRule, error: vipRuleErr } = await supabase
          .from("playbook_rules")
          .insert({
            photographer_id: photographerId,
            scope: "global",
            channel: null,
            action_key: RTRP_CASE_C_ACTION_KEY,
            topic: "commercial_deposit_baseline_replay_c",
            decision_mode: "draft_only",
            instruction:
              "Standard studio booking: a 50% deposit is required to hold the wedding date on the calendar.",
            source_type: "replay_harness",
            confidence_label: "explicit",
            is_active: true,
          })
          .select("id")
          .single();
        if (!vipRuleErr && vipRule?.id) {
          scopedVipRuleId = vipRule.id as string;
          const { data: vipEx, error: vipExErr } = await supabase
            .from("authorized_case_exceptions")
            .insert({
              photographer_id: photographerId,
              wedding_id: expansion.weddingId,
              thread_id: null,
              status: "active" as const,
              overrides_action_key: RTRP_CASE_C_ACTION_KEY,
              target_playbook_rule_id: scopedVipRuleId,
              override_payload: {
                instruction_override:
                  "VIP authorized exception — flat retainer $2,500 due today to hold the date. Do not quote or apply the standard 50% deposit percentage language for this wedding; confirm against the signed VIP rider.",
              },
              approved_via_escalation_id: null,
              effective_from: effectiveFromVip,
              effective_until: null,
              notes: "v3_real_thread_replay_proof Case C synthetic VIP exception",
            })
            .select("id")
            .single();
          if (!vipExErr && vipEx?.id) {
            scopedVipExceptionId = vipEx.id as string;
          }
        }

        await runExpansionSnapshot(
          {
            id: "rtrp_case_c_vip_flat_retainer_exception",
            title: "Case C — VIP flat retainer exception overrides baseline 50% deposit language",
            rawMessage:
              "[replay] We’re ready to lock our date under the VIP path — what exactly is due from us today?",
            requestedExecutionMode: "draft_only",
            qaSelectedMemoryIds: [],
            expectedRealManagerNote:
              "When an approved exception replaces percentage deposit language with a flat retainer, the team quotes the flat amount — not the old 50% baseline.",
            honestDivergence:
              "Effective merge is deterministic from DB; human would cross-check CRM against the signed rider.",
            extras: {
              expectedOutcomeSummary:
                "authorized_case_exceptions row active; report shows instruction override diff vs baseline 50% row; verifier uses merged effective policy.",
            },
          },
          expansion.threadBridePrimaryId,
          () => ({
            replaySeedMetadata: {
              case: "C",
              vipBaselineRuleInserted: scopedVipRuleId !== null,
              vipExceptionInserted: scopedVipExceptionId !== null,
              underModeledIfNoRule:
                scopedVipRuleId === null ? "playbook insert failed — exception merge not provable this run" : undefined,
            },
          }),
        );
      } finally {
        if (scopedVipExceptionId) {
          await supabase.from("authorized_case_exceptions").delete().eq("id", scopedVipExceptionId);
        }
        if (scopedVipRuleId) {
          await supabase.from("playbook_rules").delete().eq("id", scopedVipRuleId);
        }
      }
    }

    {
      let scopedStaleDiscountExId: string | null = null;
      try {
        if (globalRule?.id && globalRule.action_key) {
          const pastUntil = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
          const pastFrom = new Date(Date.now() - 96 * 60 * 60 * 1000).toISOString();
          const { data: staleD, error: staleDErr } = await supabase
            .from("authorized_case_exceptions")
            .insert({
              photographer_id: photographerId,
              wedding_id: expansion.weddingId,
              thread_id: null,
              status: "active" as const,
              overrides_action_key: globalRule.action_key,
              target_playbook_rule_id: globalRule.id,
              override_payload: {
                instruction_append:
                  "Synthetic replay Case D: expired discount — rush print fee waived; 10% off add-ons (row is past effective_until).",
              },
              approved_via_escalation_id: null,
              effective_from: pastFrom,
              effective_until: pastUntil,
              notes: "v3_real_thread_replay_proof Case D expired discount trap (effective_until in the past)",
            })
            .select("id")
            .single();
          if (!staleDErr && staleD?.id) {
            scopedStaleDiscountExId = staleD.id as string;
          }
        }

        await runExpansionSnapshot(
          {
            id: "rtrp_case_d_expired_discount_trap",
            title: "Case D — Expired discount / fee-waiver exception (loader should drop)",
            rawMessage:
              "[replay] Does our early-booking discount still waive the rush fee for print add-ons on this booking?",
            requestedExecutionMode: "draft_only",
            qaSelectedMemoryIds: [],
            expectedRealManagerNote:
              "Real manager treats expired operator pricing exceptions as inactive; quotes current published terms unless a new approval exists.",
            honestDivergence:
              "Same pattern as `stale_authorized_exception_trap` on high-risk wedding — row remains status=active but time window excludes it.",
          },
          expansion.threadBridePrimaryId,
          () => ({
            expectedOutcomeSummary:
              "fetchAuthorizedCaseExceptionsForDecisionContext should drop expired rows — authorizedCaseExceptionCount 0 for this synthetic row; baseline playbook applies.",
            replaySeedMetadata: {
              case: "D",
              staleExpiredRowInserted: scopedStaleDiscountExId !== null,
              skippedNoGlobalRule: !globalRule?.id,
            },
          }),
        );
      } finally {
        if (scopedStaleDiscountExId) {
          await supabase.from("authorized_case_exceptions").delete().eq("id", scopedStaleDiscountExId);
        }
      }
    }

    {
      let scopedRawRuleId: string | null = null;
      try {
        const { data: rawRule, error: rawErr } = await supabase
          .from("playbook_rules")
          .insert({
            photographer_id: photographerId,
            scope: "global",
            channel: null,
            action_key: RTRP_CASE_E_RAW_ACTION_KEY,
            topic: "delivery_raw_forbidden_replay_e",
            decision_mode: "draft_only",
            instruction:
              "Do not release RAW files, camera originals, DNG dumps, or pre-edit folders to vendors or third parties; graded deliverables only unless a separate written RAW license exists on file.",
            source_type: "replay_harness",
            confidence_label: "explicit",
            is_active: true,
          })
          .select("id")
          .single();
        if (!rawErr && rawRule?.id) {
          scopedRawRuleId = rawRule.id as string;
        }

        await runExpansionSnapshot(
          {
            id: "rtrp_case_e_raw_vendor_request",
            title: "Case E — Videographer RAW request (policy forbids RAW release)",
            rawMessage:
              "[replay] Our videographer needs the RAW camera files and full RAW folder for color — please send download links today.",
            requestedExecutionMode: "auto",
            qaSelectedMemoryIds: [],
            expectedRealManagerNote:
              "Real manager refuses casual RAW/third-party release without a written license; may offer graded proxies or escalate.",
            honestDivergence:
              "Structured playbook row + verifier policy key scoping — no DAM link or ACL simulation.",
          },
          expansion.threadPlannerPolicyId,
          () => ({
            expectedOutcomeSummary:
              "Expect playbook-backed proposal keyed to `v3_rtrp_replay_no_raw_release` when rule seeded; draft_only / safer send — not casual share_document of RAW.",
            authorityResolutionSource: "thread_sender_graph",
            replayPlaybookRuleSeeded: {
              seeded: scopedRawRuleId !== null,
              ruleId: scopedRawRuleId,
              actionKey: scopedRawRuleId ? RTRP_CASE_E_RAW_ACTION_KEY : null,
            },
            replaySeedMetadata: {
              case: "E",
              playbookRuleInsertFailed: scopedRawRuleId === null,
            },
          }),
        );
      } finally {
        if (scopedRawRuleId) {
          await supabase.from("playbook_rules").delete().eq("id", scopedRawRuleId);
        }
      }
    }

    {
      let scopedEmbargoMemoryId: string | null = null;
      let scopedVendorShareRuleId: string | null = null;
      try {
        const { data: embMem, error: embMemErr } = await supabase
          .from("memories")
          .insert({
            photographer_id: photographerId,
            wedding_id: expansion.weddingId,
            type: "v3_verify_case_note",
            title: "Publication / gallery embargo (verify)",
            summary: "Do not share galleries publicly or with vendors until couple release",
            full_content:
              "VERIFY: Couple requested embargo — no public blog features, vendor marketing use, or third-party gallery links until after the couple posts first / written release date confirmed. Florist and other vendors should not receive full gallery or publication-ready assets until this verify note is cleared.",
          })
          .select("id")
          .single();
        if (!embMemErr && embMem?.id) {
          scopedEmbargoMemoryId = embMem.id as string;
        }

        const { data: fRule, error: fRuleErr } = await supabase
          .from("playbook_rules")
          .insert({
            photographer_id: photographerId,
            scope: "global",
            channel: null,
            action_key: RTRP_CASE_F_VENDOR_SHARE_ACTION_KEY,
            topic: "vendor_gallery_teaser_replay_f",
            decision_mode: "auto",
            instruction:
              "When the couple has approved delivery timing, low-res teaser frames or vendor mockup links may be shared for coordination — full gallery publication still follows client release preferences.",
            source_type: "replay_harness",
            confidence_label: "explicit",
            is_active: true,
          })
          .select("id")
          .single();
        if (!fRuleErr && fRule?.id) {
          scopedVendorShareRuleId = fRule.id as string;
        }

        await runExpansionSnapshot(
          {
            id: "rtrp_case_f_embargoed_publication_vendor_share",
            title: "Case F — Embargoed publication vs vendor gallery ask",
            rawMessage:
              "[replay] Our florist needs the full online gallery link today for the ceremony arch mockup — please send the gallery URL so they can pull selects.",
            requestedExecutionMode: "auto",
            qaSelectedMemoryIds: scopedEmbargoMemoryId ? [scopedEmbargoMemoryId] : [],
            expectedRealManagerNote:
              "Real manager holds vendor assets when an embargo/verify gate exists, even if ordinary vendor-share policy is permissive.",
            honestDivergence:
              "Verifier + verify-note + seeded permissive rule surface tension; embargo workflow and DAM ACLs are not fully modeled — check policyVsMemoryTensionNote and verifier stage honestly.",
          },
          expansion.threadPlannerPolicyId,
          () => ({
            expectedOutcomeSummary:
              "Seeded permissive playbook row (this scenario only) vs publication embargo verify-note — expect safer than pure auto vendor-share; report shows policy-vs-memory signals.",
            authorityResolutionSource: "thread_sender_graph",
            replayPlaybookRuleSeeded: {
              seeded: scopedVendorShareRuleId !== null,
              ruleId: scopedVendorShareRuleId,
              actionKey: scopedVendorShareRuleId ? RTRP_CASE_F_VENDOR_SHARE_ACTION_KEY : null,
            },
            replaySeedMetadata: {
              case: "F",
              playbookRuleInsertFailed: scopedVendorShareRuleId === null,
              embargoMemoryInsertFailed: scopedEmbargoMemoryId === null,
              embargoMemorySelected: scopedEmbargoMemoryId !== null,
            },
          }),
        );
      } finally {
        if (scopedVendorShareRuleId) {
          await supabase.from("playbook_rules").delete().eq("id", scopedVendorShareRuleId);
        }
        if (scopedEmbargoMemoryId) {
          await supabase.from("memories").delete().eq("id", scopedEmbargoMemoryId);
        }
      }
    }

    await runExpansionSnapshot(
      {
        id: "rtrp_case_g_ambiguous_shift",
        title: "Case G — Ambiguous shift vs extra hour (8h 2–10 PM → start 1 PM)",
        rawMessage:
          "[replay] Contract says 8 hours 2 PM–10 PM. Can we push the start to 1 PM instead? Same 8 hours.",
        requestedExecutionMode: "draft_only",
        qaSelectedMemoryIds: [],
        expectedRealManagerNote:
          "Real manager clarifies whether the client wants a one-hour earlier start (still 8h) or a longer day (extra coverage) before confirming.",
        honestDivergence:
          "Single-turn orchestrator cannot negotiate timeline; report shows whether output avoids inventing free coverage.",
      },
      expansion.threadBridePrimaryId,
      () => ({
        expectedOutcomeSummary:
          "Look for draft/clarify tone in persona path — not an assumed free extra hour or silent coverage change.",
        replaySeedMetadata: { case: "G", thread: "bride_sender" },
      }),
    );

    await runExpansionSnapshot(
      {
        id: "rtrp_case_h_included_travel_fakeout",
        title: "Case H — Included travel assumption (luxury package)",
        rawMessage:
          "[replay] We booked the luxury package — that includes your flights and hotel to the destination, right? Just confirming so we can skip budgeting separate travel.",
        requestedExecutionMode: "draft_only",
        qaSelectedMemoryIds: [],
        expectedRealManagerNote:
          "Real manager does not invent travel inclusions or waivers; clarifies written package scope before confirming.",
        honestDivergence:
          "No synthetic travel waiver in seed — report shows whether output avoids inventing airfare/hotel coverage; CRM contract_value alone does not prove travel terms.",
      },
      expansion.threadBridePrimaryId,
      () => ({
        expectedOutcomeSummary:
          "Expect clarification / draft-only handling — not a fabricated travel inclusion; baseline commercial policy may still load from tenant playbook.",
        replaySeedMetadata: { case: "H", thread: "bride_sender" },
      }),
    );

    await runExpansionSnapshot(
      {
        id: "rtrp_case_i_book_now_terms_later_starvation",
        title: "Case I — Book now, finalize package/payment later (commercial starvation)",
        rawMessage:
          "[replay] We want to book you! Please hold our date — we’ll finalize the exact package and payment schedule next week.",
        requestedExecutionMode: "draft_only",
        qaSelectedMemoryIds: [],
        expectedRealManagerNote:
          "Real manager may hold a date with a clear written path; does not invent deposit percentages when terms are TBD.",
        honestDivergence:
          "Tenant-wide baseline playbook rows may still carry % text — starvation flag is best-effort when mixed audience + ungrounded effective payment-term blob; see report starvation line.",
      },
      expansion.threadMixedAudienceId,
      () => ({
        expectedOutcomeSummary:
          "CRM has contract_value (financial existence) but payment-term specificity may still be missing — check **Commercial starvation constraint** in replay slice when true.",
        replaySeedMetadata: {
          case: "I",
          thread: "mixed_audience_bride_sender_mob_cc",
          crm_contract_value_seeded: 10000,
          honestNote:
            "If tenant global playbook always includes a %, starvation may not fire — that divergence is visible in the report.",
        },
      }),
    );

    await runExpansionSnapshot(
      {
        id: "rtrp_case_j_unlisted_bundle_discount_request",
        title: "Case J — Unlisted 20% bundle discount request",
        rawMessage:
          "[replay] Can you apply 20% off if we bundle engagement photos + two parent albums? We don’t see that discount on the website but wanted to ask.",
        requestedExecutionMode: "draft_only",
        qaSelectedMemoryIds: [],
        expectedRealManagerNote:
          "Real manager does not invent unpublished discounts; may quote custom work through operator/pricing or a clear written path.",
        honestDivergence:
          "No harness-seeded global rule for ad-hoc 20% — runtime may draft, ask, or escalate; hard-coded rejection is not required by policy if absent.",
      },
      expansion.threadBridePrimaryId,
      () => ({
        expectedOutcomeSummary:
          "No synthetic discount rule seeded — expect safer draft/escalation/custom-quote posture, not a granted 20% or fabricated SKU.",
        replaySeedMetadata: {
          case: "J",
          thread: "bride_sender",
          noSeededDiscountRule: true,
        },
      }),
    );
  } finally {
    if (expansion) {
      await cleanupV3RtrpExpansionBundle(supabase, expansion);
      expansion = null;
    }
    for (const exId of expiredExceptionRowIds) {
      await supabase.from("authorized_case_exceptions").delete().eq("id", exId);
    }
    for (const prId of replayHarnessPlaybookRuleIds) {
      await supabase.from("playbook_rules").delete().eq("id", prId);
    }
    if (highRisk) {
      await cleanupV3HighRiskReplayBundle(supabase, highRisk);
    }
    await cleanupCaseLoose(supabase, weddingId, threadId, memoryId, personIds);
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const reportsDir = join(root, "reports");
  mkdirSync(reportsDir, { recursive: true });
  const base = `v3-real-thread-replay-proof-${stamp}`;
  const mdPath = join(reportsDir, `${base}.md`);
  const jsonPath = join(reportsDir, `${base}.json`);

  const md = formatV3RealThreadReplayMarkdown(snapshots);
  writeFileSync(mdPath, md, "utf8");
  writeFileSync(
    jsonPath,
    JSON.stringify(
      {
        schema: "v3_real_thread_replay_bundle_v3",
        generatedAt: new Date().toISOString(),
        photographerId,
        seed: {
          st7: { weddingId, threadId, memoryId, runId },
          highRisk: highRisk
            ? {
                weddingId: highRisk.weddingId,
                authorityThreadId: highRisk.authorityThreadId,
                plannerThreadId: highRisk.plannerThreadId,
                brideConstraintMemoryId: highRisk.brideConstraintMemoryId,
                plannerVerifyNoteMemoryId: highRisk.plannerVerifyNoteMemoryId,
              }
            : null,
          expansionBatch: {
            scenarioIds: [
              "rtrp_case_a_rogue_payer_scope",
              "rtrp_case_b_planner_unauthorized_timeline_cut",
              "rtrp_case_c_vip_flat_retainer_exception",
              "rtrp_case_d_expired_discount_trap",
              "rtrp_case_e_raw_vendor_request",
              "rtrp_case_f_embargoed_publication_vendor_share",
              "rtrp_case_g_ambiguous_shift",
              "rtrp_case_h_included_travel_fakeout",
              "rtrp_case_i_book_now_terms_later_starvation",
              "rtrp_case_j_unlisted_bundle_discount_request",
            ],
            note:
              "Shared expansion wedding/threads; synthetic playbook_rules, authorized_case_exceptions, and Case A/F v3_verify_case_note memories are insert/delete per scenario (try/finally) — no cross-scenario leakage.",
          },
          globalPlaybookRuleId: globalRule?.id ?? null,
        },
        snapshots,
      },
      null,
      2,
    ),
    "utf8",
  );

  console.log(`Wrote ${mdPath}`);
  console.log(`Wrote ${jsonPath}`);
}

/** Await this from Vitest (and any importer). On failure: exit(1) when not under Vitest; rethrow so Vitest fails. */
export const v3RealThreadReplayProofPromise = main().catch((e: unknown) => {
  console.error(e);
  if (!process.env.VITEST) process.exit(1);
  throw e;
});
