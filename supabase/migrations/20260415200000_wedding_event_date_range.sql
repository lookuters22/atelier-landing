-- Optional multi-day window for wedding projects. `wedding_date` remains the canonical sort / workflow anchor
-- (typically ceremony day when known; else first day of the event window for multi-day inquiries).

ALTER TABLE public.weddings
  ADD COLUMN IF NOT EXISTS event_start_date TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS event_end_date TIMESTAMPTZ NULL;

COMMENT ON COLUMN public.weddings.event_start_date IS 'First calendar day of multi-day festivities (optional).';
COMMENT ON COLUMN public.weddings.event_end_date IS 'Last calendar day of multi-day festivities (optional).';
