-- Member signal log backfill (LAB-3121): one row for each stored follow, news upvote, news like, news comment,
-- job interest, saved job, team interest and office hours booking intent (SCHEDULE_MEETING with a target member).
--
-- Same rules as the live writer (apps/web-api/src/member-signals):
--   * bots (signUpSource 'system-trending-seed') and test accounts (@yopmail.com) add no rows
--     (member-exclusion.ts, TEST_ACCOUNT_EMAIL_DOMAINS);
--   * own: the entity is the member, a team the member has or had a role on, a news item the member posted or of
--     one of their teams, or a job of one of their teams (member-signal-ownership.ts).
-- Each row keeps the source record's createdAt and sourceKey 'backfill:<table>:<uid>'. Records created at or after
-- the first live row of the same action are skipped, because the live writer logged them. Re-runnable: conflicts on
-- sourceKey are ignored.
WITH "Source" AS (
    SELECT 'Follow' AS "tbl", 'follow' AS "action", f."uid" AS "recordUid", f."memberUid",
           f."entityType"::text AS "entityType", f."entityUid", f."createdAt"
    FROM "Follow" f
    UNION ALL
    SELECT 'TeamNewsUpvote', 'news-upvote', u."uid", u."memberUid", 'NEWS_ITEM', u."newsItemUid", u."createdAt"
    FROM "TeamNewsUpvote" u
    UNION ALL
    SELECT 'FeedNewsLike', 'news-like', l."uid", l."memberUid", 'NEWS_ITEM', l."newsItemUid", l."createdAt"
    FROM "FeedNewsLike" l
    UNION ALL
    SELECT 'FeedComment', 'news-comment', c."uid", c."authorUid", 'NEWS_ITEM', c."newsItemUid", c."createdAt"
    FROM "FeedComment" c
    UNION ALL
    SELECT 'JobOpeningInterest', 'job-interest', i."uid", i."memberUid", 'JOB_OPENING', i."jobOpeningUid", i."createdAt"
    FROM "JobOpeningInterest" i
    UNION ALL
    SELECT 'SavedJobOpening', 'job-saved', s."uid", s."memberUid", 'JOB_OPENING', s."jobOpeningUid", s."createdAt"
    FROM "SavedJobOpening" s
    UNION ALL
    SELECT 'TeamInterest', 'team-interest', t."uid", t."memberUid", 'TEAM', t."teamUid", t."createdAt"
    FROM "TeamInterest" t
    UNION ALL
    SELECT 'MemberInteraction', 'office-hours-booking-intent', mi."uid", mi."sourceMemberUid", 'MEMBER',
           mi."targetMemberUid", mi."createdAt"
    FROM "MemberInteraction" mi
    WHERE mi."type" = 'SCHEDULE_MEETING' AND mi."targetMemberUid" IS NOT NULL
)
INSERT INTO "MemberSignal" ("uid", "memberUid", "action", "entityType", "entityUid", "own", "sourceKey", "createdAt")
SELECT md5('backfill:' || src."tbl" || ':' || src."recordUid"),
       src."memberUid",
       src."action",
       src."entityType",
       src."entityUid",
       CASE src."entityType"
           WHEN 'MEMBER' THEN src."entityUid" = src."memberUid"
           WHEN 'TEAM' THEN EXISTS (
               SELECT 1 FROM "TeamMemberRole" r
               WHERE r."memberUid" = src."memberUid" AND r."teamUid" = src."entityUid")
           WHEN 'NEWS_ITEM' THEN EXISTS (
               SELECT 1 FROM "TeamNewsItem" n
               WHERE n."uid" = src."entityUid"
                 AND (n."postedByMemberUid" = src."memberUid"
                      OR EXISTS (SELECT 1 FROM "TeamMemberRole" r
                                 WHERE r."memberUid" = src."memberUid" AND r."teamUid" = n."teamUid")))
           WHEN 'JOB_OPENING' THEN EXISTS (
               SELECT 1 FROM "JobOpening" j
               JOIN "TeamMemberRole" r ON r."teamUid" = j."teamUid" AND r."memberUid" = src."memberUid"
               WHERE j."uid" = src."entityUid")
           ELSE false
       END,
       'backfill:' || src."tbl" || ':' || src."recordUid",
       src."createdAt"
FROM "Source" src
JOIN "Member" m ON m."uid" = src."memberUid"
WHERE (m."signUpSource" IS NULL OR m."signUpSource" <> 'system-trending-seed')
  AND (m."email" IS NULL OR lower(trim(split_part(m."email", '@', 2))) <> 'yopmail.com')
  AND NOT EXISTS (
      SELECT 1 FROM "MemberSignal" live
      WHERE live."sourceKey" IS NULL AND live."action" = src."action" AND live."createdAt" <= src."createdAt")
ON CONFLICT ("sourceKey") DO NOTHING;
