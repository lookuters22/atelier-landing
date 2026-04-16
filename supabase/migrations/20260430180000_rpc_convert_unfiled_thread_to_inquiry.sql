-- Manual "Convert to New Inquiry" — same semantics as bootstrap from canonical thread (no duplicate thread/message rows).

CREATE OR REPLACE FUNCTION public.convert_unfiled_thread_to_inquiry(p_thread_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_thread record;
  v_body text;
  v_sender text;
  v_couple text;
  v_email text;
  v_m text[];
  v_wedding_id uuid;
  v_updated int;
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

  v_couple := NULLIF(trim(coalesce(v_thread.title, '')), '');
  IF v_couple IS NULL OR v_couple = '' THEN
    v_couple := left(trim(coalesce(v_body, '')), 80);
  END IF;
  IF v_couple IS NULL OR v_couple = '' THEN
    v_couple := 'New inquiry';
  END IF;

  v_m := regexp_match(coalesce(v_sender, ''), '<([^>]+@[^>]+)>');
  IF v_m IS NOT NULL THEN
    v_email := lower(trim(v_m[1]));
  ELSE
    v_m := regexp_match(coalesce(v_sender, ''), '([\w.+-]+@[\w.-]+\.[a-zA-Z]{2,})');
    IF v_m IS NOT NULL THEN
      v_email := lower(trim(v_m[1]));
    ELSE
      v_email := NULL;
    END IF;
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
    left(v_couple, 500),
    now(),
    'TBD',
    'inquiry',
    left(trim(coalesce(v_body, '')), 8000)
  )
  RETURNING id INTO v_wedding_id;

  INSERT INTO public.clients (wedding_id, name, role, email)
  VALUES (v_wedding_id, left(v_couple, 500), 'Lead', v_email);

  UPDATE public.threads t
  SET
    wedding_id = v_wedding_id,
    ai_routing_metadata = NULL
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

COMMENT ON FUNCTION public.convert_unfiled_thread_to_inquiry(uuid) IS
  'Operator: create inquiry wedding + lead client from latest inbound message; link canonical inbox thread (no duplicate messages).';

GRANT EXECUTE ON FUNCTION public.convert_unfiled_thread_to_inquiry(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.convert_unfiled_thread_to_inquiry(uuid) TO service_role;
