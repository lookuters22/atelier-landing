-- Phase 1 Step 1A — V2 foundation: memories, thread_summaries, threads.photographer_id,
-- messages/drafts RLS (thread-scoped), tasks RLS
-- Tenant identity: auth.uid() = public.photographers.id (see add_auth_trigger migration).

-- ─────────────────────────────────────────────────────────────
-- 1) memories
-- ─────────────────────────────────────────────────────────────
CREATE TABLE public.memories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  photographer_id UUID NOT NULL REFERENCES public.photographers(id) ON DELETE CASCADE,
  wedding_id UUID REFERENCES public.weddings(id) ON DELETE SET NULL,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  full_content TEXT NOT NULL
);

CREATE INDEX idx_memories_photographer_id ON public.memories(photographer_id);
CREATE INDEX idx_memories_wedding_id ON public.memories(wedding_id);

ALTER TABLE public.memories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "memories_tenant_isolation" ON public.memories
  FOR ALL
  USING (photographer_id = (select auth.uid()))
  WITH CHECK (photographer_id = (select auth.uid()));

-- ─────────────────────────────────────────────────────────────
-- 2) threads: add photographer_id, backfill, purge orphans, NOT NULL, new RLS
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.threads
  ADD COLUMN photographer_id UUID REFERENCES public.photographers(id) ON DELETE CASCADE;

UPDATE public.threads AS t
SET photographer_id = w.photographer_id
FROM public.weddings AS w
WHERE t.wedding_id IS NOT NULL
  AND t.wedding_id = w.id;

-- Legacy unfiled threads with no tenant: remove so NOT NULL applies (CASCADE removes messages/drafts).
DELETE FROM public.threads
WHERE photographer_id IS NULL;

ALTER TABLE public.threads
  ALTER COLUMN photographer_id SET NOT NULL;

CREATE INDEX idx_threads_photographer_id ON public.threads(photographer_id);

DROP POLICY IF EXISTS "threads_tenant_isolation" ON public.threads;

CREATE POLICY "threads_tenant_isolation" ON public.threads
  FOR ALL
  USING (photographer_id = (select auth.uid()))
  WITH CHECK (photographer_id = (select auth.uid()));

-- ─────────────────────────────────────────────────────────────
-- 3) messages: RLS via threads.photographer_id (not weddings chain)
-- ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "messages_tenant_isolation" ON public.messages;

CREATE POLICY "messages_tenant_isolation" ON public.messages
  FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM public.threads t
      WHERE t.id = messages.thread_id
        AND t.photographer_id = (select auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.threads t
      WHERE t.id = messages.thread_id
        AND t.photographer_id = (select auth.uid())
    )
  );

-- ─────────────────────────────────────────────────────────────
-- 4) drafts: RLS via threads.photographer_id (not weddings chain)
-- ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "drafts_tenant_isolation" ON public.drafts;

CREATE POLICY "drafts_tenant_isolation" ON public.drafts
  FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM public.threads t
      WHERE t.id = drafts.thread_id
        AND t.photographer_id = (select auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.threads t
      WHERE t.id = drafts.thread_id
        AND t.photographer_id = (select auth.uid())
    )
  );

-- ─────────────────────────────────────────────────────────────
-- 5) thread_summaries (depends on threads + messages)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE public.thread_summaries (
  thread_id UUID NOT NULL PRIMARY KEY REFERENCES public.threads(id) ON DELETE CASCADE,
  photographer_id UUID NOT NULL REFERENCES public.photographers(id) ON DELETE CASCADE,
  summary TEXT NOT NULL,
  last_message_id UUID REFERENCES public.messages(id) ON DELETE SET NULL
);

CREATE INDEX idx_thread_summaries_photographer_id ON public.thread_summaries(photographer_id);

ALTER TABLE public.thread_summaries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "thread_summaries_tenant_isolation" ON public.thread_summaries
  FOR ALL
  USING (photographer_id = (select auth.uid()))
  WITH CHECK (photographer_id = (select auth.uid()));

-- ─────────────────────────────────────────────────────────────
-- 6) tasks: enable RLS + strict photographer_id
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tasks_tenant_isolation" ON public.tasks
  FOR ALL
  USING (photographer_id = (select auth.uid()))
  WITH CHECK (photographer_id = (select auth.uid()));
