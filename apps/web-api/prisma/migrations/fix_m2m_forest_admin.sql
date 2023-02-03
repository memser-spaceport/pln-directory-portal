/*
  This is a fix for an issue with Forest Admin that requires a primary key on m2m junction tables.

  Prisma unfortunately doesn't allow primary keys on implicit m2m relations:
  https://www.prisma.io/docs/concepts/components/prisma-schema/relations/many-to-many-relations#implicit-many-to-many-relations

  IMPORTANT:
  Everytime a new (implicit) m2m relation gets added on the Prisma schema 
  file don't forget to add the primary key constraint below.

  Also, these changes shouldn't be applied on a local environment 
  as it could easily lead to a new prisma migration being 
  generated that reverts these changes.
*/

ALTER TABLE "_MemberToSkill" DROP CONSTRAINT IF EXISTS "_MemberToSkill_B_primary";
ALTER TABLE "_MemberToSkill"
ADD CONSTRAINT "_MemberToSkill_AB_primary"
PRIMARY KEY("A", "B");

ALTER TABLE "_IndustryTagToTeam" DROP CONSTRAINT IF EXISTS "_IndustryTagToTeam_B_primary";
ALTER TABLE "_IndustryTagToTeam"
ADD CONSTRAINT "_IndustryTagToTeam_AB_primary"
PRIMARY KEY("A", "B");

ALTER TABLE "_MembershipSourceToTeam" DROP CONSTRAINT IF EXISTS "_MembershipSourceToTeam_B_primary";
ALTER TABLE "_MembershipSourceToTeam"
ADD CONSTRAINT "_MembershipSourceToTeam_AB_primary"
PRIMARY KEY("A", "B");

ALTER TABLE "_TeamToTechnology" DROP CONSTRAINT IF EXISTS "_TeamToTechnology_B_primary";
ALTER TABLE "_TeamToTechnology"
ADD CONSTRAINT "_TeamToTechnology_AB_primary"
PRIMARY KEY("A", "B");
