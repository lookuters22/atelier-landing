-- Phase 2 Step 2B — extend weddings, threads, messages, drafts (docs/v3/execute_v3.md Step 2B;
-- column shapes: docs/v3/DATABASE_SCHEMA.md §5.2, §5.7, §5.10, §5.12).

DO $$
BEGIN
  CREATE TYPE public.automation_mode AS ENUM (
    'auto',
    'draft_only',
    'human_only'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END;
$$;

-- ── weddings ──────────────────────────────────────────────────
ALTER TABLE public.weddings
  ADD COLUMN compassion_pause BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN strategic_pause BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN agency_cc_lock BOOLEAN NOT NULL DEFAULT false;

-- ── threads ─────────────────────────────────────────────────────
ALTER TABLE public.threads
  ADD COLUMN channel public.thread_channel NOT NULL DEFAULT 'email',
  ADD COLUMN external_thread_key TEXT,
  ADD COLUMN status TEXT NOT NULL DEFAULT 'open',
  ADD COLUMN automation_mode public.automation_mode NOT NULL DEFAULT 'auto',
  ADD COLUMN last_inbound_at TIMESTAMPTZ,
  ADD COLUMN last_outbound_at TIMESTAMPTZ,
  ADD COLUMN needs_human BOOLEAN NOT NULL DEFAULT false;

-- ── messages ───────────────────────────────────────────────────
ALTER TABLE public.messages
  ADD COLUMN provider_message_id TEXT,
  ADD COLUMN idempotency_key TEXT,
  ADD COLUMN raw_payload JSONB,
  ADD COLUMN metadata JSONB;

-- ── drafts ─────────────────────────────────────────────────────
ALTER TABLE public.drafts
  ADD COLUMN photographer_id UUID REFERENCES public.photographers(id) ON DELETE CASCADE,
  ADD COLUMN decision_mode public.decision_mode,
  ADD COLUMN source_action_key TEXT,
  ADD COLUMN locked_for_sending_at TIMESTAMPTZ;

UPDATE public.drafts AS d
SET photographer_id = t.photographer_id
FROM public.threads AS t
WHERE d.thread_id = t.id
  AND d.photographer_id IS NULL;

ALTER TABLE public.drafts
  ALTER COLUMN photographer_id SET NOT NULL;

CREATE INDEX idx_drafts_photographer_id ON public.drafts(photographer_id);
