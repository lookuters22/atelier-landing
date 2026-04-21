-- Append-only audit for manual link + convert-to-inquiry: preserve all existing
-- ai_routing_metadata keys; never NULL the column. Supersedes shallow manual_link merge.

CREATE OR REPLACE FUNCTION public.link_thread_to_wedding(p_thread_id uuid, p_wedding_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_wedding_photographer uuid;
  v_updated int;
  v_prev_wedding uuid;
  v_old_meta jsonb;
  v_hist jsonb;
  v_event jsonb;
  v_new_meta jsonb;
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

  SELECT t.wedding_id, COALESCE(t.ai_routing_metadata, '{}'::jsonb)
  INTO v_prev_wedding, v_old_meta
  FROM public.threads t
  WHERE t.id = p_thread_id
    AND t.photographer_id = (SELECT auth.uid())
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'thread_not_found_or_denied');
  END IF;

  v_hist := COALESCE(v_old_meta->'manual_link_history', '[]'::jsonb);
  IF jsonb_typeof(v_hist) <> 'array' THEN
    v_hist := '[]'::jsonb;
  END IF;

  -- One-time backfill: legacy single-object manual_link (Chunk 4) becomes first history row.
  IF jsonb_array_length(v_hist) = 0
     AND (v_old_meta ? 'manual_link')
     AND jsonb_typeof(v_old_meta->'manual_link') = 'object' THEN
    v_hist := jsonb_build_array(v_old_meta->'manual_link');
  END IF;

  v_event := jsonb_build_object(
    'kind', 'link_thread_to_wedding',
    'linked_at', to_jsonb(now()),
    'linked_by', to_jsonb(auth.uid()),
    'previous_wedding_id', to_jsonb(v_prev_wedding),
    'wedding_id', to_jsonb(p_wedding_id)
  );

  v_hist := v_hist || jsonb_build_array(v_event);

  v_new_meta := v_old_meta || jsonb_build_object(
    'manual_link_history', v_hist,
    'manual_link', v_event
  );

  UPDATE public.threads t
  SET
    wedding_id = p_wedding_id,
    ai_routing_metadata = v_new_meta,
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
  'A6: Assign inbox thread to wedding; appends manual_link_history + updates manual_link snapshot; preserves existing routing metadata.';

CREATE OR REPLACE FUNCTION public.convert_unfiled_thread_to_inquiry(
  p_thread_id uuid,
  p_couple_names text DEFAULT NULL,
  p_lead_client_name text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_thread record;
  v_body text;
  v_sender text;
  v_subject text;
  v_couple text;
  v_lead text;
  v_email text;
  v_m text[];
  v_wedding_id uuid;
  v_updated int;
  v_title text;
  v_inquiry_tail text;
  v_classification jsonb;
  v_old_meta jsonb;
  v_conv_hist jsonb;
  v_conv_event jsonb;
  v_new_meta jsonb;
BEGIN
  SELECT t.id, t.wedding_id, t.photographer_id, t.title
  INTO v_thread
  FROM public.threads t
  WHERE t.id = p_thread_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'thread_not_found');
  END IF;

  IF v_thread.photographer_id <> (SELECT auth.uid()) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  IF v_thread.wedding_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'ok', true,
      'already_linked', true,
      'wedding_id', v_thread.wedding_id
    );
  END IF;

  SELECT m.body, m.sender INTO v_body, v_sender
  FROM public.messages m
  WHERE m.thread_id = p_thread_id
    AND m.direction = 'in'::public.message_direction
  ORDER BY m.sent_at DESC NULLS LAST
  LIMIT 1;

  v_subject := v_thread.title;

  v_classification := public.classify_inbound_suppression(v_sender, v_subject, v_body);
  IF COALESCE((v_classification->>'suppressed')::boolean, FALSE) THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'suppressed_non_client_thread',
      'verdict', v_classification->>'verdict',
      'reasons', v_classification->'reasons',
      'confidence', v_classification->>'confidence'
    );
  END IF;

  v_couple := NULLIF(trim(COALESCE(p_couple_names, '')), '');
  v_lead := NULLIF(trim(COALESCE(p_lead_client_name, '')), '');

  IF v_couple IS NULL THEN
    v_title := trim(COALESCE(v_thread.title, ''));
    v_title := regexp_replace(v_title, '^(re|fw|fwd):\s*', '', 'i');
    v_inquiry_tail := regexp_replace(v_title, '^photography\s+inquiry:\s*', '', 'i');
    IF v_inquiry_tail IS DISTINCT FROM v_title THEN
      v_title := v_inquiry_tail;
    END IF;

    v_couple := split_part(v_title, E'—', 1);
    IF v_couple = v_title THEN
      v_couple := split_part(v_title, E'–', 1);
    END IF;
    IF v_couple = v_title THEN
      v_couple := split_part(v_title, ' - ', 1);
    END IF;
    v_couple := trim(v_couple);

    IF v_couple IS NULL OR v_couple = ''
       OR lower(v_couple) ~ '(^|and\s+)(fiance|fiancé|fiancée|partner|spouse|unknown)\s*\.?\s*$'
       OR lower(v_couple) ~ '\bpartner\s*$' THEN
      v_couple := left(trim(COALESCE(v_body, '')), 120);
    END IF;

    IF v_couple IS NULL OR v_couple = ''
       OR lower(v_couple) ~ '(^|and\s+)(fiance|fiancé|fiancée|partner|spouse|unknown)\s*\.?\s*$' THEN
      v_couple := 'New inquiry';
    END IF;
  END IF;

  v_couple := left(v_couple, 500);

  IF v_lead IS NULL OR v_lead = '' THEN
    v_m := regexp_match(COALESCE(v_sender, ''), '^([^<]+)<');
    IF v_m IS NOT NULL THEN
      v_lead := trim(both '"' from trim(v_m[1]));
      IF v_lead = '' THEN
        v_lead := NULL;
      END IF;
    END IF;
  END IF;

  IF v_lead IS NULL OR v_lead = '' THEN
    v_lead := split_part(v_couple, ' & ', 1);
    IF v_lead = '' THEN
      v_lead := split_part(v_couple, ' and ', 1);
    END IF;
  END IF;

  IF v_lead IS NULL OR v_lead = '' THEN
    v_lead := v_couple;
  END IF;

  v_lead := left(v_lead, 500);

  v_email := v_classification->>'normalized_sender_email';

  INSERT INTO public.weddings (
    photographer_id,
    couple_names,
    wedding_date,
    location,
    stage,
    story_notes
  )
  VALUES (
    v_thread.photographer_id,
    v_couple,
    now(),
    'TBD',
    'inquiry',
    left(trim(coalesce(v_body, '')), 8000)
  )
  RETURNING id INTO v_wedding_id;

  INSERT INTO public.clients (wedding_id, name, role, email)
  VALUES (v_wedding_id, v_lead, 'Lead', v_email);

  SELECT COALESCE(t.ai_routing_metadata, '{}'::jsonb)
  INTO v_old_meta
  FROM public.threads t
  WHERE t.id = p_thread_id
    AND t.photographer_id = (SELECT auth.uid());

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'thread_update_failed');
  END IF;

  v_conv_hist := COALESCE(v_old_meta->'converted_to_inquiry_history', '[]'::jsonb);
  IF jsonb_typeof(v_conv_hist) <> 'array' THEN
    v_conv_hist := '[]'::jsonb;
  END IF;

  v_conv_event := jsonb_build_object(
    'kind', 'convert_unfiled_thread_to_inquiry',
    'converted_at', to_jsonb(now()),
    'converted_by', to_jsonb(auth.uid()),
    'previous_wedding_id', to_jsonb(v_thread.wedding_id),
    'wedding_id', to_jsonb(v_wedding_id)
  );

  v_conv_hist := v_conv_hist || jsonb_build_array(v_conv_event);

  v_new_meta := v_old_meta || jsonb_build_object(
    'converted_to_inquiry', v_conv_event,
    'converted_to_inquiry_history', v_conv_hist
  );

  UPDATE public.threads t
  SET
    wedding_id = v_wedding_id,
    ai_routing_metadata = v_new_meta
  WHERE t.id = p_thread_id
    AND t.photographer_id = (SELECT auth.uid());

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated = 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'thread_update_failed');
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'already_linked', false,
    'wedding_id', v_wedding_id
  );
END;
$$;

COMMENT ON FUNCTION public.convert_unfiled_thread_to_inquiry(uuid, text, text) IS
  'Operator: create inquiry wedding + lead client from thread. Rejects suppressed senders via classify_inbound_suppression(). Preserves ai_routing_metadata and appends converted_to_inquiry_history.';
