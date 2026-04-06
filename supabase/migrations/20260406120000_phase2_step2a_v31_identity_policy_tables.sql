-- Phase 2 Step 2A — V3.1: additive tables for identity, policy, attachments, escalations, documents.
-- Source: docs/v3/DATABASE_SCHEMA.md §5.3–5.5, §5.8–5.9, §5.11, §5.17–5.19; execute_v3.md Step 2A.
-- Tenant model: auth.uid() = public.photographers.id

-- ── New enums (infrastructure) ─────────────────────────────────
CREATE TYPE public.thread_channel AS ENUM (
  'email',
  'web',
  'whatsapp_operator',
  'manual',
  'system'
);

CREATE TYPE public.person_kind AS ENUM ('individual', 'organization');

CREATE TYPE public.contact_point_kind AS ENUM (
  'email',
  'phone',
  'whatsapp',
  'instagram',
  'other'
);

CREATE TYPE public.decision_mode AS ENUM (
  'auto',
  'draft_only',
  'ask_first',
  'forbidden'
);

CREATE TYPE public.rule_scope AS ENUM ('global', 'channel');

CREATE TYPE public.escalation_status AS ENUM (
  'open',
  'answered',
  'dismissed',
  'promoted'
);

CREATE TYPE public.thread_wedding_relation AS ENUM ('primary', 'mentioned', 'candidate');

CREATE TYPE public.document_kind AS ENUM (
  'invoice',
  'contract',
  'questionnaire',
  'timeline',
  'insurance',
  'price_guide',
  'gallery_export',
  'attachment',
  'other'
);

-- ── 1) people ─────────────────────────────────────────────────
CREATE TABLE public.people (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  photographer_id UUID NOT NULL REFERENCES public.photographers(id) ON DELETE CASCADE,
  kind public.person_kind NOT NULL,
  display_name TEXT NOT NULL,
  canonical_name TEXT NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_people_photographer_id ON public.people(photographer_id);

ALTER TABLE public.people ENABLE ROW LEVEL SECURITY;

CREATE POLICY "people_tenant_isolation" ON public.people
  FOR ALL
  USING (photographer_id = (SELECT auth.uid()))
  WITH CHECK (photographer_id = (SELECT auth.uid()));

-- ── 2) contact_points ───────────────────────────────────────────
CREATE TABLE public.contact_points (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  photographer_id UUID NOT NULL REFERENCES public.photographers(id) ON DELETE CASCADE,
  person_id UUID NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,
  kind public.contact_point_kind NOT NULL,
  value_raw TEXT NOT NULL,
  value_normalized TEXT NOT NULL,
  is_primary BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX uq_contact_points_tenant_kind_normalized
  ON public.contact_points (photographer_id, kind, value_normalized);

CREATE INDEX idx_contact_points_person_id ON public.contact_points(person_id);

ALTER TABLE public.contact_points ENABLE ROW LEVEL SECURITY;

CREATE POLICY "contact_points_tenant_isolation" ON public.contact_points
  FOR ALL
  USING (photographer_id = (SELECT auth.uid()))
  WITH CHECK (photographer_id = (SELECT auth.uid()));

-- ── 3) wedding_people ─────────────────────────────────────────
CREATE TABLE public.wedding_people (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  photographer_id UUID NOT NULL REFERENCES public.photographers(id) ON DELETE CASCADE,
  wedding_id UUID NOT NULL REFERENCES public.weddings(id) ON DELETE CASCADE,
  person_id UUID NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,
  role_label TEXT NOT NULL,
  relationship_modes JSONB,
  is_primary_contact BOOLEAN NOT NULL DEFAULT false,
  is_billing_contact BOOLEAN NOT NULL DEFAULT false,
  is_timeline_contact BOOLEAN NOT NULL DEFAULT false,
  is_approval_contact BOOLEAN NOT NULL DEFAULT false,
  is_payer BOOLEAN NOT NULL DEFAULT false,
  must_be_kept_in_loop BOOLEAN NOT NULL DEFAULT false,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_wedding_people_wedding_person UNIQUE (wedding_id, person_id)
);

CREATE INDEX idx_wedding_people_photographer_id ON public.wedding_people(photographer_id);
CREATE INDEX idx_wedding_people_wedding_id ON public.wedding_people(wedding_id);
CREATE INDEX idx_wedding_people_person_id ON public.wedding_people(person_id);

ALTER TABLE public.wedding_people ENABLE ROW LEVEL SECURITY;

CREATE POLICY "wedding_people_tenant_isolation" ON public.wedding_people
  FOR ALL
  USING (photographer_id = (SELECT auth.uid()))
  WITH CHECK (photographer_id = (SELECT auth.uid()));

-- ── 4) thread_weddings ──────────────────────────────────────────
CREATE TABLE public.thread_weddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  photographer_id UUID NOT NULL REFERENCES public.photographers(id) ON DELETE CASCADE,
  thread_id UUID NOT NULL REFERENCES public.threads(id) ON DELETE CASCADE,
  wedding_id UUID NOT NULL REFERENCES public.weddings(id) ON DELETE CASCADE,
  relation public.thread_wedding_relation NOT NULL,
  confidence_score NUMERIC,
  reasoning TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_thread_weddings_thread_wedding UNIQUE (thread_id, wedding_id)
);

CREATE INDEX idx_thread_weddings_photographer_id ON public.thread_weddings(photographer_id);

ALTER TABLE public.thread_weddings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "thread_weddings_tenant_isolation" ON public.thread_weddings
  FOR ALL
  USING (photographer_id = (SELECT auth.uid()))
  WITH CHECK (photographer_id = (SELECT auth.uid()));

-- ── 5) thread_participants ──────────────────────────────────────
CREATE TABLE public.thread_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  photographer_id UUID NOT NULL REFERENCES public.photographers(id) ON DELETE CASCADE,
  thread_id UUID NOT NULL REFERENCES public.threads(id) ON DELETE CASCADE,
  person_id UUID NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,
  visibility_role TEXT NOT NULL,
  is_sender BOOLEAN NOT NULL DEFAULT false,
  is_recipient BOOLEAN NOT NULL DEFAULT true,
  is_cc BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_thread_participants_thread_person UNIQUE (thread_id, person_id)
);

CREATE INDEX idx_thread_participants_photographer_id ON public.thread_participants(photographer_id);

ALTER TABLE public.thread_participants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "thread_participants_tenant_isolation" ON public.thread_participants
  FOR ALL
  USING (photographer_id = (SELECT auth.uid()))
  WITH CHECK (photographer_id = (SELECT auth.uid()));

-- ── 6) message_attachments ─────────────────────────────────────
CREATE TABLE public.message_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  photographer_id UUID NOT NULL REFERENCES public.photographers(id) ON DELETE CASCADE,
  message_id UUID NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  source_url TEXT NOT NULL,
  storage_path TEXT,
  mime_type TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_message_attachments_message_source UNIQUE (message_id, source_url)
);

CREATE INDEX idx_message_attachments_photographer_id ON public.message_attachments(photographer_id);
CREATE INDEX idx_message_attachments_message_id ON public.message_attachments(message_id);

ALTER TABLE public.message_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "message_attachments_tenant_isolation" ON public.message_attachments
  FOR ALL
  USING (photographer_id = (SELECT auth.uid()))
  WITH CHECK (photographer_id = (SELECT auth.uid()));

-- ── 7) playbook_rules ───────────────────────────────────────────
CREATE TABLE public.playbook_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  photographer_id UUID NOT NULL REFERENCES public.photographers(id) ON DELETE CASCADE,
  scope public.rule_scope NOT NULL,
  channel public.thread_channel,
  action_key TEXT NOT NULL,
  topic TEXT NOT NULL,
  decision_mode public.decision_mode NOT NULL,
  instruction TEXT NOT NULL,
  source_type TEXT NOT NULL,
  confidence_label TEXT NOT NULL DEFAULT 'explicit',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_playbook_rules_photographer_id ON public.playbook_rules(photographer_id);

ALTER TABLE public.playbook_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "playbook_rules_tenant_isolation" ON public.playbook_rules
  FOR ALL
  USING (photographer_id = (SELECT auth.uid()))
  WITH CHECK (photographer_id = (SELECT auth.uid()));

-- ── 8) escalation_requests ────────────────────────────────────
CREATE TABLE public.escalation_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  photographer_id UUID NOT NULL REFERENCES public.photographers(id) ON DELETE CASCADE,
  wedding_id UUID REFERENCES public.weddings(id) ON DELETE SET NULL,
  thread_id UUID REFERENCES public.threads(id) ON DELETE SET NULL,
  action_key TEXT NOT NULL,
  reason_code TEXT NOT NULL,
  decision_justification JSONB NOT NULL,
  question_body TEXT NOT NULL,
  recommended_resolution TEXT,
  status public.escalation_status NOT NULL DEFAULT 'open',
  resolution_text TEXT,
  resolved_decision_mode public.decision_mode,
  resolution_storage_target TEXT,
  promote_to_playbook BOOLEAN NOT NULL DEFAULT false,
  playbook_rule_id UUID REFERENCES public.playbook_rules(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ
);

CREATE INDEX idx_escalation_requests_photographer_id ON public.escalation_requests(photographer_id);
CREATE INDEX idx_escalation_requests_wedding_id ON public.escalation_requests(wedding_id);
CREATE INDEX idx_escalation_requests_thread_id ON public.escalation_requests(thread_id);

ALTER TABLE public.escalation_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "escalation_requests_tenant_isolation" ON public.escalation_requests
  FOR ALL
  USING (photographer_id = (SELECT auth.uid()))
  WITH CHECK (photographer_id = (SELECT auth.uid()));

-- ── 9) documents ────────────────────────────────────────────────
CREATE TABLE public.documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  photographer_id UUID NOT NULL REFERENCES public.photographers(id) ON DELETE CASCADE,
  wedding_id UUID REFERENCES public.weddings(id) ON DELETE SET NULL,
  kind public.document_kind NOT NULL,
  title TEXT NOT NULL,
  storage_path TEXT,
  provider_url TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_documents_photographer_id ON public.documents(photographer_id);
CREATE INDEX idx_documents_wedding_id ON public.documents(wedding_id);

ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "documents_tenant_isolation" ON public.documents
  FOR ALL
  USING (photographer_id = (SELECT auth.uid()))
  WITH CHECK (photographer_id = (SELECT auth.uid()));
