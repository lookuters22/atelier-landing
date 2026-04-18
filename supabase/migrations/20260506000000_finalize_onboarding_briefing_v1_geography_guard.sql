-- Harden `finalize_onboarding_briefing_v1` with server-side geography validation.
--
-- CREATE OR REPLACE so the signature, grants, and comment from 20260430 are
-- preserved exactly. New behavior:
--
--   - reject if `p_settings.base_location` is missing, jsonb-null, or
--     does not satisfy validate_studio_base_location_shape()
--   - reject if `p_studio_business_profile.extensions.service_areas` is
--     missing, empty, or does not satisfy validate_studio_service_areas_shape()
--
-- TS mirror for error-code strings:
--   src/lib/onboardingFinalizeGeographyContract.ts
--
-- Authorization, transaction boundary, playbook cohort, and KB replacement
-- logic are unchanged — this migration only adds up-front validation.

BEGIN;

CREATE OR REPLACE FUNCTION public.finalize_onboarding_briefing_v1(
  p_photographer_id uuid,
  p_settings jsonb,
  p_studio_business_profile jsonb,
  p_playbook_rules jsonb,
  p_knowledge_base_rows jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rowcount int;
  v_elem jsonb;
  v_base_location jsonb;
  v_extensions jsonb;
  v_service_areas jsonb;
BEGIN
  IF p_photographer_id IS DISTINCT FROM (SELECT auth.uid()) THEN
    RAISE EXCEPTION 'finalize_onboarding_briefing_v1: not authorized for this photographer';
  END IF;

  IF p_settings IS NULL OR jsonb_typeof(p_settings) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'finalize_onboarding_briefing_v1: p_settings must be a JSON object';
  END IF;

  -- ── GEOGRAPHY CONTRACT ENFORCEMENT ─────────────────────────────────────
  -- See src/lib/studioGeographyContract.ts for the authoritative rule. The
  -- two halves (identity + coverage) are both required at finalize time
  -- regardless of how the caller framed the UI.

  v_base_location := p_settings->'base_location';
  IF v_base_location IS NULL OR jsonb_typeof(v_base_location) = 'null' THEN
    RAISE EXCEPTION 'finalize_onboarding_briefing_v1: geography_incomplete — photographers.settings.base_location is required';
  END IF;
  IF NOT public.validate_studio_base_location_shape(v_base_location) THEN
    RAISE EXCEPTION 'finalize_onboarding_briefing_v1: geography_malformed — photographers.settings.base_location does not match the StudioBaseLocation contract';
  END IF;

  v_extensions := p_studio_business_profile->'extensions';
  IF v_extensions IS NULL OR jsonb_typeof(v_extensions) <> 'object' THEN
    RAISE EXCEPTION 'finalize_onboarding_briefing_v1: geography_incomplete — studio_business_profiles.extensions.service_areas is required';
  END IF;

  v_service_areas := v_extensions->'service_areas';
  IF v_service_areas IS NULL
     OR jsonb_typeof(v_service_areas) = 'null'
     OR jsonb_typeof(v_service_areas) <> 'array'
     OR jsonb_array_length(v_service_areas) = 0 THEN
    RAISE EXCEPTION 'finalize_onboarding_briefing_v1: geography_incomplete — studio_business_profiles.extensions.service_areas must contain at least one valid entry';
  END IF;
  IF NOT public.validate_studio_service_areas_shape(v_service_areas) THEN
    RAISE EXCEPTION 'finalize_onboarding_briefing_v1: geography_malformed — studio_business_profiles.extensions.service_areas contains an invalid row';
  END IF;

  -- ── SETTINGS UPDATE ───────────────────────────────────────────────────
  UPDATE public.photographers
  SET settings = p_settings
  WHERE id = p_photographer_id;

  GET DIAGNOSTICS v_rowcount = ROW_COUNT;
  IF v_rowcount <> 1 THEN
    RAISE EXCEPTION 'finalize_onboarding_briefing_v1: photographer not found or not updated';
  END IF;

  INSERT INTO public.studio_business_profiles (
    photographer_id,
    service_types,
    service_availability,
    geographic_scope,
    travel_policy,
    booking_scope,
    client_types,
    deliverable_types,
    lead_acceptance_rules,
    language_support,
    team_structure,
    extensions,
    source_type,
    updated_at
  )
  VALUES (
    p_photographer_id,
    COALESCE(p_studio_business_profile->'service_types', '[]'::jsonb),
    COALESCE(p_studio_business_profile->'service_availability', '{}'::jsonb),
    COALESCE(p_studio_business_profile->'geographic_scope', '{}'::jsonb),
    COALESCE(p_studio_business_profile->'travel_policy', '{}'::jsonb),
    COALESCE(p_studio_business_profile->'booking_scope', '{}'::jsonb),
    COALESCE(p_studio_business_profile->'client_types', '[]'::jsonb),
    COALESCE(p_studio_business_profile->'deliverable_types', '[]'::jsonb),
    COALESCE(p_studio_business_profile->'lead_acceptance_rules', '{}'::jsonb),
    COALESCE(p_studio_business_profile->'language_support', '[]'::jsonb),
    COALESCE(p_studio_business_profile->'team_structure', '{}'::jsonb),
    COALESCE(p_studio_business_profile->'extensions', '{}'::jsonb),
    COALESCE(p_studio_business_profile->>'source_type', 'onboarding'),
    now()
  )
  ON CONFLICT (photographer_id) DO UPDATE SET
    service_types = EXCLUDED.service_types,
    service_availability = EXCLUDED.service_availability,
    geographic_scope = EXCLUDED.geographic_scope,
    travel_policy = EXCLUDED.travel_policy,
    booking_scope = EXCLUDED.booking_scope,
    client_types = EXCLUDED.client_types,
    deliverable_types = EXCLUDED.deliverable_types,
    lead_acceptance_rules = EXCLUDED.lead_acceptance_rules,
    language_support = EXCLUDED.language_support,
    team_structure = EXCLUDED.team_structure,
    extensions = EXCLUDED.extensions,
    source_type = EXCLUDED.source_type,
    updated_at = now();

  -- Replace only onboarding-owned playbook rows (Slice 1 cohort + legacy loose tags).
  -- TS mirror for verification: src/lib/onboardingFinalizeRpcContract.ts
  DELETE FROM public.playbook_rules pr
  WHERE pr.photographer_id = p_photographer_id
    AND pr.source_type IN (
      'onboarding_briefing_v1',
      'onboarding_briefing_default_v1',
      'onboarding_briefing_matrix_v1',
      'onboarding_briefing_escalation_v1',
      'onboarding',
      'onboarding_default',
      'onboarding_matrix'
    );

  IF p_playbook_rules IS NOT NULL AND jsonb_typeof(p_playbook_rules) = 'array' THEN
    FOR v_elem IN SELECT value FROM jsonb_array_elements(p_playbook_rules) AS t(value)
    LOOP
      INSERT INTO public.playbook_rules (
        photographer_id,
        scope,
        channel,
        action_key,
        topic,
        decision_mode,
        instruction,
        source_type,
        confidence_label,
        is_active
      ) VALUES (
        p_photographer_id,
        (v_elem->>'scope')::public.rule_scope,
        CASE
          WHEN v_elem->>'channel' IS NULL OR btrim(v_elem->>'channel', ' ') = '' THEN NULL
          ELSE (v_elem->>'channel')::public.thread_channel
        END,
        v_elem->>'action_key',
        v_elem->>'topic',
        (v_elem->>'decision_mode')::public.decision_mode,
        v_elem->>'instruction',
        v_elem->>'source_type',
        COALESCE(NULLIF(v_elem->>'confidence_label', ''), 'explicit'),
        COALESCE((v_elem->>'is_active')::boolean, true)
      );
    END LOOP;
  END IF;

  DELETE FROM public.knowledge_base kb
  WHERE kb.photographer_id = p_photographer_id
    AND kb.metadata IS NOT NULL
    AND kb.metadata->>'onboarding_source' = 'onboarding_briefing_v1';

  IF p_knowledge_base_rows IS NOT NULL AND jsonb_typeof(p_knowledge_base_rows) = 'array' THEN
    FOR v_elem IN SELECT value FROM jsonb_array_elements(p_knowledge_base_rows) AS t(value)
    LOOP
      INSERT INTO public.knowledge_base (
        photographer_id,
        document_type,
        content,
        metadata
      ) VALUES (
        p_photographer_id,
        v_elem->>'document_type',
        v_elem->>'content',
        COALESCE(v_elem->'metadata', '{}'::jsonb)
      );
    END LOOP;
  END IF;
END;
$$;

COMMENT ON FUNCTION public.finalize_onboarding_briefing_v1 IS
  'Transactional onboarding completion: validates geography contract (base_location + service_areas), merges settings, upserts studio_business_profiles, replaces onboarding-owned playbook_rules and knowledge_base rows.';

COMMIT;
