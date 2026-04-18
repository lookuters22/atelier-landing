-- Slice 2: transactional runtime finalization for onboarding briefing.
-- Replaces only onboarding-owned playbook_rules and knowledge_base rows; merges photographers.settings
-- and upserts studio_business_profiles. Caller supplies pre-merged settings JSON (client-side merge).

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
BEGIN
  IF p_photographer_id IS DISTINCT FROM (SELECT auth.uid()) THEN
    RAISE EXCEPTION 'finalize_onboarding_briefing_v1: not authorized for this photographer';
  END IF;

  IF p_settings IS NULL OR jsonb_typeof(p_settings) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'finalize_onboarding_briefing_v1: p_settings must be a JSON object';
  END IF;

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
  -- TS mirror for verification: src/lib/onboardingFinalizeRpcContract.ts (FINALIZE_ONBOARDING_PLAYBOOK_DELETE_SOURCE_TYPES)
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

  -- Replace only onboarding-tagged KB rows (metadata.onboarding_source = onboarding_briefing_v1).
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
  'Transactional onboarding completion: settings merge, studio_business_profiles upsert, replace onboarding-owned playbook_rules and knowledge_base only.';

REVOKE ALL ON FUNCTION public.finalize_onboarding_briefing_v1(
  uuid, jsonb, jsonb, jsonb, jsonb
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.finalize_onboarding_briefing_v1(
  uuid, jsonb, jsonb, jsonb, jsonb
) TO authenticated;

GRANT EXECUTE ON FUNCTION public.finalize_onboarding_briefing_v1(
  uuid, jsonb, jsonb, jsonb, jsonb
) TO service_role;
