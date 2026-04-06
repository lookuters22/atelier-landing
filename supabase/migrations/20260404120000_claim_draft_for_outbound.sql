-- Atomic draft approval: only transitions pending_approval -> approved when the thread
-- belongs to the photographer. Prevents double-send (second call updates 0 rows).
-- Service-role Edge Functions call this; tenant is enforced inside the function body.

CREATE OR REPLACE FUNCTION public.claim_draft_for_outbound(
  p_draft_id uuid,
  p_photographer_id uuid,
  p_edited_body text DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  thread_id uuid,
  body text,
  status draft_status
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  UPDATE drafts d
  SET
    status = 'approved'::draft_status,
    body = CASE
      WHEN p_edited_body IS NOT NULL THEN p_edited_body
      ELSE d.body
    END
  FROM threads t
  WHERE d.thread_id = t.id
    AND d.id = p_draft_id
    AND d.status = 'pending_approval'::draft_status
    AND t.photographer_id = p_photographer_id
  RETURNING d.id, d.thread_id, d.body, d.status;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_draft_for_outbound(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_draft_for_outbound(uuid, uuid, text) TO service_role;
