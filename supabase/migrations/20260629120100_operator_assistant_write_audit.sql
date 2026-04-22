-- P4: audit trail for operator-confirmed Ana (studio assistant) direct writes.
-- Inserts use the service role from edge functions. Authenticated users may SELECT own rows.
-- `undone_at` / `undone_by` are set by `undo-operator-assistant-write` for supported calendar operations only.

CREATE TABLE public.operator_assistant_write_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  photographer_id uuid NOT NULL REFERENCES public.photographers (id) ON DELETE CASCADE,
  source text NOT NULL DEFAULT 'operator_studio_assistant',
  operation text NOT NULL CHECK (operation IN (
    'task_create',
    'memory_create',
    'authorized_case_exception_create',
    'calendar_event_create',
    'calendar_event_reschedule',
    'playbook_rule_candidate_create'
  )),
  entity_table text NOT NULL,
  entity_id uuid NOT NULL,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  undone_at timestamptz,
  undone_by uuid REFERENCES public.photographers (id) ON DELETE SET NULL
);

CREATE INDEX operator_assistant_write_audit_photographer_created_at_idx
  ON public.operator_assistant_write_audit (photographer_id, created_at DESC);

CREATE INDEX operator_assistant_write_audit_entity_idx
  ON public.operator_assistant_write_audit (entity_table, entity_id);

ALTER TABLE public.operator_assistant_write_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY operator_assistant_write_audit_select_own
  ON public.operator_assistant_write_audit
  FOR SELECT
  TO authenticated
  USING (photographer_id = (select auth.uid()));

COMMENT ON TABLE public.operator_assistant_write_audit IS
  'Append-only audit for operator-confirmed studio-assistant writes; calendar_event_* rows may be reversed via undo-operator-assistant-write.';
