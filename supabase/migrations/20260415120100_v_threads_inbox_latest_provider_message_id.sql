-- Expose Gmail provider message id on latest message for inbox star/read sync (Gmail API modify).

CREATE OR REPLACE VIEW public.v_threads_inbox_latest_message
WITH (security_invoker = true) AS
SELECT
  t.id,
  t.photographer_id,
  t.wedding_id,
  t.title,
  t.last_activity_at,
  t.ai_routing_metadata,
  t.kind,
  lm.id AS latest_message_id,
  lm.sender AS latest_sender,
  COALESCE(lm.body, ''::text) AS latest_body,
  lm.sent_at AS latest_sent_at,
  lm.metadata AS latest_message_metadata,
  COALESCE(
    (
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', ma.id,
          'kind', ma.kind,
          'mime_type', ma.mime_type,
          'metadata', ma.metadata,
          'storage_path', ma.storage_path,
          'source_url', ma.source_url
        )
        ORDER BY ma.id
      )
      FROM public.message_attachments ma
      WHERE ma.message_id = lm.id
    ),
    '[]'::jsonb
  ) AS latest_attachments_json,
  lm.provider_message_id AS latest_provider_message_id
FROM public.threads t
LEFT JOIN LATERAL (
  SELECT m.id, m.sender, m.body, m.sent_at, m.metadata, m.provider_message_id
  FROM public.messages m
  WHERE m.thread_id = t.id
  ORDER BY m.sent_at DESC NULLS LAST, m.id DESC
  LIMIT 1
) lm ON true;

COMMENT ON VIEW public.v_threads_inbox_latest_message IS
  'G4: Per-thread latest message + attachment JSON for Inbox list/detail; includes latest_provider_message_id for Gmail modify.';

GRANT SELECT ON public.v_threads_inbox_latest_message TO authenticated;
GRANT SELECT ON public.v_threads_inbox_latest_message TO service_role;
