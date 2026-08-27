-- Marker policy for members who signed up through the Job Board.
-- Assigned even when the member is PENDING; no permissions (label only).
-- Idempotent: ON CONFLICT DO NOTHING.

BEGIN;

INSERT INTO "Policy" ("uid", "code", "name", "description", "role", "group", "isSystem", "hidden", "createdAt", "updatedAt")
VALUES (
  'policy_job_aspirant',
  'job_aspirant',
  'Job Aspirant / Job Board',
  'Members who signed up through the Job Board. Marker only — no extra permissions.',
  'Job Aspirant',
  'Job Board',
  true,
  false,
  NOW(),
  NOW()
)
ON CONFLICT ("code") DO NOTHING;

COMMIT;
