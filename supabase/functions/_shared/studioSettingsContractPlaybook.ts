/**
 * Single source of truth for studio settings → `playbook_rules.action_key = studio_settings_contract`
 * (Phase 12). Consumed by `src/lib/backfillPhotographerSettingsToPlaybook.ts` and Deno QA (`qa_runner.ts`).
 */
export const ACTION_KEY_STUDIO_SETTINGS_CONTRACT = "studio_settings_contract";

export const STUDIO_CONTRACT_FIELD_KEYS = [
  "studio_name",
  "manager_name",
  "photographer_names",
  "timezone",
  "currency",
] as const;

/** Raw `photographers.settings` JSON or parsed contract — same rules as backfill. */
export function hasMeaningfulStudioSettingsContract(contract: unknown): boolean {
  if (!contract || typeof contract !== "object" || Array.isArray(contract)) return false;
  const o = contract as Record<string, unknown>;
  for (const key of STUDIO_CONTRACT_FIELD_KEYS) {
    const v = o[key];
    if (typeof v === "string" && v.trim().length > 0) return true;
  }
  return false;
}
