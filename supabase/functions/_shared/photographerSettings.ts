/**
 * Photographer `settings` JSON contract — re-export from app `src/lib` for Edge workers.
 * @see docs/v3/DATABASE_SCHEMA.md §5.1
 */
export {
  isPhotographerSettingsKey,
  mergePhotographerSettings,
  parsePhotographerSettings,
  PHOTOGRAPHER_SETTINGS_KEYS,
  type PhotographerSettings,
  type PhotographerSettingsKey,
} from "../../../src/lib/photographerSettings.ts";
