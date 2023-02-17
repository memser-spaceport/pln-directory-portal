SELECT
  TEAM.*,
  fundingStage.title AS fundingStageTitle,
  tags."listOfTags",
  membershipSources."listOfMembershipSources"
FROM
  PUBLIC."Team" AS TEAM

  -- Get teams's funding stage into mapped fields
  LEFT JOIN PUBLIC."FundingStage" AS fundingStage ON fundingStage.uid = TEAM."fundingStageUid"

  -- Get teams' tags in a comma separated list:
  LEFT JOIN (
    SELECT
      tags."B" AS "teamId",
      STRING_AGG(tags.title, ', ') AS "listOfTags"
    FROM
      (
        SELECT
          tagToTeam."A",
          tagToTeam."B",
          TEAM.name,
          tag.title
        FROM
          PUBLIC."_IndustryTagToTeam" tagToTeam
          JOIN "Team" AS TEAM ON TEAM.id = tagToTeam."B"
          JOIN "IndustryTag" AS tag ON tag.id = tagToTeam."A"
      ) AS tags
    GROUP BY tags."B"
  ) AS tags ON tags."teamId" = TEAM.id

  -- Get teams' membership sources in a comma separated list:
  LEFT JOIN (
    SELECT
      membershipSources."B" AS "teamId",
      STRING_AGG(membershipSources.title, ', ') AS "listOfMembershipSources"
    FROM
      (
        SELECT
          membershipSourceToTeam."A",
          membershipSourceToTeam."B",
          TEAM.name,
          membershipSource.title
        FROM
          PUBLIC."_MembershipSourceToTeam" membershipSourceToTeam
          JOIN "Team" AS TEAM ON TEAM.id = membershipSourceToTeam."B"
          JOIN "MembershipSource" AS membershipSource ON membershipSource.id = membershipSourceToTeam."A"
      ) AS membershipSources
    GROUP BY membershipSources."B"
  ) AS membershipSources ON membershipSources."teamId" = TEAM.id

  -- Get teams' technologies into booleans:
  LEFT JOIN (
    SELECT
        id as "teamId",
        CASE WHEN (
            SELECT id
            FROM "Technology"
            WHERE title = 'IPFS'
            AND id IN (SELECT "B" FROM "_TeamToTechnology" as teamToTech WHERE teamToTech."A" = TEAM.id)
        ) IS NOT NULL THEN true ELSE false END AS "ipfsUser",
        CASE WHEN (
            SELECT id
            FROM "Technology"
            WHERE title = 'Filecoin'
            AND id IN (SELECT "B" FROM "_TeamToTechnology" as teamToTech WHERE teamToTech."A" = TEAM.id)
        ) IS NOT NULL THEN true ELSE false END AS "filecoinUser"
    FROM "Team" as TEAM
  ) AS technologies ON technologies."teamId" = TEAM.id;
