-- TODO: Only apply this migration after generating the initial migration. 

-- Add unique index to make sure there's only main team per member:
CREATE UNIQUE INDEX only_one_main_team ON "TeamMemberRole" ("memberUid") WHERE "mainTeam" = TRUE;

-- Add function to verify if there's at least one main team of a member: 
CREATE OR REPLACE FUNCTION check_for_at_least_one_main_team ( IN uid TEXT ) RETURNS bool AS $$
  SELECT exists( SELECT * FROM "TeamMemberRole" WHERE "memberUid" = uid AND "mainTeam" IS TRUE );
$$ language sql;

-- Add function to set one main team in case a member has teams but has no main one:
CREATE OR REPLACE FUNCTION set_at_least_one_main_team() RETURNS TRIGGER AS
$BODY$
DECLARE
    member_uid text := COALESCE(NEW."memberUid", OLD."memberUid");
BEGIN
    IF NOT check_for_at_least_one_main_team(member_uid) THEN
      -- Grab the first team and set it as the main team:
      UPDATE "TeamMemberRole" SET "mainTeam" = TRUE WHERE id = (SELECT id FROM "TeamMemberRole" WHERE "memberUid" = member_uid ORDER BY id ASC LIMIT 1);
    END IF;
    RETURN NEW;
END;
$BODY$
LANGUAGE 'plpgsql';

-- Add trigger to check for the existence of a main team:
DROP TRIGGER IF EXISTS at_least_one_main_team ON "TeamMemberRole";
CREATE TRIGGER at_least_one_main_team
AFTER INSERT OR UPDATE OF "mainTeam" OR DELETE ON "TeamMemberRole"
FOR EACH ROW
EXECUTE FUNCTION set_at_least_one_main_team();


