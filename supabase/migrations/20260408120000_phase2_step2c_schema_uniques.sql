-- Phase 2 Step 2C — unique constraints from docs/v3/DATABASE_SCHEMA.md (execute_v3.md Step 2C).
--
-- Already present in earlier migrations (no-op here):
--   §5.4  contact_points: uq_contact_points_tenant_kind_normalized (20260406120000)
--   §5.10 messages: uq_messages_thread_provider_message_id, uq_messages_idempotency_key (20260407120100)
--   §5.11 message_attachments: uq_message_attachments_message_source (20260406120000)
--   §5.5, §5.8, §5.9 wedding_people / thread_weddings / thread_participants table UNIQUEs (20260406120000)
--
-- §5.7 threads — provider thread id (partial unique):
CREATE UNIQUE INDEX uq_threads_photographer_channel_external_thread_key
  ON public.threads (photographer_id, channel, external_thread_key)
  WHERE external_thread_key IS NOT NULL;
