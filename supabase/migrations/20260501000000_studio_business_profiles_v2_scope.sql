-- Onboarding Business Scope v2 — canonical model overhaul.
--
-- The scope is now expressed as three orthogonal canonical lists:
--
--   studio_business_profiles.core_services     JSONB array
--       Values: 'photo' | 'video' | 'hybrid' | 'content_creation'
--       "video" = dedicated videography/filmmaking
--       "hybrid" = photographer-led shoot with motion capture alongside
--       "content_creation" = lightweight commercial/social content production
--
--   studio_business_profiles.service_types     JSONB array (REUSED, CONTENT REWRITTEN)
--       Canonical specializations only:
--         'weddings' | 'elopements' | 'engagements' | 'events'
--         | 'portraiture' | 'commercial'
--       The v1 values family|maternity|newborn are collapsed into 'portraiture'.
--       The v1 values brand|editorial|corporate are collapsed into 'commercial'.
--       Any legacy 'video' entry is lifted out to `core_services` and dropped
--       here (it is a core service, not a specialization).
--
--   studio_business_profiles.deliverable_types JSONB array (REUSED, CONTENT REWRITTEN)
--       Canonical offer components:
--         'digital_files' | 'albums' | 'prints' | 'raw_files'
--         | 'film_photography' | 'drone' | 'highlight_films'
--         | 'short_form_clips' | 'super_8' | 'livestream'
--       Renames from v1: digital_gallery→digital_files, album→albums,
--       video_deliverable→highlight_films.
--       Capabilities previously stored in extensions.selected_service_capabilities
--       are lifted here: drone, super_8, highlight_film→highlight_films,
--       short_form_social_clips|teaser_clips→short_form_clips.
--
--   studio_business_profiles.extensions        JSONB object (REWRITTEN TO V2)
--       Keeps only v2 keys:
--         - schema_version: 2
--         - custom_specializations: {label, behaves_like}[]
--         - custom_offer_components: {label, behaves_like}[]
--         - custom_geography_labels
--         - travel_constraints
--         - service_areas
--       Old v1 keys are dropped:
--         - custom_services          -> migrated into custom_specializations
--         - custom_deliverables      -> migrated into custom_offer_components
--         - selected_service_labels  -> dropped (flat-label layer is gone)
--         - selected_media_groups    -> lifted into core_services above
--         - selected_service_categories -> dropped (intermediate layer is gone)
--         - selected_service_capabilities -> lifted into deliverable_types above
--
-- Tenant-safe: executed in a single transaction with a FOR UPDATE row lock.

BEGIN;

-- ── 1. Add the new core_services column ──────────────────────────────────────

ALTER TABLE public.studio_business_profiles
  ADD COLUMN IF NOT EXISTS core_services JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.studio_business_profiles.core_services IS
  'Canonical v2 core service types: photo | video | hybrid | content_creation.';

-- ── 2. Per-row backfill (deterministic, audit-traceable) ────────────────────
--
-- Helper mapping tables live inside the DO block so they disappear after run.

DO $$
DECLARE
  rec RECORD;
  v_core_services     JSONB;
  v_service_types     JSONB;
  v_deliverables      JSONB;
  v_extensions        JSONB;

  -- scratch
  v_old_service_types JSONB;
  v_old_deliverables  JSONB;
  v_old_extensions    JSONB;

  v_custom_specs      JSONB;
  v_custom_offers     JSONB;
  v_geo_labels        JSONB;
  v_travel_constr     JSONB;
  v_service_areas     JSONB;
BEGIN
  FOR rec IN
    SELECT id, service_types, deliverable_types, extensions
    FROM public.studio_business_profiles
    FOR UPDATE
  LOOP
    v_old_service_types := COALESCE(rec.service_types, '[]'::jsonb);
    v_old_deliverables  := COALESCE(rec.deliverable_types, '[]'::jsonb);
    v_old_extensions    := COALESCE(rec.extensions, '{}'::jsonb);

    -- ── core_services ────────────────────────────────────────────────────
    -- Lift old canonical 'video' out of service_types + legacy
    -- extensions.selected_media_groups[*].id into core_services.
    -- Photo-side production is inferred when any non-video legacy specialization
    -- is present (studio is photographing things, implicitly).
    WITH media_rows AS (
      SELECT DISTINCT LOWER(NULLIF(TRIM(elem->>'id'), '')) AS mid
      FROM jsonb_array_elements(
        COALESCE(v_old_extensions->'selected_media_groups', '[]'::jsonb)
      ) AS elem
      WHERE jsonb_typeof(elem) = 'object'
    ),
    legacy_canonicals AS (
      SELECT DISTINCT LOWER(NULLIF(TRIM(elem #>> '{}'), '')) AS cid
      FROM jsonb_array_elements(v_old_service_types) AS elem
      WHERE jsonb_typeof(elem) = 'string'
    ),
    any_non_video AS (
      SELECT EXISTS (
        SELECT 1 FROM legacy_canonicals
        WHERE cid IS NOT NULL AND cid <> 'video'
      ) AS seen
    )
    SELECT COALESCE(
      jsonb_agg(DISTINCT core ORDER BY core),
      '[]'::jsonb
    )
    INTO v_core_services
    FROM (
      SELECT 'photo'::text AS core
      FROM media_rows WHERE mid = 'photo'
      UNION ALL
      SELECT 'photo'::text
      FROM any_non_video WHERE seen = TRUE
      UNION ALL
      SELECT 'video'::text
      FROM media_rows WHERE mid = 'video'
      UNION ALL
      SELECT 'video'::text
      FROM legacy_canonicals WHERE cid = 'video'
    ) s
    WHERE core IN ('photo','video','hybrid','content_creation');

    -- ── service_types (specializations) ─────────────────────────────────
    -- Map legacy specializations onto the new 6-value set.
    SELECT COALESCE(
      jsonb_agg(DISTINCT mapped ORDER BY mapped),
      '[]'::jsonb
    )
    INTO v_service_types
    FROM (
      SELECT CASE LOWER(NULLIF(TRIM(elem #>> '{}'), ''))
        WHEN 'weddings'    THEN 'weddings'
        WHEN 'elopements'  THEN 'elopements'
        WHEN 'engagements' THEN 'engagements'
        WHEN 'events'      THEN 'events'
        WHEN 'family'      THEN 'portraiture'
        WHEN 'maternity'   THEN 'portraiture'
        WHEN 'newborn'     THEN 'portraiture'
        WHEN 'portraiture' THEN 'portraiture'
        WHEN 'brand'       THEN 'commercial'
        WHEN 'editorial'   THEN 'commercial'
        WHEN 'corporate'   THEN 'commercial'
        WHEN 'commercial'  THEN 'commercial'
        ELSE NULL
      END AS mapped
      FROM jsonb_array_elements(v_old_service_types) AS elem
      WHERE jsonb_typeof(elem) = 'string'
    ) s
    WHERE mapped IS NOT NULL;

    -- ── deliverable_types (offer components) ─────────────────────────────
    -- Combine legacy deliverables + capabilities from extensions.
    SELECT COALESCE(
      jsonb_agg(DISTINCT mapped ORDER BY mapped),
      '[]'::jsonb
    )
    INTO v_deliverables
    FROM (
      -- legacy deliverable_types
      SELECT CASE LOWER(NULLIF(TRIM(elem #>> '{}'), ''))
        WHEN 'digital_gallery'    THEN 'digital_files'
        WHEN 'digital_files'      THEN 'digital_files'
        WHEN 'album'              THEN 'albums'
        WHEN 'albums'             THEN 'albums'
        WHEN 'prints'             THEN 'prints'
        WHEN 'raw_files'          THEN 'raw_files'
        WHEN 'video_deliverable'  THEN 'highlight_films'
        WHEN 'highlight_films'    THEN 'highlight_films'
        WHEN 'film_photography'   THEN 'film_photography'
        WHEN 'drone'              THEN 'drone'
        WHEN 'short_form_clips'   THEN 'short_form_clips'
        WHEN 'super_8'            THEN 'super_8'
        WHEN 'livestream'         THEN 'livestream'
        ELSE NULL
      END AS mapped
      FROM jsonb_array_elements(v_old_deliverables) AS elem
      WHERE jsonb_typeof(elem) = 'string'

      UNION ALL

      -- legacy extensions.selected_service_capabilities[*].id
      SELECT CASE LOWER(NULLIF(TRIM(elem->>'id'), ''))
        WHEN 'drone'                    THEN 'drone'
        WHEN 'super_8'                  THEN 'super_8'
        WHEN 'highlight_film'           THEN 'highlight_films'
        WHEN 'short_form_social_clips'  THEN 'short_form_clips'
        WHEN 'teaser_clips'             THEN 'short_form_clips'
        WHEN 'film_photography'         THEN 'film_photography'
        ELSE NULL
      END AS mapped
      FROM jsonb_array_elements(
        COALESCE(v_old_extensions->'selected_service_capabilities', '[]'::jsonb)
      ) AS elem
      WHERE jsonb_typeof(elem) = 'object'
    ) s
    WHERE mapped IS NOT NULL;

    -- ── extensions (v2 shape) ────────────────────────────────────────────
    -- Convert v1 custom_services -> custom_specializations, using the same
    -- 6-value collapse as above for the behaves_like hint.
    SELECT COALESCE(
      jsonb_agg(row_obj),
      '[]'::jsonb
    )
    INTO v_custom_specs
    FROM (
      SELECT
        CASE
          WHEN behaves IS NOT NULL THEN
            jsonb_build_object('label', label, 'behaves_like', behaves)
          ELSE
            jsonb_build_object('label', label)
        END AS row_obj
      FROM (
        SELECT
          NULLIF(TRIM(e->>'label'), '') AS label,
          CASE LOWER(NULLIF(TRIM(e->>'behaves_like_service_type'), ''))
            WHEN 'weddings'    THEN 'weddings'
            WHEN 'elopements'  THEN 'elopements'
            WHEN 'engagements' THEN 'engagements'
            WHEN 'events'      THEN 'events'
            WHEN 'family'      THEN 'portraiture'
            WHEN 'maternity'   THEN 'portraiture'
            WHEN 'newborn'     THEN 'portraiture'
            WHEN 'portraiture' THEN 'portraiture'
            WHEN 'brand'       THEN 'commercial'
            WHEN 'editorial'   THEN 'commercial'
            WHEN 'corporate'   THEN 'commercial'
            WHEN 'commercial'  THEN 'commercial'
            ELSE NULL
          END AS behaves
        FROM jsonb_array_elements(
          COALESCE(v_old_extensions->'custom_services', '[]'::jsonb)
        ) AS e
        WHERE jsonb_typeof(e) = 'object'
      ) inner_rows
      WHERE label IS NOT NULL
    ) outer_rows;

    -- Convert v1 custom_deliverables -> custom_offer_components, applying the
    -- same renames (digital_gallery→digital_files, album→albums, ...) used above.
    SELECT COALESCE(
      jsonb_agg(row_obj),
      '[]'::jsonb
    )
    INTO v_custom_offers
    FROM (
      SELECT
        CASE
          WHEN behaves IS NOT NULL THEN
            jsonb_build_object('label', label, 'behaves_like', behaves)
          ELSE
            jsonb_build_object('label', label)
        END AS row_obj
      FROM (
        SELECT
          NULLIF(TRIM(e->>'label'), '') AS label,
          CASE LOWER(NULLIF(TRIM(e->>'behaves_like_deliverable'), ''))
            WHEN 'digital_gallery'    THEN 'digital_files'
            WHEN 'digital_files'      THEN 'digital_files'
            WHEN 'album'              THEN 'albums'
            WHEN 'albums'             THEN 'albums'
            WHEN 'prints'             THEN 'prints'
            WHEN 'raw_files'          THEN 'raw_files'
            WHEN 'video_deliverable'  THEN 'highlight_films'
            WHEN 'highlight_films'    THEN 'highlight_films'
            WHEN 'film_photography'   THEN 'film_photography'
            WHEN 'drone'              THEN 'drone'
            WHEN 'short_form_clips'   THEN 'short_form_clips'
            WHEN 'super_8'            THEN 'super_8'
            WHEN 'livestream'         THEN 'livestream'
            ELSE NULL
          END AS behaves
        FROM jsonb_array_elements(
          COALESCE(v_old_extensions->'custom_deliverables', '[]'::jsonb)
        ) AS e
        WHERE jsonb_typeof(e) = 'object'
      ) inner_rows
      WHERE label IS NOT NULL
    ) outer_rows;

    -- Preserve unrelated v1 extension keys that survive into v2.
    -- NOTE: `travel_constraints` and `service_areas` are **arrays** in
    -- BusinessScopeExtensionsV2 (see `onboardingBusinessScopeExtensions.ts`),
    -- so their empty defaults must be `[]`, not `{}`. Earlier drafts of
    -- this migration used `{}` and corrupted freshly-migrated rows; the
    -- corrective migration `20260502000000_studio_business_profiles_v2_scope_array_defaults_fix.sql`
    -- heals any rows already written with the wrong shape.
    v_geo_labels    := COALESCE(v_old_extensions->'custom_geography_labels', '[]'::jsonb);
    v_travel_constr := COALESCE(v_old_extensions->'travel_constraints',       '[]'::jsonb);
    v_service_areas := COALESCE(v_old_extensions->'service_areas',            '[]'::jsonb);

    -- Defensive: if the preserved value is present but not actually an
    -- array (e.g. a stray `{}` written by a buggy draft), coerce to `[]`
    -- so the v2 shape stays honest for downstream consumers.
    IF jsonb_typeof(v_travel_constr) IS DISTINCT FROM 'array' THEN
      v_travel_constr := '[]'::jsonb;
    END IF;
    IF jsonb_typeof(v_service_areas) IS DISTINCT FROM 'array' THEN
      v_service_areas := '[]'::jsonb;
    END IF;

    v_extensions := jsonb_build_object(
      'schema_version',           2,
      'custom_specializations',   v_custom_specs,
      'custom_offer_components',  v_custom_offers,
      'custom_geography_labels',  v_geo_labels,
      'travel_constraints',       v_travel_constr,
      'service_areas',            v_service_areas
    );

    UPDATE public.studio_business_profiles
    SET
      core_services     = v_core_services,
      service_types     = v_service_types,
      deliverable_types = v_deliverables,
      extensions        = v_extensions,
      updated_at        = now()
    WHERE id = rec.id;
  END LOOP;
END $$;

-- ── 3. Refresh the extensions column comment to reflect v2 ──────────────────

COMMENT ON COLUMN public.studio_business_profiles.extensions IS
  'Versioned BusinessScopeExtensionsV2 JSON: custom_specializations, custom_offer_components, custom_geography_labels, travel_constraints, service_areas.';

-- ── 4. finalize_onboarding_briefing_v1 — include core_services column ──────

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
    core_services,
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
    COALESCE(p_studio_business_profile->'core_services', '[]'::jsonb),
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
    core_services = EXCLUDED.core_services,
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

  -- Replace only onboarding-owned playbook rows (same cohort as the original RPC).
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
  'Transactional onboarding completion (v2 scope): settings merge, studio_business_profiles upsert (now including core_services), and onboarding-owned playbook_rules + knowledge_base rewrite.';

COMMIT;
