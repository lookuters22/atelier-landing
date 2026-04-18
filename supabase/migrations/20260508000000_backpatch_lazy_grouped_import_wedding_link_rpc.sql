-- ---------------------------------------------------------------------------
-- Atomic backpatch for lazy grouped Gmail-import wedding linkage.
--
-- Why:
--   The lazy grouped-approval worker can materialize the FIRST non-suppressed
--   candidate of a batch BEFORE `ensureBatchWeddingForGroup` claims a wedding
--   id. That candidate's row state is then briefly:
--     - `threads.wedding_id            = NULL`
--     - `threads.ai_routing_metadata`   without `materialized_wedding_id`
--     - `import_candidates.import_provenance` without `materialized_wedding_id`
--
--   Once the lazy wedding is created, all three surfaces must be patched up
--   together. Doing this in two separate Edge updates left a real failure
--   window where the relational link could be set while the candidate
--   provenance JSON stayed stale (split-brain audit state). This RPC closes
--   that window by performing the merge + write inside ONE transaction:
--   either every surface ends up coherent or NOTHING is committed.
--
-- Merge contract (must match `mergeLazyWeddingProvenance` in TS):
--   - Treat null / non-object JSON as `{}`.
--   - Add `materialized_wedding_id` only if absent (or empty string).
--   - Add `gmail_label_import_group_id` only if absent (or empty string).
--   - Never overwrite a pre-existing differing value (forensics-friendly:
--     leave the original in place — a real divergence should be investigated,
--     not silently rewritten).
--   - Preserve every other key, including `suppression`, source / thread ids,
--     and timestamps written by the materialize RPC.
--
-- Tenant + identity safety (authoritative DB boundary):
--   - Both row lookups are gated on `photographer_id = p_photographer_id`.
--   - The candidate lookup ALSO requires
--       `materialized_thread_id     = p_thread_id`
--     AND
--       `gmail_label_import_group_id = p_gmail_label_import_group_id`
--     so a same-tenant but mismatched candidate/thread/group triple cannot
--     be backpatched. Atomicity alone is not enough — this RPC is the
--     authoritative integrity gate for the lazy backpatch path.
--   - `FOR UPDATE` locks both rows for the duration of the transaction so a
--     concurrent backpatch / chunk-retry cannot race-mutate the same JSON.
--   - Service-role only.
--
-- Lazy-path expectations (why we are strict about nulls here):
--   - This RPC is only called by `processGmailLabelGroupApproval.ts` AFTER
--     `materializeGmailImportCandidate(...)` returned with
--     `result.finalizedCore === true`, which means the materialize-new-thread
--     RPC has already set `import_candidates.materialized_thread_id` to the
--     just-created thread id.
--   - Grouped candidates are inserted with their
--     `gmail_label_import_group_id` set by the staging pipeline; by the time
--     we reach this backpatch the column is non-null.
--   - Therefore null / missing values for either column are treated as
--     mismatches and fail loud rather than silently.
--
-- Failure modes (all roll back atomically):
--   - null arg                              → 'null argument'
--   - empty wedding id                      → 'invalid_wedding_id'
--   - thread missing or tenant mismatch     → 'thread_not_found'
--   - candidate missing OR tenant mismatch
--     OR materialized_thread_id mismatch
--     OR gmail_label_import_group_id mismatch
--                                           → 'candidate_not_linked_to_expected_thread_or_group'
--   - any update affects 0 rows             → '..._update_no_rows'
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.backpatch_lazy_grouped_import_wedding_link(
  p_photographer_id uuid,
  p_thread_id uuid,
  p_import_candidate_id uuid,
  p_gmail_label_import_group_id uuid,
  p_wedding_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_thread_meta jsonb;
  v_cand_prov  jsonb;
  v_wedding_id_text text := p_wedding_id::text;
  v_group_id_text   text := p_gmail_label_import_group_id::text;
  v_existing_wedding text;
  v_existing_group   text;
  v_n int;
BEGIN
  -- Tenant + arg sanity ----------------------------------------------------
  IF p_photographer_id IS NULL OR p_thread_id IS NULL
     OR p_import_candidate_id IS NULL OR p_gmail_label_import_group_id IS NULL
     OR p_wedding_id IS NULL THEN
    RAISE EXCEPTION 'backpatch_lazy_grouped_import_wedding_link: null argument';
  END IF;

  IF v_wedding_id_text IS NULL OR length(v_wedding_id_text) = 0 THEN
    RAISE EXCEPTION 'backpatch_lazy_grouped_import_wedding_link: invalid_wedding_id';
  END IF;

  -- Lock + load current thread metadata ------------------------------------
  SELECT t.ai_routing_metadata
    INTO v_thread_meta
  FROM public.threads t
  WHERE t.id = p_thread_id
    AND t.photographer_id = p_photographer_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'backpatch_lazy_grouped_import_wedding_link: thread_not_found';
  END IF;

  -- Lock + load current candidate provenance -------------------------------
  -- Identity gate: the candidate must already be materialized onto the
  -- exact `p_thread_id` AND tagged with the exact
  -- `p_gmail_label_import_group_id`. Same-tenant but mismatched triples
  -- (different group, different thread) MUST NOT be backpatched even though
  -- the photographer_id alone would let them through. This is what makes
  -- the RPC authoritative about row identity, not just atomicity.
  --
  -- Combined into one predicate so we either lock the right row or raise
  -- a single, specific mismatch error — there is no narrow window where
  -- the candidate could be locked but not validated.
  SELECT ic.import_provenance
    INTO v_cand_prov
  FROM public.import_candidates ic
  WHERE ic.id = p_import_candidate_id
    AND ic.photographer_id = p_photographer_id
    AND ic.materialized_thread_id = p_thread_id
    AND ic.gmail_label_import_group_id = p_gmail_label_import_group_id
  FOR UPDATE;

  IF NOT FOUND THEN
    -- Distinguish "row genuinely missing" from "row exists but wrong link"
    -- so observability can route the two failure modes separately.
    PERFORM 1
    FROM public.import_candidates ic
    WHERE ic.id = p_import_candidate_id
      AND ic.photographer_id = p_photographer_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'backpatch_lazy_grouped_import_wedding_link: candidate_not_found';
    ELSE
      RAISE EXCEPTION 'backpatch_lazy_grouped_import_wedding_link: candidate_not_linked_to_expected_thread_or_group';
    END IF;
  END IF;

  -- Coerce null / non-object JSON to {}. `jsonb_typeof` returns 'object',
  -- 'array', 'string', 'number', 'boolean', 'null' (text 'null' for SQL
  -- NULL is impossible — that returns NULL itself). Anything that is not
  -- an object is reduced to an empty object so downstream merge stays safe.
  IF v_thread_meta IS NULL OR jsonb_typeof(v_thread_meta) <> 'object' THEN
    v_thread_meta := '{}'::jsonb;
  END IF;
  IF v_cand_prov IS NULL OR jsonb_typeof(v_cand_prov) <> 'object' THEN
    v_cand_prov := '{}'::jsonb;
  END IF;

  ----------------------------------------------------------------------------
  -- Merge: thread.ai_routing_metadata
  ----------------------------------------------------------------------------
  v_existing_wedding := v_thread_meta->>'materialized_wedding_id';
  IF v_existing_wedding IS NULL OR length(v_existing_wedding) = 0 THEN
    v_thread_meta := jsonb_set(
      v_thread_meta,
      '{materialized_wedding_id}',
      to_jsonb(v_wedding_id_text),
      true
    );
  END IF;

  v_existing_group := v_thread_meta->>'gmail_label_import_group_id';
  IF v_existing_group IS NULL OR length(v_existing_group) = 0 THEN
    v_thread_meta := jsonb_set(
      v_thread_meta,
      '{gmail_label_import_group_id}',
      to_jsonb(v_group_id_text),
      true
    );
  END IF;

  ----------------------------------------------------------------------------
  -- Merge: import_candidates.import_provenance
  ----------------------------------------------------------------------------
  v_existing_wedding := v_cand_prov->>'materialized_wedding_id';
  IF v_existing_wedding IS NULL OR length(v_existing_wedding) = 0 THEN
    v_cand_prov := jsonb_set(
      v_cand_prov,
      '{materialized_wedding_id}',
      to_jsonb(v_wedding_id_text),
      true
    );
  END IF;

  v_existing_group := v_cand_prov->>'gmail_label_import_group_id';
  IF v_existing_group IS NULL OR length(v_existing_group) = 0 THEN
    v_cand_prov := jsonb_set(
      v_cand_prov,
      '{gmail_label_import_group_id}',
      to_jsonb(v_group_id_text),
      true
    );
  END IF;

  ----------------------------------------------------------------------------
  -- Atomic three-surface write. Both UPDATEs happen in this transaction;
  -- if either raises, Postgres rolls back BOTH (and the merged JSON
  -- computed above is discarded). No partial state can leak.
  ----------------------------------------------------------------------------
  -- `threads` has no `updated_at` column in this schema; the
  -- materialize-RPC tracks freshness via `last_activity_at` on insert and
  -- callers update that explicitly when relevant. The lazy backpatch is a
  -- linkage repair only and intentionally does not bump activity.
  UPDATE public.threads t
  SET
    wedding_id          = p_wedding_id,
    ai_routing_metadata = v_thread_meta
  WHERE t.id = p_thread_id
    AND t.photographer_id = p_photographer_id;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'backpatch_lazy_grouped_import_wedding_link: thread_update_no_rows';
  END IF;

  -- The same identity predicate is repeated on the UPDATE for defense in
  -- depth. The row is already locked `FOR UPDATE` above, so in practice
  -- this is a no-op, but it guarantees we cannot accidentally widen the
  -- write predicate in a future refactor and silently re-introduce the
  -- weaker `id + photographer_id` check.
  UPDATE public.import_candidates ic
  SET
    import_provenance = v_cand_prov,
    updated_at        = now()
  WHERE ic.id = p_import_candidate_id
    AND ic.photographer_id = p_photographer_id
    AND ic.materialized_thread_id = p_thread_id
    AND ic.gmail_label_import_group_id = p_gmail_label_import_group_id;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'backpatch_lazy_grouped_import_wedding_link: candidate_update_no_rows';
  END IF;
END;
$$;

COMMENT ON FUNCTION public.backpatch_lazy_grouped_import_wedding_link IS
  'Service-role: atomically patches threads.wedding_id, threads.ai_routing_metadata, and import_candidates.import_provenance with the lazy batch wedding id. Authoritative DB boundary for both atomicity AND row identity: candidate must already be materialized onto the exact thread and tagged with the exact gmail_label_import_group_id, otherwise raises candidate_not_linked_to_expected_thread_or_group. Non-clobbering merge for materialized_wedding_id and gmail_label_import_group_id. Single transaction = no split-brain partial backpatch.';

REVOKE ALL ON FUNCTION public.backpatch_lazy_grouped_import_wedding_link(
  uuid, uuid, uuid, uuid, uuid
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.backpatch_lazy_grouped_import_wedding_link(
  uuid, uuid, uuid, uuid, uuid
) TO service_role;
