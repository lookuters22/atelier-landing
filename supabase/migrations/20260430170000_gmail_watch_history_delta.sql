-- Gmail watch + Pub/Sub + history.list delta: import_candidates gmail_history + connected_accounts checkpoint/watch state.
-- Topic name is env-only (GMAIL_PUBSUB_TOPIC_NAME); no per-account topic column.

ALTER TABLE public.import_candidates DROP CONSTRAINT IF EXISTS import_candidates_source_type_check;

ALTER TABLE public.import_candidates
  ADD CONSTRAINT import_candidates_source_type_check
  CHECK (source_type IN ('gmail_label', 'gmail_history'));

COMMENT ON COLUMN public.import_candidates.source_type IS
  'gmail_label: label fast-lane; gmail_history: history.list / delta staging (Pub/Sub).';

ALTER TABLE public.connected_accounts
  ADD COLUMN IF NOT EXISTS gmail_last_history_id text null,
  ADD COLUMN IF NOT EXISTS gmail_watch_expiration timestamptz null,
  ADD COLUMN IF NOT EXISTS gmail_watch_last_renewed_at timestamptz null,
  ADD COLUMN IF NOT EXISTS gmail_delta_sync_last_error text null,
  ADD COLUMN IF NOT EXISTS gmail_delta_sync_last_error_at timestamptz null,
  ADD COLUMN IF NOT EXISTS gmail_sync_degraded boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.connected_accounts.gmail_last_history_id IS
  'Gmail users.history.list startHistoryId checkpoint; advance only after all pages + message work succeed.';
COMMENT ON COLUMN public.connected_accounts.gmail_watch_expiration IS
  'Gmail users.watch expiration (RFC3339 from API).';
COMMENT ON COLUMN public.connected_accounts.gmail_delta_sync_last_error IS
  'Last Gmail delta / catch-up / watch error (bounded).';
COMMENT ON COLUMN public.connected_accounts.gmail_sync_degraded IS
  'True when history.list baseline recovery or catch-up path was required (do not silently reset checkpoints).';
