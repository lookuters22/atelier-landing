-- Slice 1 (NON_WEDDING_PROJECT_PROMOTION_SLICES.md): per-row project classification on `weddings`.
-- Does not change routing; existing rows and new rows default to `wedding`.

CREATE TYPE public.wedding_project_type AS ENUM (
  'wedding',
  'portrait',
  'commercial',
  'family',
  'editorial',
  'brand_content',
  'other'
);

COMMENT ON TYPE public.wedding_project_type IS
  'Per-project row classification. Not studio business-scope authority (see studio_business_profiles / playbook_rules).';

ALTER TABLE public.weddings
  ADD COLUMN project_type public.wedding_project_type NOT NULL DEFAULT 'wedding';

COMMENT ON COLUMN public.weddings.project_type IS
  'Kind of managed project this row represents. Legacy and wedding intake rows are `wedding`.';
