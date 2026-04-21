-- Chunk 4: Manual inbox link must not wipe ai_routing_metadata (suppression,
-- grouped import, attachment-eligibility skips, etc.). Merge audit fields instead.

CREATE OR REPLACE FUNCTION public.link_thread_to_wedding(p_thread_id uuid, p_wedding_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_wedding_photographer uuid;
  v_updated int;
BEGIN
  SELECT w.photographer_id INTO v_wedding_photographer
  FROM public.weddings w
  WHERE w.id = p_wedding_id;

  IF v_wedding_photographer IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'wedding_not_found');
  END IF;

  IF v_wedding_photographer <> (SELECT auth.uid()) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  UPDATE public.threads t
  SET
    wedding_id = p_wedding_id,
    ai_routing_metadata =
      COALESCE(t.ai_routing_metadata, '{}'::jsonb)
      || jsonb_build_object(
           'manual_link',
           CASE
             WHEN COALESCE(t.ai_routing_metadata, '{}'::jsonb) ? 'manual_link' THEN
               jsonb_build_object(
                 'prior', COALESCE(t.ai_routing_metadata->'manual_link', 'null'::jsonb),
                 'linked_at', to_jsonb(now()),
                 'linked_by', to_jsonb(auth.uid()),
                 'previous_wedding_id', to_jsonb(t.wedding_id)
               )
             ELSE
               jsonb_build_object(
                 'linked_at', to_jsonb(now()),
                 'linked_by', to_jsonb(auth.uid()),
                 'previous_wedding_id', to_jsonb(t.wedding_id)
               )
           END
         ),
    photographer_id = v_wedding_photographer
  WHERE t.id = p_thread_id
    AND t.photographer_id = (SELECT auth.uid());

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated = 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'thread_not_found_or_denied');
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$$;

COMMENT ON FUNCTION public.link_thread_to_wedding(uuid, uuid) IS
  'A6/Chunk4: Assign inbox thread to wedding; merges manual_link into ai_routing_metadata (preserves suppression/import provenance); caller must own thread and wedding.';
