-- Business-scope custom additions (docs/v3/DATABASE_SCHEMA.md §5.1A extensions).
-- Extension vocabulary for UI/review/hydration only — not deterministic allow/deny branching.

ALTER TABLE public.studio_business_profiles
  ADD COLUMN extensions JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.studio_business_profiles.extensions IS
  'Versioned BusinessScopeExtensionsV1 JSON: custom labels with optional behaves_like hints to canonical enums.';
