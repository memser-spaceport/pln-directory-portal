BEGIN;

CREATE INDEX IF NOT EXISTS "idx_member_approval_member_uid_created_at"
  ON "MemberApproval" ("memberUid", "createdAt" DESC);

UPDATE "MemberApproval" ma
SET "state"      = CASE
                     WHEN m."accessLevel" ~ '^L[0-9]+$'
                       AND CAST(SUBSTRING(m."accessLevel" FROM 2) AS INTEGER) BETWEEN 0 AND 2
                       THEN 'PENDING'::"MemberApprovalState"
                     WHEN m."accessLevel" ~ '^L[0-9]+$'
                       AND CAST(SUBSTRING(m."accessLevel" FROM 2) AS INTEGER) >= 3
                       THEN 'APPROVED'::"MemberApprovalState"
                     WHEN UPPER(m."accessLevel") = 'REJECTED'
                       THEN 'REJECTED'::"MemberApprovalState"
                     ELSE 'PENDING'::"MemberApprovalState"
  END,
    "reviewedAt" = CASE
                     WHEN (
                            m."accessLevel" ~ '^L[0-9]+$'
                              AND CAST(SUBSTRING(m."accessLevel" FROM 2) AS INTEGER) >= 3
                            ) OR UPPER(m."accessLevel") = 'REJECTED'
                       THEN COALESCE(ma."reviewedAt", NOW())
                     ELSE ma."reviewedAt"
      END,
    "updatedAt"  = NOW()
FROM "Member" m
WHERE ma."memberUid" = m."uid";

INSERT INTO "MemberApproval" ("uid",
                              "memberUid",
                              "state",
                              "requestedByUid",
                              "reviewedByUid",
                              "reason",
                              "requestedAt",
                              "reviewedAt",
                              "createdAt",
                              "updatedAt")
SELECT md5(random()::text || clock_timestamp()::text || m."uid")::text,
       m."uid",
       CASE
         WHEN m."accessLevel" ~ '^L[0-9]+$'
           AND CAST(SUBSTRING(m."accessLevel" FROM 2) AS INTEGER) BETWEEN 0 AND 2
           THEN 'PENDING'::"MemberApprovalState"
         WHEN m."accessLevel" ~ '^L[0-9]+$'
           AND CAST(SUBSTRING(m."accessLevel" FROM 2) AS INTEGER) >= 3
           THEN 'APPROVED'::"MemberApprovalState"
         WHEN UPPER(m."accessLevel") = 'REJECTED'
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
                  AND CAST(SUBSTRING(m."accessLevel" FROM 2) AS INTEGER) >= 3
                ) OR UPPER(m."accessLevel") = 'REJECTED'
           THEN NOW()
         ELSE NULL
         END,
       NOW(),
       NOW()
FROM "Member" m
WHERE NOT EXISTS (SELECT 1
                  FROM "MemberApproval" ma
                  WHERE ma."memberUid" = m."uid");

COMMIT;
