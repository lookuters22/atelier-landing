-- DB CHECK constraints for studio geography JSON shapes.
--
-- Installs AFTER:
--   20260503 — validator functions
--   20260504 — corrective healing for legacy malformed rows
--
-- Constraint semantics (defensive, not over-strict):
--
--   photographers.settings
--     - if `settings` does not carry a `base_location` key at all, pass.
--     - if `settings->'base_location'` is set, it must satisfy
--       validate_studio_base_location_shape(). `null` is allowed (explicit
--       operator clear).
--
--   studio_business_profiles.extensions
--     - if `extensions` is NULL or does not carry `service_areas`, pass.
--     - if `extensions->'service_areas'` is set, it must satisfy
--       validate_studio_service_areas_shape() (NULL / [] / array of rows).
--     - empty-array is allowed here; the *finalize RPC* is what rejects
--       completing onboarding with zero service areas.

BEGIN;

-- ── photographers.settings.base_location ────────────────────────────────
ALTER TABLE public.photographers
  DROP CONSTRAINT IF EXISTS photographers_settings_base_location_shape_chk;

ALTER TABLE public.photographers
  ADD CONSTRAINT photographers_settings_base_location_shape_chk
  CHECK (
    settings IS NULL
    OR NOT (settings ? 'base_location')
    OR public.validate_studio_base_location_shape(settings->'base_location')
  );

COMMENT ON CONSTRAINT photographers_settings_base_location_shape_chk
  ON public.photographers IS
  'If present, photographers.settings->base_location must match the StudioBaseLocation contract (null-allowed).';

-- ── studio_business_profiles.extensions.service_areas ───────────────────
ALTER TABLE public.studio_business_profiles
  DROP CONSTRAINT IF EXISTS studio_business_profiles_extensions_service_areas_shape_chk;

ALTER TABLE public.studio_business_profiles
  ADD CONSTRAINT studio_business_profiles_extensions_service_areas_shape_chk
  CHECK (
    extensions IS NULL
    OR NOT (extensions ? 'service_areas')
    OR public.validate_studio_service_areas_shape(extensions->'service_areas')
  );

COMMENT ON CONSTRAINT studio_business_profiles_extensions_service_areas_shape_chk
  ON public.studio_business_profiles IS
  'If present, extensions->service_areas must be NULL / [] / an array of valid BusinessScopeServiceArea rows.';

COMMIT;
