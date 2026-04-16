-- B: Atomic DB boundaries for Gmail import materialization (thread + message + candidate finalize + render FK).
-- External Gmail/Storage work stays in Edge/Inngest; only DB mutations here.
-- Secondary follow-up backlog for post-transaction repair (attachments, metadata updates).

-- ---------------------------------------------------------------------------
-- Durable secondary follow-up queue (worker / manual repair; service_role only)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.gmail_import_secondary_pending (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  photographer_id uuid NOT NULL REFERENCES public.photographers(id) ON DELETE CASCADE,
  import_candidate_id uuid NOT NULL REFERENCES public.import_candidates(id) ON DELETE CASCADE,
  message_id uuid NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  thread_id uuid REFERENCES public.threads(id) ON DELETE SET NULL,
  pending_kind text NOT NULL CHECK (pending_kind IN (
    'render_or_metadata',
    'staged_attachments_finalize',
    'attachment_metadata_update'
  )),
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'done')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_gmail_import_secondary_pending_open
  ON public.gmail_import_secondary_pending (photographer_id, status, created_at)
  WHERE status = 'open';

CREATE UNIQUE INDEX IF NOT EXISTS uq_gmail_import_secondary_pending_open_msg_kind
  ON public.gmail_import_secondary_pending (message_id, pending_kind)
  WHERE status = 'open';

COMMENT ON TABLE public.gmail_import_secondary_pending IS
  'Post-commit Gmail import follow-ups (attachment finalize, metadata repair). Open rows are actionable for workers.';

ALTER TABLE public.gmail_import_secondary_pending ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.gmail_import_secondary_pending FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE ON public.gmail_import_secondary_pending TO service_role;

ALTER TABLE public.import_candidates
  ADD COLUMN IF NOT EXISTS materialization_secondary_status text
  CHECK (
    materialization_secondary_status IS NULL
    OR materialization_secondary_status IN ('complete', 'degraded')
  );

COMMENT ON COLUMN public.import_candidates.materialization_secondary_status IS
  'complete: core DB materialization + render linkage succeeded; degraded: approved but follow-up work failed (see gmail_import_secondary_pending).';

-- ---------------------------------------------------------------------------
-- New thread: insert thread + message + optional render artifact linkage + approve candidate (one transaction).
-- Preconditions: import_candidates row exists for tenant; status in (pending, approving).
-- Postconditions: thread and message exist; candidate is approved with materialized_thread_id; render FKs consistent if p_render_artifact_id set.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.complete_gmail_import_materialize_new_thread(
  p_photographer_id uuid,
  p_import_candidate_id uuid,
  p_connected_account_id uuid,
  p_external_thread_key text,
  p_thread_title text,
  p_thread_wedding_id uuid,
  p_last_activity_at timestamptz,
  p_ai_routing_metadata jsonb,
  p_message_body text,
  p_message_sender text,
  p_message_sent_at timestamptz,
  p_message_metadata jsonb,
  p_message_raw_payload jsonb,
  p_import_provenance jsonb,
  p_render_artifact_id uuid,
  p_clear_import_approval_error boolean
)
RETURNS TABLE (out_thread_id uuid, out_message_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_thread_id uuid;
  v_message_id uuid;
  v_ic_connected uuid;
  v_ic_status text;
  v_n int;
BEGIN
  SELECT ic.connected_account_id, ic.status
  INTO v_ic_connected, v_ic_status
  FROM public.import_candidates ic
  WHERE ic.id = p_import_candidate_id
    AND ic.photographer_id = p_photographer_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'complete_gmail_import_materialize_new_thread: import_candidate not found';
  END IF;

  IF v_ic_connected IS DISTINCT FROM p_connected_account_id THEN
    RAISE EXCEPTION 'complete_gmail_import_materialize_new_thread: connected_account mismatch';
  END IF;

  IF v_ic_status NOT IN ('pending', 'approving') THEN
    RAISE EXCEPTION 'complete_gmail_import_materialize_new_thread: invalid candidate status %', v_ic_status;
  END IF;

  INSERT INTO public.threads (
    photographer_id,
    wedding_id,
    title,
    kind,
    channel,
    external_thread_key,
    last_activity_at,
    ai_routing_metadata
  )
  VALUES (
    p_photographer_id,
    p_thread_wedding_id,
    p_thread_title,
    'group',
    'email',
    p_external_thread_key,
    p_last_activity_at,
    p_ai_routing_metadata
  )
  RETURNING id INTO v_thread_id;

  INSERT INTO public.messages (
    thread_id,
    photographer_id,
    direction,
    sender,
    body,
    sent_at,
    metadata,
    raw_payload
  )
  VALUES (
    v_thread_id,
    p_photographer_id,
    'in',
    p_message_sender,
    p_message_body,
    p_message_sent_at,
    p_message_metadata,
    p_message_raw_payload
  )
  RETURNING id INTO v_message_id;

  IF p_render_artifact_id IS NOT NULL THEN
    UPDATE public.gmail_render_artifacts gra
    SET message_id = v_message_id
    WHERE gra.id = p_render_artifact_id
      AND gra.photographer_id = p_photographer_id;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    IF v_n <> 1 THEN
      RAISE EXCEPTION 'complete_gmail_import_materialize_new_thread: render artifact not found or not tenant-owned';
    END IF;

    UPDATE public.messages m
    SET gmail_render_artifact_id = p_render_artifact_id
    WHERE m.id = v_message_id AND m.photographer_id = p_photographer_id;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    IF v_n <> 1 THEN
      RAISE EXCEPTION 'complete_gmail_import_materialize_new_thread: message row missing after insert';
    END IF;
  END IF;

  UPDATE public.import_candidates ic
  SET
    status = 'approved',
    materialized_thread_id = v_thread_id,
    import_provenance = p_import_provenance,
    updated_at = now(),
    import_approval_error = CASE WHEN p_clear_import_approval_error THEN NULL ELSE ic.import_approval_error END,
    materialization_secondary_status = 'complete'
  WHERE ic.id = p_import_candidate_id
    AND ic.photographer_id = p_photographer_id
    AND ic.status IN ('pending', 'approving');
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'complete_gmail_import_materialize_new_thread: import_candidate update affected % rows', v_n;
  END IF;

  out_thread_id := v_thread_id;
  out_message_id := v_message_id;
  RETURN NEXT;
END;
$$;

COMMENT ON FUNCTION public.complete_gmail_import_materialize_new_thread IS
  'Service-role: atomically creates email thread + first message, links gmail_render_artifact when provided, approves import_candidate.';

-- ---------------------------------------------------------------------------
-- Existing thread: optional wedding filing + approve candidate (one transaction).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.finalize_gmail_import_link_existing_thread(
  p_photographer_id uuid,
  p_import_candidate_id uuid,
  p_thread_id uuid,
  p_thread_wedding_id uuid,
  p_import_provenance jsonb,
  p_clear_import_approval_error boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status text;
  v_tid uuid;
  v_n int;
BEGIN
  SELECT ic.status INTO v_status
  FROM public.import_candidates ic
  WHERE ic.id = p_import_candidate_id
    AND ic.photographer_id = p_photographer_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'finalize_gmail_import_link_existing_thread: import_candidate not found';
  END IF;

  IF v_status NOT IN ('pending', 'approving') THEN
    RAISE EXCEPTION 'finalize_gmail_import_link_existing_thread: invalid candidate status %', v_status;
  END IF;

  SELECT t.id INTO v_tid
  FROM public.threads t
  WHERE t.id = p_thread_id
    AND t.photographer_id = p_photographer_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'finalize_gmail_import_link_existing_thread: thread not found or tenant mismatch';
  END IF;

  IF p_thread_wedding_id IS NOT NULL THEN
    UPDATE public.threads t
    SET wedding_id = p_thread_wedding_id
    WHERE t.id = p_thread_id
      AND t.photographer_id = p_photographer_id;
  END IF;

  UPDATE public.import_candidates ic
  SET
    status = 'approved',
    materialized_thread_id = p_thread_id,
    import_provenance = p_import_provenance,
    updated_at = now(),
    import_approval_error = CASE WHEN p_clear_import_approval_error THEN NULL ELSE ic.import_approval_error END,
    materialization_secondary_status = 'complete'
  WHERE ic.id = p_import_candidate_id
    AND ic.photographer_id = p_photographer_id
    AND ic.status IN ('pending', 'approving');
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'finalize_gmail_import_link_existing_thread: import_candidate update affected % rows', v_n;
  END IF;
END;
$$;

COMMENT ON FUNCTION public.finalize_gmail_import_link_existing_thread IS
  'Service-role: files import_candidate to an existing thread; optionally sets threads.wedding_id for grouped imports.';

REVOKE ALL ON FUNCTION public.complete_gmail_import_materialize_new_thread(
  uuid, uuid, uuid, text, text, uuid, timestamptz, jsonb, text, text, timestamptz, jsonb, jsonb, jsonb, uuid, boolean
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.complete_gmail_import_materialize_new_thread(
  uuid, uuid, uuid, text, text, uuid, timestamptz, jsonb, text, text, timestamptz, jsonb, jsonb, jsonb, uuid, boolean
) TO service_role;

REVOKE ALL ON FUNCTION public.finalize_gmail_import_link_existing_thread(
  uuid, uuid, uuid, uuid, jsonb, boolean
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.finalize_gmail_import_link_existing_thread(
  uuid, uuid, uuid, uuid, jsonb, boolean
) TO service_role;
