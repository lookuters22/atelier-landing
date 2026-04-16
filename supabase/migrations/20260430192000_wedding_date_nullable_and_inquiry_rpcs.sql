-- 1) Stop fabricating inquiry wedding dates: allow NULL = "date not fixed yet".
-- 2) convert_unfiled_thread_to_inquiry: INSERT NULL instead of now() for wedding_date.

ALTER TABLE public.weddings
  ALTER COLUMN wedding_date DROP NOT NULL;

COMMENT ON COLUMN public.weddings.wedding_date IS
  'Ceremony / canonical project date when known; NULL when not yet fixed (never use inquiry received date as a substitute).';

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
  v_couple text;
  v_lead text;
  v_email text;
  v_m text[];
  v_wedding_id uuid;
  v_updated int;
  v_title text;
  v_inquiry_tail text;
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
    v_couple,
    NULL,
    'TBD',
    'inquiry',
    left(trim(coalesce(v_body, '')), 8000)
  )
  RETURNING id INTO v_wedding_id;

  INSERT INTO public.clients (wedding_id, name, role, email)
  VALUES (v_wedding_id, v_lead, 'Lead', v_email);

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
