-- Onboarding Business Scope v2 — canonical refresh.
--
-- The first v2 rollout (20260501000000) settled on a small flat enum for
-- specializations (6 values) and offer components (10 values). The product
-- has since expanded both:
--
--   Specializations (now 8):
--     'weddings' | 'elopements' | 'engagement' | 'portraiture'
--     | 'family_maternity' | 'boudoir' | 'commercial' | 'general_events'
--
--   Offer components (now grouped by core_services with ~50 values):
--     digital_*  album_*  print_*  analog_*  post_*  onsite_*  rights_*
--     vfilm_*  vlong_*  vsocial_*  vassets_*  vspecialty_*
--     cc_*       addon_*
--
-- This migration brings any rows still on the older v2 enums forward to the
-- new canonicals. Unmapped values are dropped. Tenant-safe: single
-- transaction with FOR UPDATE row lock.

BEGIN;

DO $$
DECLARE
  rec RECORD;
  v_service_types     JSONB;
  v_deliverables      JSONB;
  v_extensions        JSONB;
  v_old_service_types JSONB;
  v_old_deliverables  JSONB;
  v_old_extensions    JSONB;
  v_custom_specs      JSONB;
  v_custom_offers     JSONB;
BEGIN
  FOR rec IN
    SELECT id, service_types, deliverable_types, extensions
    FROM public.studio_business_profiles
    FOR UPDATE
  LOOP
    v_old_service_types := COALESCE(rec.service_types, '[]'::jsonb);
    v_old_deliverables  := COALESCE(rec.deliverable_types, '[]'::jsonb);
    v_old_extensions    := COALESCE(rec.extensions, '{}'::jsonb);

    -- ── service_types: old-v2 (6) → new-v2 (8) ──────────────────────────
    SELECT COALESCE(jsonb_agg(DISTINCT mapped ORDER BY mapped), '[]'::jsonb)
    INTO v_service_types
    FROM (
      SELECT CASE LOWER(NULLIF(TRIM(elem #>> '{}'), ''))
        -- Pass-through for already-new IDs
        WHEN 'weddings'         THEN 'weddings'
        WHEN 'elopements'       THEN 'elopements'
        WHEN 'engagement'       THEN 'engagement'
        WHEN 'portraiture'      THEN 'portraiture'
        WHEN 'family_maternity' THEN 'family_maternity'
        WHEN 'boudoir'          THEN 'boudoir'
        WHEN 'commercial'       THEN 'commercial'
        WHEN 'general_events'   THEN 'general_events'
        -- Old-v2 → new-v2 renames
        WHEN 'engagements'      THEN 'engagement'
        WHEN 'events'           THEN 'general_events'
        ELSE NULL
      END AS mapped
      FROM jsonb_array_elements(v_old_service_types) AS elem
      WHERE jsonb_typeof(elem) = 'string'
    ) s
    WHERE mapped IS NOT NULL;

    -- ── deliverable_types: old-v2 (10) → new-v2 (~50) ────────────────────
    --
    -- Each old slot maps to the closest new slot. `super_8` has no precise
    -- equivalent in the new menu (Polaroid covers instant film, 35mm/medium
    -- cover stills) and is dropped on migration.
    SELECT COALESCE(jsonb_agg(DISTINCT mapped ORDER BY mapped), '[]'::jsonb)
    INTO v_deliverables
    FROM (
      SELECT CASE
        -- Pass-through for already-new IDs
        WHEN val = ANY (ARRAY[
          -- digital
          'digital_online_gallery','digital_usb_box','digital_highres_download','digital_websize_only',
          -- physical
          'album_fine_art','album_parent','print_fine_art','print_framed',
          -- analog
          'analog_35mm','analog_medium_format','analog_polaroid',
          -- post
          'post_high_end_retouch','post_ai_culling','post_24h_sneaks',
          -- on-site
          'onsite_second_photographer','onsite_assistant_lighting',
          -- rights
          'rights_full_raw_transfer','rights_commercial_license','rights_personal_only',
          -- video films
          'vfilm_cinematic_highlight','vfilm_feature','vfilm_teaser',
          -- video long form
          'vlong_full_ceremony','vlong_full_speeches','vlong_multicam_doc',
          -- video social
          'vsocial_same_day_edit','vsocial_reels','vsocial_4k_vertical',
          -- video assets
          'vassets_full_unedited','vassets_licensed_music','vassets_sound_design',
          -- video specialty
          'vspecialty_drone_aerial','vspecialty_fpv_drone','vspecialty_livestream',
          -- content creation
          'cc_mobile_raw_clips','cc_mobile_bts','cc_mobile_day_in_life',
          'cc_speed_instant_turnaround','cc_speed_live_posting',
          'cc_edit_trending_audio','cc_edit_tiktok','cc_edit_capcut_templates',
          -- cross-service add-ons
          'addon_travel_included','addon_destination_fee','addon_additional_hours','addon_overnight_stay',
          'addon_priority_delivery','addon_rush_fee','addon_nda_private_gallery',
          'addon_hard_drive_archival','addon_10yr_cloud_storage'
        ]) THEN val
        -- Old-v2 → new-v2 renames
        WHEN val = 'digital_files'    THEN 'digital_online_gallery'
        WHEN val = 'albums'           THEN 'album_fine_art'
        WHEN val = 'prints'           THEN 'print_fine_art'
        WHEN val = 'raw_files'        THEN 'rights_full_raw_transfer'
        WHEN val = 'film_photography' THEN 'analog_35mm'
        WHEN val = 'drone'            THEN 'vspecialty_drone_aerial'
        WHEN val = 'highlight_films'  THEN 'vfilm_cinematic_highlight'
        WHEN val = 'short_form_clips' THEN 'vsocial_reels'
        WHEN val = 'livestream'       THEN 'vspecialty_livestream'
        -- 'super_8' intentionally dropped (no precise new slot)
        ELSE NULL
      END AS mapped
      FROM (
        SELECT LOWER(NULLIF(TRIM(elem #>> '{}'), '')) AS val
        FROM jsonb_array_elements(v_old_deliverables) AS elem
        WHERE jsonb_typeof(elem) = 'string'
      ) raw
    ) s
    WHERE mapped IS NOT NULL;

    -- ── extensions.custom_specializations[*].behaves_like refresh ────────
    SELECT COALESCE(jsonb_agg(row_obj), '[]'::jsonb)
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
          CASE LOWER(NULLIF(TRIM(e->>'behaves_like'), ''))
            WHEN 'weddings'         THEN 'weddings'
            WHEN 'elopements'       THEN 'elopements'
            WHEN 'engagement'       THEN 'engagement'
            WHEN 'portraiture'      THEN 'portraiture'
            WHEN 'family_maternity' THEN 'family_maternity'
            WHEN 'boudoir'          THEN 'boudoir'
            WHEN 'commercial'       THEN 'commercial'
            WHEN 'general_events'   THEN 'general_events'
            WHEN 'engagements'      THEN 'engagement'
            WHEN 'events'           THEN 'general_events'
            ELSE NULL
          END AS behaves
        FROM jsonb_array_elements(
          COALESCE(v_old_extensions->'custom_specializations', '[]'::jsonb)
        ) AS e
        WHERE jsonb_typeof(e) = 'object'
      ) inner_rows
      WHERE label IS NOT NULL
    ) outer_rows;

    -- ── extensions.custom_offer_components[*].behaves_like refresh ───────
    SELECT COALESCE(jsonb_agg(row_obj), '[]'::jsonb)
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
          CASE LOWER(NULLIF(TRIM(e->>'behaves_like'), ''))
            WHEN 'digital_files'    THEN 'digital_online_gallery'
            WHEN 'albums'           THEN 'album_fine_art'
            WHEN 'prints'           THEN 'print_fine_art'
            WHEN 'raw_files'        THEN 'rights_full_raw_transfer'
            WHEN 'film_photography' THEN 'analog_35mm'
            WHEN 'drone'            THEN 'vspecialty_drone_aerial'
            WHEN 'highlight_films'  THEN 'vfilm_cinematic_highlight'
            WHEN 'short_form_clips' THEN 'vsocial_reels'
            WHEN 'livestream'       THEN 'vspecialty_livestream'
            ELSE NULL
          END AS behaves
        FROM jsonb_array_elements(
          COALESCE(v_old_extensions->'custom_offer_components', '[]'::jsonb)
        ) AS e
        WHERE jsonb_typeof(e) = 'object'
      ) inner_rows
      WHERE label IS NOT NULL
    ) outer_rows;

    v_extensions := v_old_extensions
      || jsonb_build_object(
        'schema_version',          2,
        'custom_specializations',  v_custom_specs,
        'custom_offer_components', v_custom_offers
      );

    UPDATE public.studio_business_profiles
    SET
      service_types     = v_service_types,
      deliverable_types = v_deliverables,
      extensions        = v_extensions,
      updated_at        = now()
    WHERE id = rec.id;
  END LOOP;
END $$;

COMMIT;
