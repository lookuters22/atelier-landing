-- Slice 3: explicit memory writes + scope shape CHECK; drop Slice 1 insert default trigger.

-- ── 0) Normalize legacy rows so CHECK can validate (defensive) ─────────────
UPDATE public.memories
SET person_id = NULL
WHERE scope IS DISTINCT FROM 'person' AND person_id IS NOT NULL;

UPDATE public.memories
SET wedding_id = NULL
WHERE scope = 'person' AND wedding_id IS NOT NULL;

UPDATE public.memories
SET scope = 'studio'::public.memory_scope
WHERE scope = 'person' AND person_id IS NULL;

UPDATE public.memories
SET scope = 'studio'::public.memory_scope
WHERE scope = 'project' AND wedding_id IS NULL;

UPDATE public.memories
SET scope = 'project'::public.memory_scope
WHERE scope = 'studio' AND wedding_id IS NOT NULL;

-- ── 1) Learning-loop RPC: memory artifacts set scope explicitly ───────────
CREATE OR REPLACE FUNCTION public.complete_learning_loop_operator_resolution(
  p_photographer_id uuid,
  p_escalation_id uuid,
  p_wedding_id uuid,
  p_thread_id uuid,
  p_learning_outcome public.escalation_learning_outcome,
  p_artifacts jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_er public.escalation_requests%ROWTYPE;
  v_rowcount int;
  v_exc_ids uuid[] := ARRAY[]::uuid[];
  v_mem_ids uuid[] := ARRAY[]::uuid[];
  v_cand_ids uuid[] := ARRAY[]::uuid[];
  v_elem jsonb;
  v_kind text;
  v_exc_id uuid;
  v_mem_id uuid;
  v_cand_id uuid;
  v_eff_from timestamptz;
  v_eff_until timestamptz;
  v_tid uuid;
  v_wid uuid;
  v_json jsonb;
  v_mem_key text;
BEGIN
  IF jsonb_typeof(p_artifacts) IS DISTINCT FROM 'array' OR jsonb_array_length(p_artifacts) < 1 THEN
    RAISE EXCEPTION 'complete_learning_loop_operator_resolution: p_artifacts must be a non-empty json array';
  END IF;

  SELECT * INTO v_er FROM public.escalation_requests WHERE id = p_escalation_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'complete_learning_loop_operator_resolution: escalation not found';
  END IF;
  IF v_er.photographer_id <> p_photographer_id THEN
    RAISE EXCEPTION 'complete_learning_loop_operator_resolution: tenant mismatch';
  END IF;
  IF v_er.wedding_id IS DISTINCT FROM p_wedding_id THEN
    RAISE EXCEPTION 'complete_learning_loop_operator_resolution: wedding mismatch';
  END IF;
  IF v_er.thread_id IS DISTINCT FROM p_thread_id THEN
    RAISE EXCEPTION 'complete_learning_loop_operator_resolution: thread mismatch';
  END IF;

  IF v_er.status = 'answered'::public.escalation_status
     AND v_er.resolution_storage_target = 'learning_loop'
     AND v_er.learning_outcome IS NOT DISTINCT FROM p_learning_outcome
  THEN
    SELECT COALESCE(array_agg(e.id ORDER BY e.created_at), ARRAY[]::uuid[])
    INTO v_exc_ids
    FROM public.authorized_case_exceptions e
    WHERE e.approved_via_escalation_id = p_escalation_id;

    SELECT COALESCE(array_agg(m.id ORDER BY m.learning_loop_artifact_key NULLS LAST), ARRAY[]::uuid[])
    INTO v_mem_ids
    FROM public.memories m
    WHERE m.photographer_id = p_photographer_id
      AND m.source_escalation_id = p_escalation_id;

    SELECT COALESCE(array_agg(c.id ORDER BY c.created_at), ARRAY[]::uuid[])
    INTO v_cand_ids
    FROM public.playbook_rule_candidates c
    WHERE c.source_escalation_id = p_escalation_id;

    RETURN jsonb_build_object(
      'status', 'already_completed',
      'created_exception_ids', to_jsonb(v_exc_ids),
      'created_memory_ids', to_jsonb(v_mem_ids),
      'created_candidate_ids', to_jsonb(v_cand_ids),
      'closed_escalation_id', p_escalation_id
    );
  END IF;

  IF v_er.status IS DISTINCT FROM 'open'::public.escalation_status THEN
    RAISE EXCEPTION 'complete_learning_loop_operator_resolution: escalation not open (status=%)', v_er.status;
  END IF;

  FOR v_elem IN SELECT value FROM jsonb_array_elements(p_artifacts)
  LOOP
    v_kind := v_elem->>'kind';
    IF v_kind = 'authorized_case_exception' THEN
      v_eff_from := COALESCE(
        NULLIF(trim(both from v_elem->>'effectiveFromIso'), '')::timestamptz,
        now()
      );
      v_eff_until := NULLIF(trim(both from v_elem->>'effectiveUntilIso'), '')::timestamptz;
      IF v_eff_until IS NULL THEN
        v_eff_until := now() + interval '180 days';
      END IF;

      v_exc_id := public.replace_authorized_case_exception_for_escalation(
        p_photographer_id,
        p_wedding_id,
        p_thread_id,
        p_escalation_id,
        v_elem->>'overridesActionKey',
        (NULLIF(trim(both from v_elem->>'targetPlaybookRuleId'), ''))::uuid,
        COALESCE(v_elem->'overridePayload', '{}'::jsonb),
        v_eff_from,
        v_eff_until,
        NULLIF(v_elem->>'notes', '')
      );
      v_exc_ids := array_append(v_exc_ids, v_exc_id);

    ELSIF v_kind = 'memory' THEN
      v_mem_key := NULLIF(trim(both from v_elem->>'learningLoopArtifactKey'), '');
      IF v_mem_key IS NULL OR length(v_mem_key) = 0 THEN
        RAISE EXCEPTION 'complete_learning_loop_operator_resolution: memory missing learningLoopArtifactKey';
      END IF;

      v_wid := NULLIF(trim(both from v_elem->>'weddingId'), '')::uuid;

      INSERT INTO public.memories (
        photographer_id,
        wedding_id,
        scope,
        person_id,
        type,
        title,
        summary,
        full_content,
        source_escalation_id,
        learning_loop_artifact_key
      ) VALUES (
        p_photographer_id,
        v_wid,
        CASE
          WHEN v_wid IS NOT NULL THEN 'project'::public.memory_scope
          ELSE 'studio'::public.memory_scope
        END,
        NULL,
        left(COALESCE(v_elem->>'memoryType', ''), 200),
        left(COALESCE(v_elem->>'title', ''), 120),
        left(COALESCE(v_elem->>'summary', ''), 400),
        left(COALESCE(v_elem->>'fullContent', ''), 8000),
        p_escalation_id,
        v_mem_key
      )
      ON CONFLICT (photographer_id, source_escalation_id, learning_loop_artifact_key)
        WHERE source_escalation_id IS NOT NULL AND learning_loop_artifact_key IS NOT NULL
      DO NOTHING
      RETURNING id INTO v_mem_id;

      IF v_mem_id IS NULL THEN
        SELECT m.id INTO v_mem_id
        FROM public.memories m
        WHERE m.photographer_id = p_photographer_id
          AND m.source_escalation_id = p_escalation_id
          AND m.learning_loop_artifact_key = v_mem_key
        LIMIT 1;
      END IF;

      IF v_mem_id IS NULL THEN
        RAISE EXCEPTION 'complete_learning_loop_operator_resolution: memory insert failed';
      END IF;
      v_mem_ids := array_append(v_mem_ids, v_mem_id);

    ELSIF v_kind = 'playbook_rule_candidate' THEN
      v_wid := COALESCE(
        NULLIF(trim(both from v_elem->>'weddingId'), '')::uuid,
        p_wedding_id
      );
      v_tid := NULLIF(trim(both from v_elem->>'threadId'), '')::uuid;
      IF v_tid IS NULL THEN
        v_tid := p_thread_id;
      END IF;

      INSERT INTO public.playbook_rule_candidates (
        photographer_id,
        wedding_id,
        thread_id,
        source_escalation_id,
        proposed_action_key,
        topic,
        proposed_instruction,
        proposed_decision_mode,
        proposed_scope,
        proposed_channel,
        review_status,
        source_classification,
        confidence,
        operator_resolution_summary,
        originating_operator_text,
        observation_count
      ) VALUES (
        p_photographer_id,
        v_wid,
        v_tid,
        p_escalation_id,
        v_elem->>'proposedActionKey',
        v_elem->>'topic',
        v_elem->>'proposedInstruction',
        COALESCE(
          (v_elem->>'proposedDecisionMode')::public.decision_mode,
          'auto'::public.decision_mode
        ),
        COALESCE(
          (v_elem->>'proposedScope')::public.rule_scope,
          'global'::public.rule_scope
        ),
        CASE
          WHEN v_elem->>'proposedChannel' IS NULL OR trim(both from v_elem->>'proposedChannel') = '' THEN NULL
          ELSE (v_elem->>'proposedChannel')::public.thread_channel
        END,
        'candidate',
        COALESCE(v_elem->'sourceClassification', '{}'::jsonb),
        CASE
          WHEN v_elem->>'confidence' IS NULL OR trim(both from v_elem->>'confidence') = '' THEN NULL
          ELSE (v_elem->>'confidence')::real
        END,
        NULLIF(v_elem->>'operatorResolutionSummary', ''),
        NULLIF(v_elem->>'originatingOperatorText', ''),
        GREATEST(
          1,
          COALESCE(NULLIF((v_elem->>'observationCount'), '')::int, 1)
        )
      )
      RETURNING id INTO v_cand_id;

      v_cand_ids := array_append(v_cand_ids, v_cand_id);

    ELSE
      RAISE EXCEPTION 'complete_learning_loop_operator_resolution: unknown artifact kind %', v_kind;
    END IF;
  END LOOP;

  UPDATE public.escalation_requests
  SET
    status = 'answered'::public.escalation_status,
    resolved_at = now(),
    resolved_decision_mode = 'auto'::public.decision_mode,
    resolution_text = NULL,
    learning_outcome = p_learning_outcome,
    resolution_storage_target = 'learning_loop',
    playbook_rule_id = NULL,
    promote_to_playbook = false
  WHERE id = p_escalation_id
    AND photographer_id = p_photographer_id
    AND status = 'open'::public.escalation_status;

  GET DIAGNOSTICS v_rowcount = ROW_COUNT;
  IF v_rowcount = 0 THEN
    RAISE EXCEPTION 'complete_learning_loop_operator_resolution: finalize failed (concurrent update?)';
  END IF;

  v_json := jsonb_build_object(
    'status', 'completed',
    'created_exception_ids', to_jsonb(v_exc_ids),
    'created_memory_ids', to_jsonb(v_mem_ids),
    'created_candidate_ids', to_jsonb(v_cand_ids),
    'closed_escalation_id', p_escalation_id
  );

  RETURN v_json;
END;
$$;

REVOKE ALL ON FUNCTION public.complete_learning_loop_operator_resolution(
  uuid, uuid, uuid, uuid, public.escalation_learning_outcome, jsonb
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.complete_learning_loop_operator_resolution(
  uuid, uuid, uuid, uuid, public.escalation_learning_outcome, jsonb
) TO service_role;

-- ── 2) Escalation → memory RPC ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.complete_escalation_resolution_memory(
  p_photographer_id uuid,
  p_wedding_id uuid,
  p_escalation_id uuid,
  p_title text,
  p_summary text,
  p_full_content text,
  p_learning_outcome public.escalation_learning_outcome
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_er public.escalation_requests%ROWTYPE;
  v_mem_id uuid;
  v_rowcount int;
  v_prefix text := 'escalation_request_id: ' || p_escalation_id::text;
BEGIN
  SELECT * INTO v_er FROM public.escalation_requests WHERE id = p_escalation_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'complete_escalation_resolution_memory: escalation not found';
  END IF;
  IF v_er.photographer_id <> p_photographer_id THEN
    RAISE EXCEPTION 'complete_escalation_resolution_memory: tenant mismatch';
  END IF;

  IF v_er.status = 'answered'::public.escalation_status
     AND v_er.resolution_storage_target = 'memories'
     AND v_er.learning_outcome IS NOT DISTINCT FROM p_learning_outcome
  THEN
    SELECT m.id INTO v_mem_id
    FROM public.memories m
    WHERE m.photographer_id = p_photographer_id
      AND m.wedding_id IS NOT DISTINCT FROM p_wedding_id
      AND m.type = 'escalation_case_decision'
      AND position(v_prefix in m.full_content) = 1
    LIMIT 1;
    IF v_mem_id IS NULL THEN
      RAISE EXCEPTION 'complete_escalation_resolution_memory: idempotent answered but missing memory';
    END IF;
    RETURN v_mem_id;
  END IF;

  IF v_er.status IS DISTINCT FROM 'open'::public.escalation_status THEN
    RAISE EXCEPTION 'complete_escalation_resolution_memory: escalation not open (status=%)', v_er.status;
  END IF;

  SELECT m.id INTO v_mem_id
  FROM public.memories m
  WHERE m.photographer_id = p_photographer_id
    AND m.wedding_id IS NOT DISTINCT FROM p_wedding_id
    AND m.type = 'escalation_case_decision'
    AND position(v_prefix in m.full_content) = 1
  LIMIT 1;

  IF v_mem_id IS NULL THEN
    INSERT INTO public.memories (
      photographer_id,
      wedding_id,
      scope,
      person_id,
      type,
      title,
      summary,
      full_content
    ) VALUES (
      p_photographer_id,
      p_wedding_id,
      CASE
        WHEN p_wedding_id IS NOT NULL THEN 'project'::public.memory_scope
        ELSE 'studio'::public.memory_scope
      END,
      NULL,
      'escalation_case_decision',
      left(p_title, 120),
      left(p_summary, 400),
      left(p_full_content, 8000)
    )
    RETURNING id INTO v_mem_id;
  END IF;

  UPDATE public.escalation_requests
  SET
    status = 'answered'::public.escalation_status,
    resolved_at = now(),
    resolved_decision_mode = 'auto'::public.decision_mode,
    resolution_text = NULL,
    learning_outcome = p_learning_outcome,
    resolution_storage_target = 'memories',
    playbook_rule_id = NULL,
    promote_to_playbook = false
  WHERE id = p_escalation_id
    AND photographer_id = p_photographer_id
    AND status = 'open'::public.escalation_status;

  GET DIAGNOSTICS v_rowcount = ROW_COUNT;
  IF v_rowcount = 0 THEN
    RAISE EXCEPTION 'complete_escalation_resolution_memory: finalize failed (concurrent update?)';
  END IF;

  RETURN v_mem_id;
END;
$$;

REVOKE ALL ON FUNCTION public.complete_escalation_resolution_memory(
  uuid, uuid, uuid, text, text, text, public.escalation_learning_outcome
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.complete_escalation_resolution_memory(
  uuid, uuid, uuid, text, text, text, public.escalation_learning_outcome
) TO service_role;

-- ── 3) Remove Slice 1 implicit scope trigger ──────────────────────────────
DROP TRIGGER IF EXISTS memories_scope_default_before_insert ON public.memories;

DROP FUNCTION IF EXISTS public.memories_scope_default_before_insert ();

-- ── 4) Close schema contract (V3 production memory scope plan §4) ──────────
ALTER TABLE public.memories
  ADD CONSTRAINT memories_scope_shape_check CHECK (
    (scope = 'project' AND wedding_id IS NOT NULL AND person_id IS NULL)
    OR (scope = 'person' AND person_id IS NOT NULL AND wedding_id IS NULL)
    OR (scope = 'studio' AND wedding_id IS NULL AND person_id IS NULL)
  );
