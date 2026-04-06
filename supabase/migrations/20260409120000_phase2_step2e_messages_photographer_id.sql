-- Phase 2 Step 2E — tenant-safety: direct photographer_id on messages (AI-facing table).
-- docs/v3/execute_v3.md Step 2E; docs/v3/DATABASE_SCHEMA.md §3, §5.10.

ALTER TABLE public.messages
  ADD COLUMN photographer_id UUID REFERENCES public.photographers(id) ON DELETE CASCADE;

UPDATE public.messages AS m
SET photographer_id = t.photographer_id
FROM public.threads AS t
WHERE m.thread_id = t.id
  AND m.photographer_id IS NULL;

ALTER TABLE public.messages
  ALTER COLUMN photographer_id SET NOT NULL;

CREATE INDEX idx_messages_photographer_id ON public.messages(photographer_id);
