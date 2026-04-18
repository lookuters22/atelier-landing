-- Corrective migration for 20260501000000_studio_business_profiles_v2_scope.sql.
--
-- That migration had a shape bug on two JSONB keys inside
-- `studio_business_profiles.extensions`:
--
--   travel_constraints  : declared as a string[] in BusinessScopeExtensionsV2
--   service_areas       : declared as a BusinessScopeServiceArea[]
--
-- The original COALESCE fallbacks used `{}` (object) instead of `[]`
-- (array), so any row whose source extensions didn't already carry
-- those keys was written with `{}` for both — violating the declared
-- shape and tripping downstream normalizers that expect an array.
--
-- The TypeScript read path (`resolveBusinessScopeExtensions` +
-- `normalizeServiceAreasFromUnknown`) is already defensive: it coerces
-- non-arrays to `[]` and drops the key when empty on the next write.
-- This migration heals the stored DB value so readers that skip that
-- normalization layer (future SQL consumers, analytics, etc.) see the
-- correct shape too.
--
-- Idempotent: safe to run multiple times. Only touches rows whose
-- current shape is wrong; leaves correctly-shaped arrays alone.

BEGIN;

UPDATE public.studio_business_profiles
SET extensions = jsonb_set(
      extensions,
      '{service_areas}',
      '[]'::jsonb,
      true
    ),
    updated_at = now()
WHERE extensions IS NOT NULL
  AND jsonb_typeof(extensions->'service_areas') IS DISTINCT FROM 'array';

UPDATE public.studio_business_profiles
SET extensions = jsonb_set(
      extensions,
      '{travel_constraints}',
      '[]'::jsonb,
      true
    ),
    updated_at = now()
WHERE extensions IS NOT NULL
  AND jsonb_typeof(extensions->'travel_constraints') IS DISTINCT FROM 'array';

COMMIT;
