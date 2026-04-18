-- SQL validator functions for studio geography JSON shapes.
--
-- TS mirror (authoritative for types):
--   src/lib/studioBaseLocation.ts               (base_location)
--   src/lib/serviceAreaPicker/businessScopeServiceAreasAdapter.ts
--                                                (service_areas row)
--   src/lib/studioGeographyContract.ts          (precedence & posture)
--
-- These validators are used by:
--   - CHECK constraints on the JSONB columns (installed by a follow-up
--     migration once legacy rows are healed)
--   - the `finalize_onboarding_briefing_v1` RPC (hard reject at
--     onboarding completion time)
--   - ad-hoc repair tooling that wants to answer "is this blob safe?"
--
-- Both functions are IMMUTABLE, SECURITY INVOKER, and return `true` / `false`
-- without raising so they're safe to use from CHECK predicates.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Base location shape validator
-- ---------------------------------------------------------------------------
--
-- Accepts:
--   NULL                                → TRUE (absence is valid)
--   jsonb 'null'                        → TRUE (explicit clear is valid)
--   object with all required keys + valid kinds/providers → TRUE
--   anything else                       → FALSE
--
-- Required keys (kept in sync with `StudioBaseLocation`):
--   provider_id, label, kind, provider, centroid, bbox, selected_at

CREATE OR REPLACE FUNCTION public.validate_studio_base_location_shape(
  p_value jsonb
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT
    CASE
      WHEN p_value IS NULL THEN TRUE
      WHEN jsonb_typeof(p_value) = 'null' THEN TRUE
      WHEN jsonb_typeof(p_value) <> 'object' THEN FALSE
      ELSE
        -- all required string keys present and non-empty
        (p_value ? 'provider_id'
          AND jsonb_typeof(p_value->'provider_id') = 'string'
          AND length(p_value->>'provider_id') > 0)
        AND (p_value ? 'label'
          AND jsonb_typeof(p_value->'label') = 'string'
          AND length(p_value->>'label') > 0)
        AND (p_value ? 'selected_at'
          AND jsonb_typeof(p_value->'selected_at') = 'string'
          AND length(p_value->>'selected_at') > 0)
        AND (p_value ->> 'kind' IN ('city','region','country','custom'))
        AND (p_value ->> 'provider' IN ('bundled','custom'))
        -- centroid: [lng, lat] both numbers
        AND jsonb_typeof(p_value->'centroid') = 'array'
        AND jsonb_array_length(p_value->'centroid') = 2
        AND jsonb_typeof(p_value->'centroid'->0) = 'number'
        AND jsonb_typeof(p_value->'centroid'->1) = 'number'
        -- bbox: [w, s, e, n] all numbers
        AND jsonb_typeof(p_value->'bbox') = 'array'
        AND jsonb_array_length(p_value->'bbox') = 4
        AND jsonb_typeof(p_value->'bbox'->0) = 'number'
        AND jsonb_typeof(p_value->'bbox'->1) = 'number'
        AND jsonb_typeof(p_value->'bbox'->2) = 'number'
        AND jsonb_typeof(p_value->'bbox'->3) = 'number'
    END
$$;

COMMENT ON FUNCTION public.validate_studio_base_location_shape IS
  'Returns TRUE if the value is NULL / jsonb-null / a fully-formed StudioBaseLocation object. '
  'See src/lib/studioBaseLocation.ts for the TS mirror. Used by photographers.settings CHECK.';

-- ---------------------------------------------------------------------------
-- 2. Service-area row shape validator
-- ---------------------------------------------------------------------------
--
-- Per-row validator. Separate from the array validator below so CHECK
-- predicates can attribute failures to a specific row when useful.
--
-- Required keys (kept in sync with `BusinessScopeServiceArea`):
--   provider_id, label, kind, provider, centroid, bbox, selected_at

CREATE OR REPLACE FUNCTION public.validate_studio_service_area_row_shape(
  p_value jsonb
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT
    jsonb_typeof(p_value) = 'object'
    AND (p_value ? 'provider_id'
      AND jsonb_typeof(p_value->'provider_id') = 'string'
      AND length(p_value->>'provider_id') > 0)
    AND (p_value ? 'label'
      AND jsonb_typeof(p_value->'label') = 'string'
      AND length(p_value->>'label') > 0)
    AND (p_value ? 'selected_at'
      AND jsonb_typeof(p_value->'selected_at') = 'string'
      AND length(p_value->>'selected_at') > 0)
    AND (p_value ->> 'kind' IN ('worldwide','continent','country','region','city','custom'))
    AND (p_value ->> 'provider' IN ('bundled','custom'))
    AND jsonb_typeof(p_value->'centroid') = 'array'
    AND jsonb_array_length(p_value->'centroid') = 2
    AND jsonb_typeof(p_value->'centroid'->0) = 'number'
    AND jsonb_typeof(p_value->'centroid'->1) = 'number'
    AND jsonb_typeof(p_value->'bbox') = 'array'
    AND jsonb_array_length(p_value->'bbox') = 4
    AND jsonb_typeof(p_value->'bbox'->0) = 'number'
    AND jsonb_typeof(p_value->'bbox'->1) = 'number'
    AND jsonb_typeof(p_value->'bbox'->2) = 'number'
    AND jsonb_typeof(p_value->'bbox'->3) = 'number'
$$;

COMMENT ON FUNCTION public.validate_studio_service_area_row_shape IS
  'Returns TRUE for a single BusinessScopeServiceArea JSON object (all required fields + valid kind/provider). '
  'See src/lib/serviceAreaPicker/businessScopeServiceAreasAdapter.ts.';

-- ---------------------------------------------------------------------------
-- 3. Service-area array validator
-- ---------------------------------------------------------------------------
--
-- Accepts:
--   NULL       → TRUE (absence is valid at the array level)
--   []         → TRUE (empty selection is valid; the finalize RPC will
--                      additionally require at least one row, but the
--                      *shape* itself is fine)
--   [rows...]  → TRUE iff every element passes the row validator
--   anything else → FALSE

CREATE OR REPLACE FUNCTION public.validate_studio_service_areas_shape(
  p_value jsonb
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT
    CASE
      WHEN p_value IS NULL THEN TRUE
      WHEN jsonb_typeof(p_value) = 'null' THEN TRUE
      WHEN jsonb_typeof(p_value) <> 'array' THEN FALSE
      WHEN jsonb_array_length(p_value) = 0 THEN TRUE
      ELSE NOT EXISTS (
        SELECT 1
        FROM jsonb_array_elements(p_value) AS elem
        WHERE NOT public.validate_studio_service_area_row_shape(elem)
      )
    END
$$;

COMMENT ON FUNCTION public.validate_studio_service_areas_shape IS
  'Returns TRUE if the value is NULL / jsonb-null / empty-array / array of valid BusinessScopeServiceArea rows.';

COMMIT;
