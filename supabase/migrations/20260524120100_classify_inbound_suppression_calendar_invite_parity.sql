-- =============================================================================
-- Parity: calendar / video meeting invites (SQL ↔ TS inboundSuppressionClassifier)
-- =============================================================================
-- Adds deterministic signals aligned with src/lib/inboundSuppressionClassifier.ts:
--   - body_vcalendar_invite (BEGIN:VCALENDAR in body, lowercased)
--   - body_structured_video_meeting_invite (Zoom/Teams/Meet URL + calendar boilerplate)
--   - subject_calendar_video_invite (Invitation:/Accepted:… subject + video URL in body)
--
-- Same 3-arg contract as convert_unfiled_thread_to_inquiry / import RPCs (no RFC headers).
-- Order matches TS: calendar body signals before other body heuristics; subject+URL before
-- weak subject promo.
--
-- Timestamp 20260524120100: avoids duplicate version with 20260524120000_v_thread_first_inbound_at.sql.
-- =============================================================================

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
  v_transactional_score int := 0;
  v_reasons text[] := ARRAY[]::text[];
  v_subject_lower text := COALESCE(lower(p_subject), '');
  v_body_lower text := COALESCE(lower(p_body), '');
  v_verdict text := 'human_client_or_lead';
  v_confidence text := 'low';
  v_local_check record;
  v_has_system_local boolean := FALSE;
  v_subject_coalesce text := COALESCE(p_subject, '');
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
    v_has_system_local := COALESCE(v_local_check.has_system, FALSE);
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

    IF v_domain IS NOT NULL AND split_part(v_domain, '.', 1) IN (
      'mail','email','e','news','newsletter','campaign','campaigns',
      'marketing','promo','promos','offers','deals','send','notify',
      'notifications','updates','mailer','mailers','sg','em','t'
    ) AND array_length(regexp_split_to_array(v_domain, '\.'), 1) >= 3 THEN
      v_marketing_score := v_marketing_score + 1;
      v_reasons := array_append(v_reasons, 'sender_domain_marketing_subdomain');
    END IF;
  END IF;

  -- body: ICS + structured video meeting (TS §3 — before unsubscribe/OTA body heuristics)
  IF length(v_body_lower) > 0 THEN
    IF position('begin:vcalendar' in v_body_lower) > 0 THEN
      v_system_score := v_system_score + 3;
      IF NOT ('body_vcalendar_invite' = ANY(v_reasons)) THEN
        v_reasons := array_append(v_reasons, 'body_vcalendar_invite');
      END IF;
    ELSIF v_body_lower ~ '(zoom\.us/|zoom\.com/|teams\.microsoft\.com/|meet\.google\.com/)'
      AND v_body_lower ~ '(join zoom meeting|join our cloud hd video meeting|meeting id:|meeting id |passcode:|webinar id:|topic:|time:|microsoft teams meeting|join the meeting now|click here to join the meeting)'
    THEN
      v_system_score := v_system_score + 3;
      IF NOT ('body_structured_video_meeting_invite' = ANY(v_reasons)) THEN
        v_reasons := array_append(v_reasons, 'body_structured_video_meeting_invite');
      END IF;
    END IF;
  END IF;

  -- body copy markers (marketing / system)
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

  -- subject: calendar invitation prefix + video URL in body (TS — before weak subject promo)
  IF length(trim(v_subject_coalesce)) > 0 AND length(v_body_lower) > 0 THEN
    IF (
      v_subject_coalesce ~* '^\s*(invitation|updated invitation|cancelled invitation|canceled invitation)\s*:'
      OR v_subject_coalesce ~* '^\s*(accepted|declined|tentative)\s*:\s'
    ) AND v_body_lower ~ '(zoom\.us/|zoom\.com/|teams\.microsoft\.com/|meet\.google\.com/)'
    THEN
      v_system_score := v_system_score + 3;
      IF NOT ('subject_calendar_video_invite' = ANY(v_reasons)) THEN
        v_reasons := array_append(v_reasons, 'subject_calendar_video_invite');
      END IF;
    END IF;
  END IF;

  -- subject: weak promo (aligned with TS SUBJECT_PROMO_TOKENS + % off)
  IF v_subject_lower ~ '(%\s*off|sale|flash sale|deals|newsletter|unsubscribe|promo|promotion|limited time|special offer|exclusive offer|you''re invited|you are invited|webinar|black friday|cyber monday)'
     OR v_subject_lower ~ '\d+\s*%\s*off'
  THEN
    v_marketing_score := v_marketing_score + 1;
    v_reasons := array_append(v_reasons, 'subject_promo_markers');
  END IF;

  -- subject: strong transactional (+3) or invoice + system sender (+2) — mirror TS
  IF v_subject_coalesce ~* '^\s*receipt\b'
     OR v_subject_coalesce ~* '^\s*your\s+receipt\b'
     OR v_subject_coalesce ~* '^\s*payment\s+receipt\b'
     OR v_subject_coalesce ~* '^\s*payment\s+received\b'
     OR v_subject_coalesce ~* '^\s*payment\s+confirmation\b'
     OR v_subject_coalesce ~* '^\s*order\s+confirmation\b'
     OR v_subject_coalesce ~* '^\s*order\s+confirmed\b'
     OR v_subject_coalesce ~* '^\s*your\s+order\s+(has\s+been\s+)?confirm'
     OR v_subject_coalesce ~* '^\s*billing\s+statement\b'
     OR v_subject_coalesce ~* '^\s*tax\s+invoice\b'
     OR v_subject_coalesce ~* '^\s*invoice\s+payment\s+received\b'
     OR v_subject_coalesce ~* 'automatic\s+payment\b'
     OR v_subject_coalesce ~* 'subscription\s+renewal\b'
  THEN
    v_transactional_score := v_transactional_score + 3;
    IF NOT ('subject_transactional_receipt' = ANY(v_reasons)) THEN
      v_reasons := array_append(v_reasons, 'subject_transactional_receipt');
    END IF;
  ELSIF v_subject_lower ~ '[[:<:]]invoice[[:>:]]' AND (v_system_score > 0 OR v_has_system_local) THEN
    v_transactional_score := v_transactional_score + 2;
    IF NOT ('subject_transactional_receipt' = ANY(v_reasons)) THEN
      v_reasons := array_append(v_reasons, 'subject_transactional_receipt');
    END IF;
  END IF;

  -- body: merchant receipt / billing (+2)
  IF v_body_lower ~ '(thank you for your order|thank you for your purchase|items in your order|this email confirms your purchase|your payment has been processed|amount charged to your|card ending in|transaction id:|transaction reference:|view your order|order summary|sales tax|subtotal:|total due:|amount paid:|invoice number:|invoice #|paid in full|payment successful)'
  THEN
    v_transactional_score := v_transactional_score + 2;
    IF NOT ('body_transactional_receipt' = ANY(v_reasons)) THEN
      v_reasons := array_append(v_reasons, 'body_transactional_receipt');
    END IF;
  END IF;

  -- thresholds match TS (MARKETING_THRESHOLD = 3, SYSTEM_THRESHOLD = 3)
  IF v_marketing_score >= 3 AND v_marketing_score >= v_system_score THEN
    v_verdict := 'promotional_or_marketing';
    v_confidence := CASE WHEN v_marketing_score >= 5 THEN 'high' ELSE 'medium' END;
  ELSIF v_system_score >= 3 THEN
    v_verdict := 'system_or_notification';
    v_confidence := CASE WHEN v_system_score >= 5 THEN 'high' ELSE 'medium' END;
  ELSIF v_transactional_score >= 2 THEN
    v_verdict := 'transactional_non_client';
    v_confidence := CASE WHEN v_transactional_score >= 4 THEN 'high' ELSE 'medium' END;
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
  'Deterministic inbound suppression — mirrors src/lib/inboundSuppressionClassifier.ts for sender/subject/body (no RFC headers). Includes transactional_non_client, calendar/video meeting invites (body_vcalendar_invite, body_structured_video_meeting_invite, subject_calendar_video_invite). Used by convert_unfiled_thread_to_inquiry.';
