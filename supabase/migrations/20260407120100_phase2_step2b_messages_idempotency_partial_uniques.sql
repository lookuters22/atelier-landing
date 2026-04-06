-- Phase 2 Step 2B follow-up — message idempotency uniqueness (docs/v3/DATABASE_SCHEMA.md §5.10).
-- Requires columns from 20260407120000_phase2_step2b_extend_weddings_threads_messages_drafts.sql.
-- If CREATE UNIQUE INDEX fails, inspect duplicates:
--   SELECT thread_id, provider_message_id, COUNT(*) FROM messages
--     WHERE provider_message_id IS NOT NULL GROUP BY 1, 2 HAVING COUNT(*) > 1;
--   SELECT idempotency_key, COUNT(*) FROM messages
--     WHERE idempotency_key IS NOT NULL GROUP BY 1 HAVING COUNT(*) > 1;

CREATE UNIQUE INDEX uq_messages_thread_provider_message_id
  ON public.messages (thread_id, provider_message_id)
  WHERE provider_message_id IS NOT NULL;

CREATE UNIQUE INDEX uq_messages_idempotency_key
  ON public.messages (idempotency_key)
  WHERE idempotency_key IS NOT NULL;
