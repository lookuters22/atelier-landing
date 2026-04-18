-- =============================================================================
-- Inbound suppression classifier + convert-to-inquiry guard
-- =============================================================================
-- Mirrors the deterministic TypeScript classifier at
--   src/lib/inboundSuppressionClassifier.ts
-- Keeping parity:
--   - sender local-part marketing / system tokens
--   - OTA / marketplace sender domains (subdomain-safe)
--   - body copy markers (unsubscribe / do-not-reply / OTA promo / newsletter)
--
-- This is the **DB-side last line of defense** for
-- `public.convert_unfiled_thread_to_inquiry` so that a direct RPC caller
-- cannot create a wedding inquiry from a Booking.com-style promo thread even
-- if the UI prevalidator is bypassed.
--
-- The helpers are intentionally conservative: they only fire on strong
-- converging signals (local-part + domain, or local-part + body copy).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Helper: extract the first email address out of a raw "From:" / sender string.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.extract_sender_email_from_raw(p_raw text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_m text[];
BEGIN
  IF p_raw IS NULL OR length(trim(p_raw)) = 0 THEN
    RETURN NULL;
  END IF;

  v_m := regexp_match(p_raw, '<([^>]+@[^>]+)>');
  IF v_m IS NOT NULL THEN
    RETURN lower(trim(v_m[1]));
  END IF;

  v_m := regexp_match(p_raw, '([\w.+\-]+@[\w.\-]+\.[a-zA-Z]{2,})');
  IF v_m IS NOT NULL THEN
    RETURN lower(trim(v_m[1]));
  END IF;

  RETURN NULL;
END;
$$;

COMMENT ON FUNCTION public.extract_sender_email_from_raw(text) IS
  'Parse first addr@domain out of a raw sender string (angle-bracketed or bare). Keep in sync with src/lib/inboundSuppressionClassifier.ts.';

-- -----------------------------------------------------------------------------
-- Helper: does a sender domain (lower-case) match a known OTA / marketplace
-- suffix (including subdomains)?
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.domain_is_ota_or_marketplace(p_domain text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_domain IS NULL OR length(trim(p_domain)) = 0 THEN FALSE
    ELSE EXISTS (
      SELECT 1
      FROM (
        VALUES
          ('booking.com'),
          ('airbnb.com'),
          ('expedia.com'),
          ('tripadvisor.com'),
          ('trivago.com'),
          ('agoda.com'),
          ('hotels.com'),
          ('kayak.com'),
          ('skyscanner.com'),
          ('opentable.com')
      ) AS s(suffix)
      WHERE lower(trim(p_domain)) = s.suffix
         OR lower(trim(p_domain)) LIKE '%.' || s.suffix
    )
  END;
$$;

COMMENT ON FUNCTION public.domain_is_ota_or_marketplace(text) IS
  'True when domain (or any subdomain of) a known OTA / travel marketplace. Mirrors inboundSuppressionClassifier.ts OTA suffix list.';

-- -----------------------------------------------------------------------------
-- Helper: does a local-part contain a bulk/marketing/system token?
-- Splits on `.`, `-`, `_`, `+`. Matches whole-token only — so
-- `alice.smith` is NOT flagged, but `email.campaign` is.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.local_part_has_marketing_or_system_token(p_local text)
RETURNS TABLE(has_marketing boolean, has_system boolean)
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_base text;
  v_tokens text[];
  v_marketing boolean := FALSE;
  v_system boolean := FALSE;
BEGIN
  IF p_local IS NULL OR length(p_local) = 0 THEN
    RETURN QUERY SELECT FALSE, TRUE;
    RETURN;
  END IF;

  v_base := lower(split_part(p_local, '+', 1));

  IF v_base IN (
    'noreply','no-reply','donotreply','do-not-reply',
    'mailer-daemon','postmaster','bounce','bounces',
    'notifications','notification','notify','alerts','alert',
    'automated','system'
  ) THEN
    v_system := TRUE;
  END IF;

  IF v_base IN (
    'campaign','campaigns','newsletter','newsletters',
    'marketing','promo','promos','promotion','promotions',
    'offers','deals','mailers','mailer','digest','updates',
    'announce','announcements'
  ) THEN
    v_marketing := TRUE;
  END IF;

  IF v_base LIKE 'noreply%' OR v_base LIKE 'no-reply%' THEN v_system := TRUE; END IF;
  IF position('donotreply' in v_base) > 0 THEN v_system := TRUE; END IF;

  v_tokens := regexp_split_to_array(v_base, '[.+_\-]');
  IF v_tokens && ARRAY[
    'campaign','campaigns','newsletter','newsletters','marketing',
    'promo','promos','promotion','promotions','offers','deals',
    'mailers','mailer','digest','updates','notifications',
    'notification','alerts','alert'
  ] THEN
    v_marketing := TRUE;
  END IF;

  IF v_tokens && ARRAY[
    'noreply','no-reply','donotreply','do-not-reply'
  ] THEN
    v_system := TRUE;
  END IF;

  RETURN QUERY SELECT v_marketing, v_system;
END;
$$;

COMMENT ON FUNCTION public.local_part_has_marketing_or_system_token(text) IS
  'Token-level check on an email local-part for marketing / system bulk patterns. Parity with src/lib/mailboxNormalize.ts.';

-- -----------------------------------------------------------------------------
-- Helper: classify an inbound (sender_raw, body, subject) tuple. Returns a jsonb
-- object with { verdict, suppressed, reasons, confidence,
--               normalized_sender_email, normalized_sender_domain }.
-- Mirrors classifyInboundSuppression() in TypeScript.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.classify_inbound_suppression(
  p_sender_raw text,
  p_subject text,
  p_body text
)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_email text;
  v_local text;
  v_domain text;
  v_marketing_score int := 0;
  v_system_score int := 0;
  v_reasons text[] := ARRAY[]::text[];
  v_subject_lower text := COALESCE(lower(p_subject), '');
  v_body_lower text := COALESCE(lower(p_body), '');
  v_verdict text := 'human_client_or_lead';
  v_confidence text := 'low';
  v_local_check record;
BEGIN
  IF (p_sender_raw IS NULL OR length(trim(p_sender_raw)) = 0)
     AND length(v_subject_lower) = 0
     AND length(v_body_lower) = 0 THEN
    RETURN jsonb_build_object(
      'verdict', 'unknown_review_needed',
      'suppressed', TRUE,
      'reasons', jsonb_build_array('empty_or_unparseable'),
      'confidence', 'low',
      'normalized_sender_email', NULL,
      'normalized_sender_domain', NULL
    );
  END IF;

  v_email := public.extract_sender_email_from_raw(p_sender_raw);
  IF v_email IS NOT NULL THEN
    v_local := split_part(v_email, '@', 1);
    v_domain := split_part(v_email, '@', 2);

    SELECT * INTO v_local_check FROM public.local_part_has_marketing_or_system_token(v_local);
    IF v_local_check.has_marketing THEN
      v_marketing_score := v_marketing_score + 2;
      v_reasons := array_append(v_reasons, 'sender_local_marketing_token');
    END IF;
    IF v_local_check.has_system THEN
      v_system_score := v_system_score + 2;
      v_reasons := array_append(v_reasons, 'sender_local_system_token');
    END IF;

    IF public.domain_is_ota_or_marketplace(v_domain) THEN
      v_marketing_score := v_marketing_score + 3;
      v_reasons := array_append(v_reasons, 'sender_domain_ota_or_marketplace');
    END IF;

    -- marketing-subdomain prefix (email.*.com, mail.*.com, news.*.com ...)
    IF v_domain IS NOT NULL AND split_part(v_domain, '.', 1) IN (
      'mail','email','e','news','newsletter','campaign','campaigns',
      'marketing','promo','promos','offers','deals','send','notify',
      'notifications','updates','mailer','mailers','sg','em','t'
    ) AND array_length(regexp_split_to_array(v_domain, '\.'), 1) >= 3 THEN
      v_marketing_score := v_marketing_score + 1;
      v_reasons := array_append(v_reasons, 'sender_domain_marketing_subdomain');
    END IF;
  END IF;

  -- body copy markers
  IF v_body_lower ~ '(unsubscribe|opt[-\s]?out|manage your preferences|manage preferences|email preferences|update your preferences|view this email in your browser|view in browser)'
  THEN
    v_marketing_score := v_marketing_score + 2;
    v_reasons := array_append(v_reasons, 'body_unsubscribe_language');
  END IF;

  IF v_body_lower ~ '(do not reply to this email|do not reply to this message|please do not reply|this is an automated|these emails are sent automatically|this mailbox is not monitored|replies to this email are not)'
  THEN
    v_system_score := v_system_score + 2;
    v_reasons := array_append(v_reasons, 'body_do_not_reply_language');
  END IF;

  IF v_body_lower ~ '(recommendations for your search|best prices for your dates|save on your next stay|book now and save|limited time offer|flash sale|your search results|deals on your next trip|genius members save)'
  THEN
    v_marketing_score := v_marketing_score + 2;
    v_reasons := array_append(v_reasons, 'body_ota_promo_copy');
  END IF;

  IF v_body_lower ~ '(this week''s highlights|our weekly digest|monthly newsletter|in this issue|top stories|featured this week)'
  THEN
    v_marketing_score := v_marketing_score + 1;
    v_reasons := array_append(v_reasons, 'body_newsletter_markers');
  END IF;

  IF v_body_lower ~ '(this\s+is\s+an?\s+automated\s+(message|notification|email)|automatically\s+generated\s+(email|message))'
  THEN
    v_system_score := v_system_score + 2;
    IF NOT ('body_do_not_reply_language' = ANY(v_reasons)) THEN
      v_reasons := array_append(v_reasons, 'body_automated_disclaimer');
    END IF;
  END IF;

  -- subject (weak)
  IF v_subject_lower ~ '(%\s*off|sale|flash sale|deals|newsletter|unsubscribe|promo|promotion|limited time)'
  THEN
    v_marketing_score := v_marketing_score + 1;
    v_reasons := array_append(v_reasons, 'subject_promo_markers');
  END IF;

  -- thresholds match TS classifier (MARKETING_THRESHOLD = 3, SYSTEM_THRESHOLD = 3)
  IF v_marketing_score >= 3 AND v_marketing_score >= v_system_score THEN
    v_verdict := 'promotional_or_marketing';
    v_confidence := CASE WHEN v_marketing_score >= 5 THEN 'high' ELSE 'medium' END;
  ELSIF v_system_score >= 3 THEN
    v_verdict := 'system_or_notification';
    v_confidence := CASE WHEN v_system_score >= 5 THEN 'high' ELSE 'medium' END;
  ELSIF v_marketing_score > 0 OR v_system_score > 0 THEN
    v_verdict := 'human_client_or_lead';
    v_confidence := 'low';
  END IF;

  RETURN jsonb_build_object(
    'verdict', v_verdict,
    'suppressed', v_verdict <> 'human_client_or_lead',
    'reasons', to_jsonb(v_reasons),
    'confidence', v_confidence,
    'normalized_sender_email', v_email,
    'normalized_sender_domain', v_domain
  );
END;
$$;

COMMENT ON FUNCTION public.classify_inbound_suppression(text, text, text) IS
  'Deterministic inbound suppression classifier — mirrors src/lib/inboundSuppressionClassifier.ts. Used by convert_unfiled_thread_to_inquiry + Gmail import RPCs.';

-- -----------------------------------------------------------------------------
-- Replace convert_unfiled_thread_to_inquiry to hard-reject suppressed threads.
-- Signature unchanged — keeps PostgREST calls stable from the UI/client.
-- -----------------------------------------------------------------------------
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

  -- Guard: if the latest inbound message classifies as promo/system/non-client,
  -- do NOT create a wedding inquiry — return a structured machine-readable failure.
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

COMMENT ON FUNCTION public.convert_unfiled_thread_to_inquiry(uuid, text, text) IS
  'Operator: create inquiry wedding + lead client from thread. Rejects suppressed (promo/system/non-client) senders via classify_inbound_suppression(). Returns structured failure with verdict+reasons when blocked.';

GRANT EXECUTE ON FUNCTION public.extract_sender_email_from_raw(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.domain_is_ota_or_marketplace(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.local_part_has_marketing_or_system_token(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.classify_inbound_suppression(text, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.convert_unfiled_thread_to_inquiry(uuid, text, text) TO authenticated, service_role;
