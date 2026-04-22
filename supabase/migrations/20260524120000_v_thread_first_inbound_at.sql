-- First client inbound per thread (MIN(sent_at) for direction=in) + thread/wedding context.
-- Used by operator assistant time-window inquiry counts only; not a full analytics surface.
-- (Version 20260523120000 was already used by memories_scope_slice3_check; this view is new.)

CREATE OR REPLACE VIEW public.v_thread_first_inbound_at
WITH (security_invoker = true) AS
SELECT
  t.photographer_id,
  t.id AS thread_id,
  t.wedding_id,
  t.kind,
  t.ai_routing_metadata,
  w.stage AS wedding_stage,
  fi.first_inbound_at
FROM public.threads t
INNER JOIN (
  SELECT
    m.thread_id,
    MIN(m.sent_at) AS first_inbound_at
  FROM public.messages m
  WHERE m.direction = 'in'::public.message_direction
  GROUP BY m.thread_id
) fi ON fi.thread_id = t.id
LEFT JOIN public.weddings w ON w.id = t.wedding_id;

COMMENT ON VIEW public.v_thread_first_inbound_at IS
  'G5: per-thread first inbound (direction=in) with wedding stage for pre-booking inquiry detection.';

GRANT SELECT ON public.v_thread_first_inbound_at TO authenticated;
GRANT SELECT ON public.v_thread_first_inbound_at TO service_role;
