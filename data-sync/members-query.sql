/*
  Build a custom Member model (query results)
  with roles, skills, teams and location
*/
SELECT
  MEMBER.*,
  location.continent,
  location.country,
  location.region,
  location.city,
  location."metroArea",
  roles."listOfRoles",
  skills."listOfSkills",
  teams."listOfTeams",
  -- Get member's team lead status
  (SELECT EXISTS (SELECT id FROM PUBLIC."TeamMemberRole" WHERE "teamLead" IS TRUE AND "memberUid" = MEMBER.uid)) AS teamLead
FROM
  PUBLIC."Member" AS MEMBER

  -- Get member's locations into mapped fields
  LEFT JOIN PUBLIC."Location" AS location ON location.uid = MEMBER."locationUid"

  -- Get member's roles into a comma separated list
  LEFT JOIN (
    SELECT
      "memberUid",
      STRING_AGG(role, ', ') AS "listOfRoles"
    FROM PUBLIC."TeamMemberRole" GROUP BY "memberUid"
  ) AS roles ON roles."memberUid" = MEMBER.uid

  -- Get member's teams in a comma separated list:
  LEFT JOIN (
    SELECT "memberUid", ARRAY_REMOVE(ARRAY_AGG(team.name), NULL) AS "listOfTeams"
    FROM PUBLIC."TeamMemberRole"
    JOIN PUBLIC."Team" AS team ON team.uid = "teamUid"
    GROUP BY "memberUid"
  ) AS teams ON teams."memberUid" = MEMBER.uid

  -- Get member's skills in a comma separated list:
  LEFT JOIN (
    SELECT
      skills."A" AS "memberId",
      STRING_AGG(skills.title, ', ') AS "listOfSkills"
    FROM
      (
        SELECT
          memberToSkill."A",
          memberToSkill."B",
          MEMBER.name,
          skill.title
        FROM
          PUBLIC."_MemberToSkill" memberToSkill
          JOIN "Member" AS MEMBER ON MEMBER.id = memberToSkill."A"
          JOIN "Skill" AS skill ON skill.id = memberToSkill."B"
      ) AS skills
    GROUP BY skills."A"
  ) AS skills ON skills."memberId" = MEMBER.id;
