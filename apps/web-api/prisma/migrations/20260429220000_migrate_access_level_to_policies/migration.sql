BEGIN;

-- Update MemberApproval state from accessLevel based on new rules:
-- L0 -> PENDING (no policy)
-- L1 -> VERIFIED (no policy)
-- L2/L3/L4 -> APPROVED (with corresponding policies)
-- L5/L6 -> APPROVED (with corresponding policies)
UPDATE "MemberApproval" ma
SET
  "state" = CASE
    WHEN m."accessLevel" = 'L0' THEN 'PENDING'::"MemberApprovalState"
    WHEN m."accessLevel" = 'L1' THEN 'VERIFIED'::"MemberApprovalState"
    WHEN m."accessLevel" IN ('L2', 'L3', 'L4', 'L5', 'L6') THEN 'APPROVED'::"MemberApprovalState"
    ELSE ma."state"
  END,
  "reviewedAt" = CASE
    WHEN m."accessLevel" IN ('L1', 'L2', 'L3', 'L4', 'L5', 'L6') AND ma."reviewedAt" IS NULL THEN NOW()
    ELSE ma."reviewedAt"
  END,
  "updatedAt" = NOW()
FROM "Member" m
WHERE ma."memberUid" = m."uid"
  AND m."accessLevel" ~ '^L[0-9]+$';

-- Create MemberApproval records for members that don't have one
INSERT INTO "MemberApproval" (
  "uid",
  "memberUid",
  "state",
  "requestedByUid",
  "reviewedByUid",
  "reason",
  "requestedAt",
  "reviewedAt",
  "createdAt",
  "updatedAt"
)
SELECT
  md5(random()::text || clock_timestamp()::text || m."uid")::text,
  m."uid",
  CASE
    WHEN m."accessLevel" = 'L0' THEN 'PENDING'::"MemberApprovalState"
    WHEN m."accessLevel" = 'L1' THEN 'VERIFIED'::"MemberApprovalState"
    WHEN m."accessLevel" IN ('L2', 'L3', 'L4', 'L5', 'L6') THEN 'APPROVED'::"MemberApprovalState"
    ELSE 'PENDING'::"MemberApprovalState"
  END,
  m."uid",
  NULL,
  'Migrated from accessLevel',
  NOW(),
  CASE
    WHEN m."accessLevel" IN ('L1', 'L2', 'L3', 'L4', 'L5', 'L6') THEN NOW()
    ELSE NULL
  END,
  NOW(),
  NOW()
FROM "Member" m
WHERE m."accessLevel" ~ '^L[0-9]+$'
  AND NOT EXISTS (
    SELECT 1 FROM "MemberApproval" ma
    WHERE ma."memberUid" = m."uid"
  );

-- Create PolicyAssignments for L2 members (PLN Other / Unassigned)
INSERT INTO "PolicyAssignment" (
  "uid",
  "memberUid",
  "policyUid",
  "assignedByUid",
  "createdAt",
  "updatedAt"
)
SELECT
  md5(random()::text || clock_timestamp()::text || m."uid" || 'unassigned_pln_other')::text,
  m."uid",
  p."uid",
  NULL,
  NOW(),
  NOW()
FROM "Member" m
CROSS JOIN "Policy" p
WHERE m."accessLevel" = 'L2'
  AND p."code" = 'unassigned_pln_other'
  AND NOT EXISTS (
    SELECT 1 FROM "PolicyAssignment" pa
    WHERE pa."memberUid" = m."uid" AND pa."policyUid" = p."uid"
  );

-- Create PolicyAssignments for L3/L4 members (PLC Other / Unassigned)
INSERT INTO "PolicyAssignment" (
  "uid",
  "memberUid",
  "policyUid",
  "assignedByUid",
  "createdAt",
  "updatedAt"
)
SELECT
  md5(random()::text || clock_timestamp()::text || m."uid" || 'unassigned_plc_other')::text,
  m."uid",
  p."uid",
  NULL,
  NOW(),
  NOW()
FROM "Member" m
CROSS JOIN "Policy" p
WHERE m."accessLevel" IN ('L3', 'L4')
  AND p."code" = 'unassigned_plc_other'
  AND NOT EXISTS (
    SELECT 1 FROM "PolicyAssignment" pa
    WHERE pa."memberUid" = m."uid" AND pa."policyUid" = p."uid"
  );

-- Create PolicyAssignments for L5 members (PL / Investor)
INSERT INTO "PolicyAssignment" (
  "uid",
  "memberUid",
  "policyUid",
  "assignedByUid",
  "createdAt",
  "updatedAt"
)
SELECT
  md5(random()::text || clock_timestamp()::text || m."uid" || 'investor_pl')::text,
  m."uid",
  p."uid",
  NULL,
  NOW(),
  NOW()
FROM "Member" m
CROSS JOIN "Policy" p
WHERE m."accessLevel" = 'L5'
  AND p."code" = 'investor_pl'
  AND NOT EXISTS (
    SELECT 1 FROM "PolicyAssignment" pa
    WHERE pa."memberUid" = m."uid" AND pa."policyUid" = p."uid"
  );

-- Create PolicyAssignments for L6 members (PL / Investor + PLC Other / Unassigned)
INSERT INTO "PolicyAssignment" (
  "uid",
  "memberUid",
  "policyUid",
  "assignedByUid",
  "createdAt",
  "updatedAt"
)
SELECT
  md5(random()::text || clock_timestamp()::text || m."uid" || 'investor_pl')::text,
  m."uid",
  p."uid",
  NULL,
  NOW(),
  NOW()
FROM "Member" m
CROSS JOIN "Policy" p
WHERE m."accessLevel" = 'L6'
  AND p."code" = 'investor_pl'
  AND NOT EXISTS (
    SELECT 1 FROM "PolicyAssignment" pa
    WHERE pa."memberUid" = m."uid" AND pa."policyUid" = p."uid"
  );

INSERT INTO "PolicyAssignment" (
  "uid",
  "memberUid",
  "policyUid",
  "assignedByUid",
  "createdAt",
  "updatedAt"
)
SELECT
  md5(random()::text || clock_timestamp()::text || m."uid" || 'unassigned_plc_other')::text,
  m."uid",
  p."uid",
  NULL,
  NOW(),
  NOW()
FROM "Member" m
CROSS JOIN "Policy" p
WHERE m."accessLevel" = 'L6'
  AND p."code" = 'unassigned_plc_other'
  AND NOT EXISTS (
    SELECT 1 FROM "PolicyAssignment" pa
    WHERE pa."memberUid" = m."uid" AND pa."policyUid" = p."uid"
  );

COMMIT;
