/**
 * Live / local Postgres verification for `finalize_onboarding_briefing_v1` (no mocks).
 * Requires a real Supabase project or `supabase start` with migrations applied.
 *
 * @see docs/v3/ONBOARDING_RUNTIME_FINALIZATION_SLICE4_VERIFICATION.md
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../types/database.types.ts";
import { finalizeOnboardingBriefingRuntime } from "./completeOnboardingRuntime.ts";
import { createEmptyOnboardingPayloadV4 } from "./onboardingBriefingEmptyPayload.ts";
import {
  mergeOnboardingBriefingSnapshotIntoSettings,
  parseOnboardingBriefingSnapshotV1,
} from "./onboardingBriefingSettings.ts";
import {
  FINALIZE_ONBOARDING_KB_DELETE_ONBOARDING_SOURCE,
  FINALIZE_ONBOARDING_PLAYBOOK_DELETE_SOURCE_TYPES,
} from "./onboardingFinalizeRpcContract.ts";
import {
  KNOWLEDGE_BASE_METADATA_ONBOARDING_SOURCE_KEY,
  KNOWLEDGE_BASE_METADATA_ONBOARDING_SOURCE_VALUE,
} from "./onboardingRuntimeOwnership.ts";
import type { OnboardingPayloadV4 } from "./onboardingV4Payload.ts";
import { ONBOARDING_BRIEFING_STEPS } from "../types/onboardingBriefing.types.ts";

const MANUAL_PLAYBOOK_SOURCE = "manual_verify_survive";
const MANUAL_KB_MARKER = "manual_verify_fixture";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`[onboardingFinalizeLiveVerify] ${msg}`);
}

function getEnv(): { url: string; anonKey: string; serviceKey: string } {
  const url = (process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "").trim();
  const anonKey = (process.env.VITE_SUPABASE_ANON_KEY ?? "").trim();
  const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
  assert(url && anonKey && serviceKey, "Missing VITE_SUPABASE_URL (or SUPABASE_URL), VITE_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY");
  return { url, anonKey, serviceKey };
}

async function ensureAuthUserId(
  admin: SupabaseClient<Database>,
  url: string,
  anonKey: string,
  email: string,
  password: string,
): Promise<string> {
  const anon = createClient<Database>(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (!createErr && created.user?.id) return created.user.id;
  if (
    createErr &&
    !/already registered|already been registered|duplicate/i.test(createErr.message) &&
    (createErr as { status?: number }).status !== 422
  ) {
    throw createErr;
  }
  const { data, error } = await anon.auth.signInWithPassword({ email, password });
  assert(!error && data.user?.id, `signIn after createUser duplicate: ${error?.message ?? "no user"}`);
  return data.user.id;
}

async function signInUser(
  url: string,
  anonKey: string,
  email: string,
  password: string,
): Promise<SupabaseClient<Database>> {
  const client = createClient<Database>(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  assert(!error && data.session, `signIn failed: ${error?.message ?? "no session"}`);
  return client;
}

function buildDraftPayload(studioName: string): OnboardingPayloadV4 {
  return {
    ...createEmptyOnboardingPayloadV4(),
    settings_identity: { studio_name: studioName },
    studio_scope: {},
    playbook_seeds: [],
    knowledge_seeds: [
      {
        document_type: "studio_facts",
        content: "onboarding kb seed line one",
      },
    ],
  };
}

/**
 * End-to-end verification against a real Supabase backend.
 * Creates/uses two auth users (tenant isolation check). Idempotent user emails via env.
 */
export async function runOnboardingFinalizeLiveVerify(): Promise<void> {
  const { url, anonKey, serviceKey } = getEnv();

  const emailA =
    process.env.ONBOARDING_FINALIZE_VERIFY_EMAIL_A?.trim() ??
    "onboarding-finalize-verify-a@example.test";
  const emailB =
    process.env.ONBOARDING_FINALIZE_VERIFY_EMAIL_B?.trim() ??
    "onboarding-finalize-verify-b@example.test";
  const password =
    process.env.ONBOARDING_FINALIZE_VERIFY_PASSWORD?.trim() ?? "OnboardingFinalizeVerify2026!";

  const admin = createClient<Database>(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const userAId = await ensureAuthUserId(admin, url, anonKey, emailA, password);
  const userBId = await ensureAuthUserId(admin, url, anonKey, emailB, password);

  const userA = await signInUser(url, anonKey, emailA, password);

  const studioA = "LiveVerify Studio A";
  const payloadA = buildDraftPayload(studioA);
  const nowDraft = new Date().toISOString();
  const snapshotDraft = {
    schema_version: 1 as const,
    status: "draft" as const,
    completed_steps: [...ONBOARDING_BRIEFING_STEPS],
    last_saved_at: nowDraft,
    current_step: "review" as const,
    payload: payloadA,
  };
  const mergedDraft = mergeOnboardingBriefingSnapshotIntoSettings(
    { other_tenant_key: "keep_for_merge_proof" },
    snapshotDraft,
    { updatedAtIso: nowDraft },
  );

  const { error: upErr } = await userA.from("photographers").update({ settings: mergedDraft }).eq("id", userAId);
  assert(!upErr, `seed settings failed: ${upErr?.message}`);

  const { error: insPbErr } = await userA.from("playbook_rules").insert({
    photographer_id: userAId,
    scope: "global",
    channel: null,
    action_key: "manual_verify_action",
    topic: "manual",
    decision_mode: "ask_first",
    instruction: "MANUAL_PLAYBOOK_SURVIVES",
    source_type: MANUAL_PLAYBOOK_SOURCE,
    confidence_label: "explicit",
    is_active: true,
  });
  assert(!insPbErr, `insert manual playbook failed: ${insPbErr?.message}`);

  const { error: insKbErr } = await userA.from("knowledge_base").insert({
    photographer_id: userAId,
    document_type: "manual_doc",
    content: "MANUAL_KB_SURVIVES",
    metadata: { [MANUAL_KB_MARKER]: true },
  });
  assert(!insKbErr, `insert manual knowledge_base failed: ${insKbErr?.message}`);

  const t1 = new Date().toISOString();
  const completedPayloadA: OnboardingPayloadV4 = {
    ...payloadA,
    settings_meta: { onboarding_completed_at: t1 },
  };

  await finalizeOnboardingBriefingRuntime({
    supabase: userA,
    photographerId: userAId,
    completedPayload: completedPayloadA,
    completedSteps: [...ONBOARDING_BRIEFING_STEPS],
    nowIso: t1,
  });

  const sr = createClient<Database>(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: row1, error: r1Err } = await sr
    .from("photographers")
    .select("settings")
    .eq("id", userAId)
    .maybeSingle();
  assert(!r1Err && row1?.settings, `read photographers failed: ${r1Err?.message}`);
  const raw1 = row1.settings as Record<string, unknown>;
  assert(raw1.other_tenant_key === "keep_for_merge_proof", "settings merge should preserve unrelated keys");
  assert(typeof raw1.onboarding_completed_at === "string", "top-level onboarding_completed_at expected");
  const snap1 = parseOnboardingBriefingSnapshotV1(raw1);
  assert(snap1?.status === "completed", "onboarding_briefing_v1.status should be completed");
  assert(snap1.payload.settings_identity?.studio_name === studioA, "snapshot payload studio_name");

  const { data: prof1 } = await sr
    .from("studio_business_profiles")
    .select("photographer_id")
    .eq("photographer_id", userAId)
    .maybeSingle();
  assert(prof1?.photographer_id === userAId, "studio_business_profiles upserted");

  const { data: rules1 } = await sr
    .from("playbook_rules")
    .select("id, source_type, instruction, action_key")
    .eq("photographer_id", userAId);
  assert(rules1 && rules1.length > 0, "playbook_rules inserted");
  const manual1 = rules1.find((r) => r.source_type === MANUAL_PLAYBOOK_SOURCE);
  assert(manual1?.instruction === "MANUAL_PLAYBOOK_SURVIVES", "manual playbook survives finalize");
  const onboardingRuleTypes = new Set(
    rules1.filter((r) => r.source_type !== MANUAL_PLAYBOOK_SOURCE).map((r) => r.source_type),
  );
  for (const st of onboardingRuleTypes) {
    assert(
      (FINALIZE_ONBOARDING_PLAYBOOK_DELETE_SOURCE_TYPES as readonly string[]).includes(st),
      `unexpected mapped playbook source_type: ${st}`,
    );
  }

  const { data: kb1 } = await sr
    .from("knowledge_base")
    .select("id, metadata, content")
    .eq("photographer_id", userAId);
  assert(kb1 && kb1.length >= 2, "expect onboarding KB + manual KB");
  const manualKb = kb1.find(
    (k) => (k.metadata as Record<string, unknown> | null)?.[MANUAL_KB_MARKER] === true,
  );
  assert(manualKb?.content === "MANUAL_KB_SURVIVES", "manual knowledge_base survives finalize");
  const onboardKb = kb1.find(
    (k) =>
      (k.metadata as Record<string, unknown> | null)?.[KNOWLEDGE_BASE_METADATA_ONBOARDING_SOURCE_KEY] ===
      KNOWLEDGE_BASE_METADATA_ONBOARDING_SOURCE_VALUE,
  );
  assert(onboardKb, "onboarding-tagged knowledge_base row exists");

  const studioB = "LiveVerify Studio B";
  const payloadB: OnboardingPayloadV4 = {
    ...payloadA,
    settings_identity: { studio_name: studioB },
    settings_meta: { onboarding_completed_at: t1 },
  };
  const t2 = new Date().toISOString();
  const completedPayloadB: OnboardingPayloadV4 = {
    ...payloadB,
    settings_meta: { onboarding_completed_at: t2 },
    playbook_seeds: [
      {
        scope: "global",
        action_key: "reply",
        topic: "general",
        decision_mode: "draft_only",
        instruction: "REFINAL_VERIFY_INSTRUCTION",
      },
    ],
  };

  await finalizeOnboardingBriefingRuntime({
    supabase: userA,
    photographerId: userAId,
    completedPayload: completedPayloadB,
    completedSteps: [...ONBOARDING_BRIEFING_STEPS],
    nowIso: t2,
  });

  const { data: row2 } = await sr.from("photographers").select("settings").eq("id", userAId).maybeSingle();
  const raw2 = row2?.settings as Record<string, unknown>;
  const snap2 = parseOnboardingBriefingSnapshotV1(raw2);
  assert(snap2?.payload.settings_identity?.studio_name === studioB, "re-finalize updates snapshot payload");
  const { data: replyRows } = await sr
    .from("playbook_rules")
    .select("instruction, source_type")
    .eq("photographer_id", userAId)
    .eq("action_key", "reply");
  assert(
    replyRows?.some((r) => r.instruction.includes("REFINAL_VERIFY_INSTRUCTION")),
    "re-finalize updates onboarding-owned playbook content",
  );

  const { data: rules2 } = await sr
    .from("playbook_rules")
    .select("source_type, instruction")
    .eq("photographer_id", userAId);
  const manual2 = rules2?.find((r) => r.source_type === MANUAL_PLAYBOOK_SOURCE);
  assert(manual2?.instruction === "MANUAL_PLAYBOOK_SURVIVES", "manual playbook survives re-finalize");

  const { data: kb2 } = await sr.from("knowledge_base").select("metadata").eq("photographer_id", userAId);
  assert(
    kb2?.some((k) => (k.metadata as Record<string, unknown>)?.[MANUAL_KB_MARKER] === true),
    "manual knowledge_base survives re-finalize",
  );

  const userB = await signInUser(url, anonKey, emailB, password);
  let threw = false;
  try {
    await finalizeOnboardingBriefingRuntime({
      supabase: userB,
      photographerId: userAId,
      completedPayload: completedPayloadB,
      completedSteps: [...ONBOARDING_BRIEFING_STEPS],
      nowIso: t2,
    });
  } catch {
    threw = true;
  }
  assert(threw, "cross-tenant finalize should fail (RLS read or RPC auth)");

  assert(userAId !== userBId, "two distinct auth users for isolation proof");
}
