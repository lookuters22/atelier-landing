/**
 * Canonical `photographers.settings` JSON contract (docs/v3/DATABASE_SCHEMA.md §5.1, execute_v3 Step 1A).
 * All fields optional — JSONB may be partial or include legacy keys we do not model here.
 */
export type PhotographerSettings = {
  studio_name?: string;
  manager_name?: string;
  photographer_names?: string;
  timezone?: string;
  currency?: string;
  /** Legacy UI / Twilio routing; keep during migration */
  whatsapp_number?: string;
  /** Canonical operator WhatsApp identity (E.164) */
  admin_mobile_number?: string;
  /** ISO 8601 timestamp string when onboarding finished */
  onboarding_completed_at?: string;
  /** String or number for semver-like tags */
  playbook_version?: string | number;
};

/** Known keys only — use for parsing/merging; unknown keys in JSONB are preserved by merge when merging onto a full object. */
export const PHOTOGRAPHER_SETTINGS_KEYS = [
  "studio_name",
  "manager_name",
  "photographer_names",
  "timezone",
  "currency",
  "whatsapp_number",
  "admin_mobile_number",
  "onboarding_completed_at",
  "playbook_version",
] as const;

export type PhotographerSettingsKey = (typeof PHOTOGRAPHER_SETTINGS_KEYS)[number];
