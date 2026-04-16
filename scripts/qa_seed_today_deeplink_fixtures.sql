-- =============================================================================
-- QA seed template: Today deep-link manual verification (inquiry, task, escalation)
-- NOT for production. Run in Supabase SQL editor with appropriate role.
-- Replace :PHOTOGRAPHER_ID, :WEDDING_ID with real UUIDs from your dev project.
-- WhatsApp must NOT be used to create inquiry data — use email/web-style threads only.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) Inquiry (unfiled thread): thread with wedding_id NULL, non-other kind, + message
-- -----------------------------------------------------------------------------
-- Example (adjust to your schema — threads may require photographer_id from later migrations):
/*
INSERT INTO threads (id, wedding_id, photographer_id, title, kind, last_activity_at)
VALUES (
  gen_random_uuid(),
  NULL,
  ':PHOTOGRAPHER_ID'::uuid,
  'QA Today unfiled inquiry (email)',
  'group',
  now()
)
RETURNING id;

INSERT INTO messages (thread_id, direction, sender, body, sent_at)
VALUES (
  '<THREAD_ID_FROM_ABOVE>'::uuid,
  'in',
  'client@example.com',
  'QA seed message for unfiled inquiry.',
  now()
);
*/

-- -----------------------------------------------------------------------------
-- 2) Open task (wedding-linked): appears in useTasks + Today
-- -----------------------------------------------------------------------------
/*
INSERT INTO tasks (photographer_id, wedding_id, title, due_date, status)
VALUES (
  ':PHOTOGRAPHER_ID'::uuid,
  ':WEDDING_ID'::uuid,
  'QA Today task — call planner',
  (now() + interval '1 day'),
  'open'
);
*/

-- -----------------------------------------------------------------------------
-- 3) Open escalation: escalation_requests status open
-- -----------------------------------------------------------------------------
-- Required columns depend on migrations; minimum includes decision_justification JSON, reason_code, operator_delivery.
/*
INSERT INTO escalation_requests (
  photographer_id,
  wedding_id,
  action_key,
  reason_code,
  decision_justification,
  question_body,
  status,
  operator_delivery
)
VALUES (
  ':PHOTOGRAPHER_ID'::uuid,
  ':WEDDING_ID'::uuid,
  'operator_blocked_action',
  'qa_seed',
  '{"qa": true}'::jsonb,
  'QA Today escalation — operator blocked (seed).',
  'open',
  'urgent_now'
);
*/
