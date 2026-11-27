-- LAB-3281: approval status, submitter, source and typed event fields on "PLEvent".
-- Every existing row is APPROVED (the column default). The typed fields are filled from
-- "additionalInfo"->'details' (stored by the events sync) and, where an event has no details, from "type".
CREATE TYPE "PLEventStatus" AS ENUM ('DRAFT', 'PENDING', 'APPROVED', 'REJECTED');

CREATE TYPE "PLEventFormat" AS ENUM ('IN_PERSON', 'VIRTUAL', 'HYBRID');

CREATE TYPE "PLEventAccess" AS ENUM ('OPEN', 'INVITE', 'PAID');

ALTER TABLE "PLEvent"
    ADD COLUMN "status" "PLEventStatus" NOT NULL DEFAULT 'APPROVED',
    ADD COLUMN "submitterUid" TEXT,
    ADD COLUMN "sourceTeamUid" TEXT,
    ADD COLUMN "reviewedAt" TIMESTAMP(3),
    ADD COLUMN "reviewNote" TEXT,
    ADD COLUMN "timezone" TEXT,
    ADD COLUMN "format" "PLEventFormat",
    ADD COLUMN "accessOption" "PLEventAccess",
    ADD COLUMN "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    ADD COLUMN "hostName" TEXT,
    ADD COLUMN "venueAddress" TEXT,
    ADD COLUMN "latitude" DOUBLE PRECISION,
    ADD COLUMN "longitude" DOUBLE PRECISION,
    ADD COLUMN "isAllDay" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN "registrationUrl" TEXT,
    ADD COLUMN "meetingUrl" TEXT;

ALTER TABLE "PLEvent" ADD CONSTRAINT "PLEvent_submitterUid_fkey" FOREIGN KEY ("submitterUid") REFERENCES "Member"("uid") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PLEvent" ADD CONSTRAINT "PLEvent_sourceTeamUid_fkey" FOREIGN KEY ("sourceTeamUid") REFERENCES "Team"("uid") ON DELETE SET NULL ON UPDATE CASCADE;

-- Format: the events service writes "IN-PERSON"; an event with no details falls back to its "type".
UPDATE "PLEvent" e
SET "format" = CASE
        WHEN d.format IN ('IN_PERSON', 'VIRTUAL', 'HYBRID') THEN d.format::"PLEventFormat"
        WHEN e."type" = 'VIRTUAL' THEN 'VIRTUAL'::"PLEventFormat"
        WHEN e."type" IN ('IN_PERSON', 'INVITE_ONLY') THEN 'IN_PERSON'::"PLEventFormat"
    END,
    "accessOption" = CASE
        WHEN d.access IN ('OPEN', 'INVITE', 'PAID') THEN d.access::"PLEventAccess"
        WHEN e."type" = 'INVITE_ONLY' THEN 'INVITE'::"PLEventAccess"
    END
FROM (
    SELECT "uid",
           replace(upper(btrim("additionalInfo" #>> '{details,format}')), '-', '_') AS format,
           upper(btrim("additionalInfo" #>> '{details,accessOption}')) AS access
    FROM "PLEvent"
) d
WHERE d."uid" = e."uid";

-- Host name.
UPDATE "PLEvent"
SET "hostName" = NULLIF(btrim("additionalInfo" #>> '{details,host,name}'), '')
WHERE jsonb_typeof("additionalInfo" #> '{details,host}') = 'object';

-- Tags: stored as objects ({ "name", "color" }) or plain strings; kept in order, without duplicates.
UPDATE "PLEvent" e
SET "tags" = t.names
FROM (
    SELECT p."uid",
           array_agg(x.name ORDER BY x.first_ord) AS names
    FROM "PLEvent" p
    CROSS JOIN LATERAL (
        SELECT name, min(ord) AS first_ord
        FROM (
            SELECT NULLIF(btrim(CASE jsonb_typeof(tag) WHEN 'object' THEN tag ->> 'name' WHEN 'string' THEN tag #>> '{}' END), '') AS name,
                   ord
            FROM jsonb_array_elements(p."additionalInfo" #> '{details,tags}') WITH ORDINALITY AS j(tag, ord)
        ) raw
        WHERE name IS NOT NULL
        GROUP BY name
    ) x
    WHERE jsonb_typeof(p."additionalInfo" #> '{details,tags}') = 'array'
    GROUP BY p."uid"
) t
WHERE t."uid" = e."uid";

-- Registration link: both sync paths store it as the "Registration" resource.
UPDATE "PLEvent" e
SET "registrationUrl" = r.link
FROM (
    SELECT DISTINCT ON (p."uid") p."uid", res ->> 'link' AS link
    FROM "PLEvent" p, unnest(p."resources") WITH ORDINALITY AS u(res, ord)
    WHERE res ->> 'name' = 'Registration' AND (res ->> 'link') ~* '^https?://'
    ORDER BY p."uid", ord
) r
WHERE r."uid" = e."uid";

CREATE UNIQUE INDEX "PLEvent_sourceTeamUid_externalId_key" ON "PLEvent"("sourceTeamUid", "externalId");

CREATE INDEX "PLEvent_status_isDeleted_startDate_idx" ON "PLEvent"("status", "isDeleted", "startDate");

CREATE INDEX "PLEvent_tags_idx" ON "PLEvent" USING GIN ("tags");
