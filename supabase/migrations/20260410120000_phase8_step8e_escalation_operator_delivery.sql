-- Phase 8 Step 8E — operator escalation delivery policy (execute_v3.md).
-- urgent_now: push to WhatsApp immediately via triage worker.
-- batch_later: hold for digest (no immediate buzz).
-- dashboard_only: visible in app only (no WhatsApp).

CREATE TYPE public.escalation_operator_delivery AS ENUM (
  'urgent_now',
  'batch_later',
  'dashboard_only'
);

ALTER TABLE public.escalation_requests
  ADD COLUMN operator_delivery public.escalation_operator_delivery NOT NULL DEFAULT 'urgent_now';

COMMENT ON COLUMN public.escalation_requests.operator_delivery IS
  'How to surface this escalation: urgent WhatsApp, batched digest, or dashboard queue only (Step 8E).';
