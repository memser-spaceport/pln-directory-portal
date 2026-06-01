-- Roadmap (Gantry) RBAC: aggregate "roadmap.admin" permission.
-- Granting roadmap.admin (via policy or direct member assignment) implies every
-- fine-grained roadmap permission. Expansion happens in the access-control service;
-- this migration just registers the permission so it can be assigned.
-- Idempotent — safe to re-run.

BEGIN;

WITH seed(uid, code, module, description) AS (
  VALUES
    ('roadmap.admin', 'roadmap.admin', 'Roadmap', 'Full roadmap access (implies all roadmap permissions)')
)
INSERT INTO "Permission" ("uid", "code", "module", "description", "createdAt", "updatedAt")
SELECT s.uid, s.code, s.module, s.description, NOW(), NOW()
FROM seed s
WHERE NOT EXISTS (
  SELECT 1 FROM "Permission" p WHERE p."code" = s.code
);

COMMIT;
