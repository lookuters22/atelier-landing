/**
 * Service-role read/write for `photographers.settings` (tenant-scoped by `photographers.id`).
 * Uses shared merge/parse from `src/lib/photographerSettings.ts`.
 */
import { supabaseAdmin } from "./supabase.ts";
import {
  readPhotographerSettings,
  writePhotographerSettingsMerged,
  type PhotographerSettings,
  type ReadPhotographerSettingsResult,
} from "../../../src/lib/photographerSettings.ts";

export type { PhotographerSettings, ReadPhotographerSettingsResult };

export async function readPhotographerSettingsAdmin(
  photographerId: string,
): Promise<ReadPhotographerSettingsResult | null> {
  return readPhotographerSettings(supabaseAdmin, photographerId);
}

export async function patchPhotographerSettingsAdmin(
  photographerId: string,
  patch: Partial<PhotographerSettings>,
): Promise<Record<string, unknown>> {
  return writePhotographerSettingsMerged(supabaseAdmin, photographerId, patch);
}
