-- Atomic Gmail OAuth DB persistence: connected_accounts + oauth_tokens in one transaction;
-- sync_status = 'connected' only after token row is written.

CREATE OR REPLACE FUNCTION public.complete_google_oauth_connection(
  p_photographer_id uuid,
  p_provider text,
  p_provider_account_id text,
  p_email text,
  p_display_name text,
  p_token_expires_at timestamptz,
  p_access_token text,
  p_refresh_token text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_account_id uuid;
BEGIN
  IF p_provider IS DISTINCT FROM 'google' THEN
    RAISE EXCEPTION 'complete_google_oauth_connection: invalid provider';
  END IF;

  INSERT INTO public.connected_accounts (
    photographer_id,
    provider,
    provider_account_id,
    email,
    display_name,
    sync_status,
    sync_error_summary,
    token_expires_at,
    updated_at
  )
  VALUES (
    p_photographer_id,
    p_provider,
    p_provider_account_id,
    p_email,
    p_display_name,
    'disconnected',
    NULL,
    p_token_expires_at,
    now()
  )
  ON CONFLICT (photographer_id, provider, provider_account_id)
  DO UPDATE SET
    email = EXCLUDED.email,
    display_name = EXCLUDED.display_name,
    sync_error_summary = NULL,
    token_expires_at = EXCLUDED.token_expires_at,
    updated_at = now(),
    sync_status = 'disconnected'
  RETURNING id INTO v_account_id;

  INSERT INTO public.connected_account_oauth_tokens (
    connected_account_id,
    access_token,
    refresh_token,
    updated_at
  )
  VALUES (
    v_account_id,
    p_access_token,
    p_refresh_token,
    now()
  )
  ON CONFLICT (connected_account_id) DO UPDATE SET
    access_token = EXCLUDED.access_token,
    refresh_token = COALESCE(EXCLUDED.refresh_token, connected_account_oauth_tokens.refresh_token),
    updated_at = now();

  UPDATE public.connected_accounts
  SET
    sync_status = 'connected',
    sync_error_summary = NULL,
    updated_at = now()
  WHERE id = v_account_id;

  RETURN v_account_id;
END;
$$;

COMMENT ON FUNCTION public.complete_google_oauth_connection IS
  'Service-role only: upserts Google connected_account + oauth_tokens atomically; sets sync_status=connected only after tokens persist.';

REVOKE ALL ON FUNCTION public.complete_google_oauth_connection(
  uuid, text, text, text, text, timestamptz, text, text
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.complete_google_oauth_connection(
  uuid, text, text, text, text, timestamptz, text, text
) TO service_role;
