-- Phase 9 Step 9A — learning outcome classification on answered escalations (execute_v3.md).

CREATE TYPE public.escalation_learning_outcome AS ENUM (
  'one_off_case',
  'reusable_playbook'
);

ALTER TABLE public.escalation_requests
  ADD COLUMN learning_outcome public.escalation_learning_outcome;

COMMENT ON COLUMN public.escalation_requests.learning_outcome IS
  'Set when the photographer answers: one-off case vs reusable global/channel playbook (Step 9A).';
