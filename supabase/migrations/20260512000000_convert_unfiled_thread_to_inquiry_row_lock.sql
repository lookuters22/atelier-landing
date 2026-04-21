-- Harden convert_unfiled_thread_to_inquiry: read wedding_id + ai_routing_metadata under
-- the same row lock used by link_thread_to_wedding, before INSERT wedding, so concurrent
-- metadata writers cannot interleave and lose audit history.

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
  v_locked_wedding_id uuid;
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

  -- Lock thread before reading routing metadata and creating the wedding (parity with
  -- link_thread_to_wedding). Re-check wedding_id so a concurrent linker loses cleanly.
  SELECT t.wedding_id, COALESCE(t.ai_routing_metadata, '{}'::jsonb)
  INTO v_locked_wedding_id, v_old_meta
  FROM public.threads t
  WHERE t.id = p_thread_id
    AND t.photographer_id = (SELECT auth.uid())
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'thread_update_failed');
  END IF;

  IF v_locked_wedding_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'ok', true,
      'already_linked', true,
      'wedding_id', v_locked_wedding_id
    );
  END IF;

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

  v_conv_hist := COALESCE(v_old_meta->'converted_to_inquiry_history', '[]'::jsonb);
  IF jsonb_typeof(v_conv_hist) <> 'array' THEN
    v_conv_hist := '[]'::jsonb;
  END IF;

  v_conv_event := jsonb_build_object(
    'kind', 'convert_unfiled_thread_to_inquiry',
    'converted_at', to_jsonb(now()),
    'converted_by', to_jsonb(auth.uid()),
    'previous_wedding_id', to_jsonb(v_locked_wedding_id),
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
  'Operator: create inquiry wedding + lead client from thread. Rejects suppressed senders. Preserves ai_routing_metadata; appends converted_to_inquiry_history under FOR UPDATE (race-safe with link_thread_to_wedding).';
