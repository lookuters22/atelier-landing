-- Narrative ordering for drafts exports / QA (e.g. qa_print_all_drafts.ts)
ALTER TABLE public.drafts
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
