/**
 * Photographer `settings` JSON — identity and studio metadata (execute_v3 Phase 1).
 *
 * Step 1D: prepare settings/identity only. Do not use this module to change client routing or
 * WhatsApp/triage behavior here — those are later cutover phases.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  PhotographerSettings,
  PhotographerSettingsKey,
} from "../types/photographerSettings.types.ts";
import { PHOTOGRAPHER_SETTINGS_KEYS } from "../types/photographerSettings.types.ts";

export type { PhotographerSettings, PhotographerSettingsKey };
export { PHOTOGRAPHER_SETTINGS_KEYS };

/** Result of loading `photographers.settings` — full JSON plus parsed contract fields. */
export type ReadPhotographerSettingsResult = {
  raw: Record<string, unknown>;
  contract: Partial<PhotographerSettings>;
};

const KEY_SET = new Set<string>(PHOTOGRAPHER_SETTINGS_KEYS);

export function isPhotographerSettingsKey(k: string): k is PhotographerSettingsKey {
  return KEY_SET.has(k);
}

/**
 * Returns only known contract fields from arbitrary JSON (e.g. `photographers.settings`).
 */
export function parsePhotographerSettings(raw: unknown): Partial<PhotographerSettings> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return {};
  }
  const o = raw as Record<string, unknown>;
  const out: Partial<PhotographerSettings> = {};

  for (const key of PHOTOGRAPHER_SETTINGS_KEYS) {
    if (!(key in o) || o[key] === undefined) continue;
    const v = o[key];
    switch (key) {
      case "playbook_version":
        if (typeof v === "string" || typeof v === "number") out[key] = v;
        break;
      case "onboarding_completed_at":
      case "studio_name":
      case "manager_name":
      case "photographer_names":
      case "timezone":
      case "currency":
      case "whatsapp_number":
      case "admin_mobile_number":
        if (typeof v === "string") out[key] = v;
        break;
      default:
        break;
    }
  }

  return out;
}

/**
 * Merge `patch` into `existing` settings object. Only contract keys from `patch` are applied.
 * Preserves unrelated keys already on `existing`.
 */
export function mergePhotographerSettings(
  existing: Record<string, unknown> | null | undefined,
  patch: Partial<PhotographerSettings>,
): Record<string, unknown> {
  const base: Record<string, unknown> =
    existing && typeof existing === "object" && !Array.isArray(existing)
      ? { ...existing }
      : {};

  for (const key of PHOTOGRAPHER_SETTINGS_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(patch, key)) continue;
    const v = patch[key];
    if (v === undefined) {
      delete base[key];
      continue;
    }
    base[key] = v;
  }

  return base;
}

/**
 * Load `photographers.settings` for one tenant. `id` must match `photographers.id`.
 */
export async function readPhotographerSettings(
  supabase: SupabaseClient,
  photographerId: string,
): Promise<ReadPhotographerSettingsResult | null> {
  const { data, error } = await supabase
    .from("photographers")
    .select("settings")
    .eq("id", photographerId)
    .maybeSingle();

  if (error) {
    throw new Error(`readPhotographerSettings: ${error.message}`);
  }
  if (!data) {
    return null;
  }

  const raw =
    data.settings && typeof data.settings === "object" && !Array.isArray(data.settings)
      ? { ...(data.settings as Record<string, unknown>) }
      : {};

  return {
    raw,
    contract: parsePhotographerSettings(raw),
  };
}

/**
 * Merge `patch` into existing `settings` JSONB and persist. Preserves non-contract keys.
 * Throws if the photographer row does not exist (no rows updated).
 */
export async function writePhotographerSettingsMerged(
  supabase: SupabaseClient,
  photographerId: string,
  patch: Partial<PhotographerSettings>,
): Promise<Record<string, unknown>> {
  const current = await readPhotographerSettings(supabase, photographerId);
  const merged = mergePhotographerSettings(current?.raw ?? {}, patch);

  const { data, error } = await supabase
    .from("photographers")
    .update({ settings: merged })
    .eq("id", photographerId)
    .select("id")
    .maybeSingle();

  if (error) {
    throw new Error(`writePhotographerSettingsMerged: ${error.message}`);
  }
  if (!data) {
    throw new Error("writePhotographerSettingsMerged: photographer row not found or not updated");
  }

  return merged;
}
