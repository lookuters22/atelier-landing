/**
 * Server-side transactional finalization for onboarding briefing (Slice 2).
 * Orchestrates settings merge + RPC — no broad client-side table writes.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "../types/database.types.ts";
import {
  ONBOARDING_BRIEFING_STEPS,
  type OnboardingBriefingSnapshotV1,
} from "../types/onboardingBriefing.types.ts";
import {
  mergeOnboardingBriefingSnapshotIntoSettings,
  parseOnboardingBriefingSnapshotV1,
} from "./onboardingBriefingSettings.ts";
import {
  mapOnboardingPayloadToStorage,
  mergeOnboardingSettingsPatch,
  type KnowledgeBaseSeedInsert,
  type OnboardingPayloadV4,
  type OnboardingStorageMapping,
  type PlaybookRuleInsert,
  type StudioBusinessProfileInsert,
} from "./onboardingV4Payload.ts";
import { readPhotographerSettings } from "./photographerSettings.ts";
import {
  FinalizeGeographyValidationFailure,
  validateFinalizeGeographyPayload,
} from "./onboardingFinalizeGeographyContract.ts";

export type FinalizeOnboardingBriefingRuntimeArgs = {
  supabase: SupabaseClient<Database>;
  photographerId: string;
  /** Payload after `settings_meta.onboarding_completed_at` is set. */
  completedPayload: OnboardingPayloadV4;
  /** Step ids the user completed (merged with all briefing steps server-side). */
  completedSteps: string[];
  /** Completion timestamp (ISO 8601). Defaults to `new Date().toISOString()`. */
  nowIso?: string;
};

export type FinalizeOnboardingBriefingRuntimeResult = {
  /** Post-merge `photographers.settings` JSON (matches RPC write). */
  settings: Record<string, unknown>;
  mapping: OnboardingStorageMapping;
};

function toJson(value: unknown): Json {
  return JSON.parse(JSON.stringify(value)) as Json;
}

function studioBusinessProfileToRpcJson(row: StudioBusinessProfileInsert): Json {
  const { photographer_id: _pid, ...rest } = row;
  return toJson(rest);
}

function playbookRulesToRpcJson(rows: PlaybookRuleInsert[]): Json {
  const out = rows.map((r) => {
    const { photographer_id: _pid, ...rest } = r;
    return rest;
  });
  return toJson(out);
}

function knowledgeBaseRowsToRpcJson(rows: KnowledgeBaseSeedInsert[]): Json {
  const out = rows.map((r) => {
    const { photographer_id: _pid, ...rest } = r;
    return rest;
  });
  return toJson(out);
}

/**
 * Validates editor snapshot, merges completed briefing snapshot + onboarding mapping,
 * then runs `finalize_onboarding_briefing_v1` (single DB transaction).
 */
export async function finalizeOnboardingBriefingRuntime(
  args: FinalizeOnboardingBriefingRuntimeArgs,
): Promise<FinalizeOnboardingBriefingRuntimeResult> {
  const { supabase, photographerId, completedPayload, completedSteps } = args;
  const nowIso = args.nowIso ?? new Date().toISOString();

  const read = await readPhotographerSettings(supabase, photographerId);
  if (!read) {
    throw new Error("finalizeOnboardingBriefingRuntime: photographer not found");
  }

  const existingSnap = parseOnboardingBriefingSnapshotV1(read.raw);
  if (!existingSnap) {
    throw new Error(
      "finalizeOnboardingBriefingRuntime: no saved onboarding briefing snapshot — save a draft first",
    );
  }

  const mapping = mapOnboardingPayloadToStorage(photographerId, completedPayload);

  const completedStepsAll = Array.from(
    new Set([...completedSteps, ...ONBOARDING_BRIEFING_STEPS]),
  );
  const lastStep = ONBOARDING_BRIEFING_STEPS[ONBOARDING_BRIEFING_STEPS.length - 1];
  const snapshot: OnboardingBriefingSnapshotV1 = {
    schema_version: 1,
    status: "completed",
    completed_steps: completedStepsAll,
    last_saved_at: nowIso,
    current_step: lastStep,
    payload: completedPayload,
  };

  const withBriefing = mergeOnboardingBriefingSnapshotIntoSettings(read.raw, snapshot, {
    updatedAtIso: nowIso,
  });
  const finalSettings = mergeOnboardingSettingsPatch(withBriefing, mapping.settingsPatch);

  // Prevalidate geography contract before the RPC round-trip. The SQL guard
  // in `finalize_onboarding_briefing_v1` is authoritative; this mirror lets
  // the client surface the same failure code/message without a network hop.
  const geoError = validateFinalizeGeographyPayload({
    settings: finalSettings,
    studioBusinessProfile: mapping.studioBusinessProfile,
  });
  if (geoError) {
    throw new FinalizeGeographyValidationFailure(geoError);
  }

  const { error } = await supabase.rpc("finalize_onboarding_briefing_v1", {
    p_photographer_id: photographerId,
    p_settings: toJson(finalSettings),
    p_studio_business_profile: studioBusinessProfileToRpcJson(mapping.studioBusinessProfile),
    p_playbook_rules: playbookRulesToRpcJson(mapping.playbookRules),
    p_knowledge_base_rows: knowledgeBaseRowsToRpcJson(mapping.knowledgeBaseSeeds),
  });

  if (error) {
    throw new Error(`finalizeOnboardingBriefingRuntime: ${error.message}`);
  }

  return { settings: finalSettings, mapping };
}
