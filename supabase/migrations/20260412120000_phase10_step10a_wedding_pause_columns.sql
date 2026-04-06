-- Phase 10 Step 10A — wedding pause columns (`docs/v3/execute_v3.md`).
-- Idempotent: no-op when columns already exist (e.g. from 20260407120000_phase2_step2b).

ALTER TABLE public.weddings
  ADD COLUMN IF NOT EXISTS compassion_pause BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.weddings
  ADD COLUMN IF NOT EXISTS strategic_pause BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.weddings
  ADD COLUMN IF NOT EXISTS agency_cc_lock BOOLEAN NOT NULL DEFAULT false;
