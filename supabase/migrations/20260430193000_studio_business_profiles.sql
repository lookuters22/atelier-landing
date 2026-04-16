-- Onboarding briefing slice 01 — structured studio business scope (docs/v3/DATABASE_SCHEMA.md §5.1A).
-- Tenant model: auth.uid() = public.photographers.id

CREATE TABLE public.studio_business_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  photographer_id UUID NOT NULL REFERENCES public.photographers(id) ON DELETE CASCADE,
  service_types JSONB NOT NULL DEFAULT '[]'::jsonb,
  service_availability JSONB NOT NULL DEFAULT '{}'::jsonb,
  geographic_scope JSONB NOT NULL DEFAULT '{}'::jsonb,
  travel_policy JSONB NOT NULL DEFAULT '{}'::jsonb,
  booking_scope JSONB NOT NULL DEFAULT '{}'::jsonb,
  client_types JSONB NOT NULL DEFAULT '[]'::jsonb,
  deliverable_types JSONB NOT NULL DEFAULT '[]'::jsonb,
  lead_acceptance_rules JSONB NOT NULL DEFAULT '{}'::jsonb,
  language_support JSONB NOT NULL DEFAULT '[]'::jsonb,
  team_structure JSONB NOT NULL DEFAULT '{}'::jsonb,
  source_type TEXT NOT NULL DEFAULT 'onboarding',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_studio_business_profiles_photographer_id UNIQUE (photographer_id)
);

CREATE INDEX idx_studio_business_profiles_photographer_id
  ON public.studio_business_profiles(photographer_id);

ALTER TABLE public.studio_business_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "studio_business_profiles_tenant_isolation" ON public.studio_business_profiles
  FOR ALL
  USING (photographer_id = (SELECT auth.uid()))
  WITH CHECK (photographer_id = (SELECT auth.uid()));
