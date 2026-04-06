-- Phase 6 Step 6A — calendar_events + wedding_milestones (DATABASE_SCHEMA.md)

CREATE TYPE public.event_type AS ENUM (
  'about_call',
  'timeline_call',
  'gallery_reveal',
  'other'
);

-- ── calendar_events ────────────────────────────────────────────
CREATE TABLE public.calendar_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  photographer_id uuid NOT NULL REFERENCES public.photographers(id) ON DELETE CASCADE,
  wedding_id uuid REFERENCES public.weddings(id) ON DELETE SET NULL,
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  title text NOT NULL,
  event_type public.event_type NOT NULL,
  start_time timestamptz NOT NULL,
  end_time timestamptz NOT NULL,
  meeting_link text,
  CONSTRAINT calendar_events_end_after_start CHECK (end_time >= start_time)
);

CREATE INDEX idx_calendar_events_photographer_id ON public.calendar_events(photographer_id);
CREATE INDEX idx_calendar_events_start_time ON public.calendar_events(start_time);
CREATE INDEX idx_calendar_events_end_time ON public.calendar_events(end_time);
CREATE INDEX idx_calendar_events_photographer_start ON public.calendar_events(photographer_id, start_time);

ALTER TABLE public.calendar_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "calendar_events_tenant_isolation" ON public.calendar_events
  FOR ALL
  USING (photographer_id = (select auth.uid()))
  WITH CHECK (photographer_id = (select auth.uid()));

-- ── wedding_milestones (PK = wedding_id) ─────────────────────
CREATE TABLE public.wedding_milestones (
  wedding_id uuid PRIMARY KEY REFERENCES public.weddings(id) ON DELETE CASCADE,
  photographer_id uuid NOT NULL REFERENCES public.photographers(id) ON DELETE CASCADE,
  retainer_paid boolean NOT NULL DEFAULT false,
  questionnaire_sent boolean NOT NULL DEFAULT false,
  questionnaire_completed boolean NOT NULL DEFAULT false,
  moodboard_received boolean NOT NULL DEFAULT false,
  timeline_received boolean NOT NULL DEFAULT false
);

CREATE INDEX idx_wedding_milestones_photographer_id ON public.wedding_milestones(photographer_id);

ALTER TABLE public.wedding_milestones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "wedding_milestones_tenant_isolation" ON public.wedding_milestones
  FOR ALL
  USING (photographer_id = (select auth.uid()))
  WITH CHECK (photographer_id = (select auth.uid()));
