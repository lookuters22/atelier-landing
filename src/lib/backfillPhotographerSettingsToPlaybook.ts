/**
 * execute_v3 Phase 12 — narrow backfill slice (Step 12A variant).
 *
 * Mirrors the **settings contract** fields that already live in `photographers.settings`
 * into **one** durable `playbook_rules` row per photographer (`studio_settings_contract`)
 * so operator/decision context can load them with other global rules.
 *
 * Does not backfill phones (`whatsapp_number`, `admin_mobile_number`) into playbook text —
 * those stay in settings only.
 */
import type { PhotographerSettings } from "../types/photographerSettings.types.ts";
import type { PlaybookRuleInsert } from "./onboardingV4Payload.ts";
import {
  ACTION_KEY_STUDIO_SETTINGS_CONTRACT,
  hasMeaningfulStudioSettingsContract,
  STUDIO_CONTRACT_FIELD_KEYS,
} from "../../supabase/functions/_shared/studioSettingsContractPlaybook.ts";

export { ACTION_KEY_STUDIO_SETTINGS_CONTRACT, hasMeaningfulStudioSettingsContract };

/**
 * Structured instruction JSON — same pattern as `escalationPreferencesToPlaybookInstruction`.
 */
export function studioSettingsContractInstructionV1(
  contract: Partial<PhotographerSettings>,
): string {
  const o: Record<string, unknown> = {
    kind: "settings_contract_backfill_v1",
  };
  for (const key of STUDIO_CONTRACT_FIELD_KEYS) {
    const v = contract[key as keyof PhotographerSettings];
    if (typeof v === "string" && v.trim().length > 0) {
      o[key] = v.trim();
    }
  }
  return JSON.stringify(o);
}

/**
 * Returns a single global playbook row, or `null` if there is nothing to backfill.
 */
export function buildStudioSettingsContractPlaybookRule(
  photographerId: string,
  contract: Partial<PhotographerSettings>,
): PlaybookRuleInsert | null {
  if (!hasMeaningfulStudioSettingsContract(contract)) return null;

  return {
    photographer_id: photographerId,
    scope: "global",
    channel: null,
    action_key: ACTION_KEY_STUDIO_SETTINGS_CONTRACT,
    topic: "identity",
    decision_mode: "auto",
    instruction: studioSettingsContractInstructionV1(contract),
    source_type: "settings_backfill_step12a",
    confidence_label: "explicit",
    is_active: true,
  };
}
