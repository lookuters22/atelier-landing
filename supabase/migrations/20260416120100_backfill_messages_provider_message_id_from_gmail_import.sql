-- Backfill messages.provider_message_id from trusted Gmail import metadata only (no guessing).

UPDATE public.messages m
SET provider_message_id = trim(both ' ' FROM (m.metadata -> 'gmail_import' ->> 'gmail_message_id'))
WHERE m.provider_message_id IS NULL
  AND m.metadata IS NOT NULL
  AND jsonb_typeof(m.metadata -> 'gmail_import') = 'object'
  AND (m.metadata -> 'gmail_import' ->> 'gmail_message_id') IS NOT NULL
  AND length(trim(both ' ' FROM (m.metadata -> 'gmail_import' ->> 'gmail_message_id'))) > 0;
