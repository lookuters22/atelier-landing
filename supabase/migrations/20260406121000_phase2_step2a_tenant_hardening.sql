-- Phase 2 Step 2A — tenant hardening: composite FKs where both sides carry photographer_id,
-- triggers for nullable / indirect refs, playbook_rules scope↔channel validity.
-- Additive only; does not modify prior migrations.

-- ── 1) Parent keys for composite FKs (id is globally unique; pair enforces tenant alignment)
ALTER TABLE public.people
  ADD CONSTRAINT people_photographer_id_id_key UNIQUE (photographer_id, id);

ALTER TABLE public.weddings
  ADD CONSTRAINT weddings_photographer_id_id_key UNIQUE (photographer_id, id);

ALTER TABLE public.threads
  ADD CONSTRAINT threads_photographer_id_id_key UNIQUE (photographer_id, id);

-- ── 2) playbook_rules: global ⇒ channel NULL; channel scope ⇒ channel NOT NULL
ALTER TABLE public.playbook_rules
  ADD CONSTRAINT playbook_rules_scope_channel_valid CHECK (
    (scope = 'global'::public.rule_scope AND channel IS NULL)
    OR (scope = 'channel'::public.rule_scope AND channel IS NOT NULL)
  );

-- ── 3) contact_points: person must belong to same photographer_id row
ALTER TABLE public.contact_points DROP CONSTRAINT contact_points_person_id_fkey;

ALTER TABLE public.contact_points
  ADD CONSTRAINT contact_points_tenant_person_fkey
  FOREIGN KEY (photographer_id, person_id)
  REFERENCES public.people (photographer_id, id)
  ON DELETE CASCADE;

-- ── 4) wedding_people: wedding and person must match row photographer_id
ALTER TABLE public.wedding_people DROP CONSTRAINT wedding_people_wedding_id_fkey;
ALTER TABLE public.wedding_people DROP CONSTRAINT wedding_people_person_id_fkey;

ALTER TABLE public.wedding_people
  ADD CONSTRAINT wedding_people_tenant_wedding_fkey
  FOREIGN KEY (photographer_id, wedding_id)
  REFERENCES public.weddings (photographer_id, id)
  ON DELETE CASCADE;

ALTER TABLE public.wedding_people
  ADD CONSTRAINT wedding_people_tenant_person_fkey
  FOREIGN KEY (photographer_id, person_id)
  REFERENCES public.people (photographer_id, id)
  ON DELETE CASCADE;

-- ── 5) thread_weddings: thread and wedding must match row photographer_id
ALTER TABLE public.thread_weddings DROP CONSTRAINT thread_weddings_thread_id_fkey;
ALTER TABLE public.thread_weddings DROP CONSTRAINT thread_weddings_wedding_id_fkey;

ALTER TABLE public.thread_weddings
  ADD CONSTRAINT thread_weddings_tenant_thread_fkey
  FOREIGN KEY (photographer_id, thread_id)
  REFERENCES public.threads (photographer_id, id)
  ON DELETE CASCADE;

ALTER TABLE public.thread_weddings
  ADD CONSTRAINT thread_weddings_tenant_wedding_fkey
  FOREIGN KEY (photographer_id, wedding_id)
  REFERENCES public.weddings (photographer_id, id)
  ON DELETE CASCADE;

-- ── 6) thread_participants: thread and person must match row photographer_id
ALTER TABLE public.thread_participants DROP CONSTRAINT thread_participants_thread_id_fkey;
ALTER TABLE public.thread_participants DROP CONSTRAINT thread_participants_person_id_fkey;

ALTER TABLE public.thread_participants
  ADD CONSTRAINT thread_participants_tenant_thread_fkey
  FOREIGN KEY (photographer_id, thread_id)
  REFERENCES public.threads (photographer_id, id)
  ON DELETE CASCADE;

ALTER TABLE public.thread_participants
  ADD CONSTRAINT thread_participants_tenant_person_fkey
  FOREIGN KEY (photographer_id, person_id)
  REFERENCES public.people (photographer_id, id)
  ON DELETE CASCADE;

-- ── 7) Nullable / indirect FKs: keep single-column FKs for ON DELETE SET NULL behavior;
--    enforce tenant alignment with triggers (composite SET NULL would null photographer_id).

CREATE OR REPLACE FUNCTION public.enforce_escalation_requests_tenant_refs()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.wedding_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.weddings w
      WHERE w.id = NEW.wedding_id AND w.photographer_id = NEW.photographer_id
    ) THEN
      RAISE EXCEPTION 'escalation_requests: wedding_id does not match photographer_id';
    END IF;
  END IF;

  IF NEW.thread_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.threads t
      WHERE t.id = NEW.thread_id AND t.photographer_id = NEW.photographer_id
    ) THEN
      RAISE EXCEPTION 'escalation_requests: thread_id does not match photographer_id';
    END IF;
  END IF;

  IF NEW.playbook_rule_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.playbook_rules pr
      WHERE pr.id = NEW.playbook_rule_id AND pr.photographer_id = NEW.photographer_id
    ) THEN
      RAISE EXCEPTION 'escalation_requests: playbook_rule_id does not match photographer_id';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_escalation_requests_tenant_refs
  BEFORE INSERT OR UPDATE OF wedding_id, thread_id, playbook_rule_id, photographer_id
  ON public.escalation_requests
  FOR EACH ROW
  EXECUTE PROCEDURE public.enforce_escalation_requests_tenant_refs();

CREATE OR REPLACE FUNCTION public.enforce_documents_wedding_tenant()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.wedding_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.weddings w
      WHERE w.id = NEW.wedding_id AND w.photographer_id = NEW.photographer_id
    ) THEN
      RAISE EXCEPTION 'documents: wedding_id does not match photographer_id';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_documents_wedding_tenant
  BEFORE INSERT OR UPDATE OF wedding_id, photographer_id
  ON public.documents
  FOR EACH ROW
  EXECUTE PROCEDURE public.enforce_documents_wedding_tenant();

-- messages.photographer_id arrives in Step 2B; align via thread until then.
CREATE OR REPLACE FUNCTION public.enforce_message_attachments_message_tenant()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.messages m
    INNER JOIN public.threads t ON t.id = m.thread_id
    WHERE m.id = NEW.message_id
      AND t.photographer_id = NEW.photographer_id
  ) THEN
    RAISE EXCEPTION 'message_attachments: message does not belong to photographer_id (via thread)';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_message_attachments_message_tenant
  BEFORE INSERT OR UPDATE OF message_id, photographer_id
  ON public.message_attachments
  FOR EACH ROW
  EXECUTE PROCEDURE public.enforce_message_attachments_message_tenant();
