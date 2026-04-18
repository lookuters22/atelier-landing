-- Data-healing migration before CHECK constraints land.
--
-- 20260502 already healed `service_areas` / `travel_constraints` that were
-- stored as `{}` instead of `[]`. This migration handles the remaining
-- cases so 20260505 can add CHECK constraints without bricking live
-- tenants on legacy malformed blobs.
--
--   photographers.settings.base_location
--     - if `base_location` is present but does not satisfy
--       validate_studio_base_location_shape(), strip the key (NULLs on
--       the column keep their original defaults).
--     - explicit `null` survives (it is an operator-driven clear).
--
--   studio_business_profiles.extensions.service_areas
--     - if `service_areas` is present but does not satisfy
--       validate_studio_service_areas_shape(), replace with `[]`.
--     - rows that already pass are untouched.
--
-- Both UPDATEs are idempotent and safe to re-run.

BEGIN;

-- ── photographers.settings.base_location ────────────────────────────────
-- `photographers` is the original tenant table from 20240101 and has no
-- `updated_at` column (only id / email / settings). Don't bump it here.
UPDATE public.photographers
SET
  settings = settings - 'base_location'
WHERE settings ? 'base_location'
  AND NOT public.validate_studio_base_location_shape(settings->'base_location');

-- ── studio_business_profiles.extensions.service_areas ───────────────────
UPDATE public.studio_business_profiles
SET
  extensions = jsonb_set(extensions, '{service_areas}', '[]'::jsonb, true),
  updated_at = now()
WHERE extensions IS NOT NULL
  AND extensions ? 'service_areas'
  AND NOT public.validate_studio_service_areas_shape(extensions->'service_areas');

COMMIT;
