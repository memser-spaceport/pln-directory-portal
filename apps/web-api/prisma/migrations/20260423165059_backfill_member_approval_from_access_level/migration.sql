BEGIN;

UPDATE "MemberApproval" ma
SET
  "state" = CASE
    WHEN m."accessLevel" ~ '^L[0-9]+$'
      AND CAST(SUBSTRING(m."accessLevel" FROM 2) AS INTEGER) = 0
      THEN 'PENDING'::"MemberApprovalState"
    WHEN m."accessLevel" ~ '^L[0-9]+$'
      AND CAST(SUBSTRING(m."accessLevel" FROM 2) AS INTEGER) >= 1
      THEN 'APPROVED'::"MemberApprovalState"
    WHEN UPPER(COALESCE(m."accessLevel", '')) = 'REJECTED'
      THEN 'REJECTED'::"MemberApprovalState"
    ELSE 'PENDING'::"MemberApprovalState"
  END,
  "reviewedAt" = CASE
    WHEN (
      m."accessLevel" ~ '^L[0-9]+$'
      AND CAST(SUBSTRING(m."accessLevel" FROM 2) AS INTEGER) >= 1
    ) OR UPPER(COALESCE(m."accessLevel", '')) = 'REJECTED'
      THEN COALESCE(ma."reviewedAt", NOW())
    ELSE NULL
  END,
  "updatedAt" = NOW(),
  "reason" = COALESCE(ma."reason", 'Backfilled from accessLevel')
FROM "Member" m
WHERE ma."memberUid" = m."uid";

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
    WHEN m."accessLevel" ~ '^L[0-9]+$'
      AND CAST(SUBSTRING(m."accessLevel" FROM 2) AS INTEGER) = 0
      THEN 'PENDING'::"MemberApprovalState"
    WHEN m."accessLevel" ~ '^L[0-9]+$'
      AND CAST(SUBSTRING(m."accessLevel" FROM 2) AS INTEGER) >= 1
      THEN 'APPROVED'::"MemberApprovalState"
    WHEN UPPER(COALESCE(m."accessLevel", '')) = 'REJECTED'
      THEN 'REJECTED'::"MemberApprovalState"
    ELSE 'PENDING'::"MemberApprovalState"
  END,
  m."uid",
  NULL,
  'Backfilled from accessLevel',
  NOW(),
  CASE
    WHEN (
      m."accessLevel" ~ '^L[0-9]+$'
      AND CAST(SUBSTRING(m."accessLevel" FROM 2) AS INTEGER) >= 1
    ) OR UPPER(COALESCE(m."accessLevel", '')) = 'REJECTED'
      THEN NOW()
    ELSE NULL
  END,
  NOW(),
  NOW()
FROM "Member" m
WHERE NOT EXISTS (
  SELECT 1
  FROM "MemberApproval" ma
  WHERE ma."memberUid" = m."uid"
);

COMMIT;
