import { Prisma } from '@prisma/client';
import camelCase from 'camelcase';
import { prisma } from './index';

import {
  membershipSources,
  fundingStages,
  imageRelations,
  industryCategories,
  industryTags,
  locations,
  memberRelations,
  members,
  originalImages,
  skills,
  teamMemberRoles,
  teamRelations,
  teams,
  technologies,
  memberRoles,
} from './fixtures';

/**
 * IMPORTANT: This is a quick & dirty solution until
 * we find the proper time to build a robust seeding mechanism.
 *
 * @param fixtures
 */
async function load(fixtures) {
  await prisma.$executeRawUnsafe(`
    DO
    $func$
    BEGIN
        EXECUTE
        (SELECT 'TRUNCATE TABLE ' || string_agg(oid::regclass::text, ', ') || ' RESTART IDENTITY CASCADE'
            FROM   pg_class
            WHERE  relkind = 'r'  -- only tables
            AND    relnamespace = 'public'::regnamespace
            AND    relname != '_prisma_migrations'
        );
    END
    $func$;
  `);
  console.log(`🔄 Reset all tables`);
  console.log('\r');

  for (const fixture of fixtures) {
    const model = Object.keys(fixture)[0];
    const fixturesValue = fixture[model]?.fixtures || fixture[model];
    const fixturesToCreate =
      typeof fixturesValue === 'function'
        ? await fixturesValue().then((data) => Promise.all(data))
        : fixturesValue;
    const relationsToConnect = fixture[model]?.relations
      ? await fixture[model]
          .relations(fixturesToCreate)
          .then((data) => Promise.all(data))
      : null;

    await prisma[camelCase(model)].createMany({
      data: fixturesToCreate,
    });
    console.log(`✅ Added ${model} data`);
    console.log('\r');

    // Due to Prisma limitation:
    // https://www.prisma.io/docs/concepts/components/prisma-client/relation-queries#create-multiple-records-and-multiple-related-records
    if (!relationsToConnect) continue;
    for (const relation of relationsToConnect) {
      await prisma[camelCase(model)].update(relation);
    }
    console.log(`✅ Updated ${model} with its relations`);
    console.log('\r');
  }
}

load([
  { [Prisma.ModelName.MemberRole]: memberRoles },
  { [Prisma.ModelName.Skill]: skills },
  { [Prisma.ModelName.FundingStage]: fundingStages },
  { [Prisma.ModelName.MembershipSource]: membershipSources },
  { [Prisma.ModelName.IndustryCategory]: industryCategories },
  { [Prisma.ModelName.IndustryTag]: industryTags },
  { [Prisma.ModelName.Location]: locations },
  { [Prisma.ModelName.Technology]: technologies },
  {
    [Prisma.ModelName.Image]: {
      fixtures: originalImages,
      relations: imageRelations,
    },
  },
  { [Prisma.ModelName.Team]: { fixtures: teams, relations: teamRelations } },
  {
    [Prisma.ModelName.Member]: {
      fixtures: members,
      relations: memberRelations,
    },
  },
  { [Prisma.ModelName.TeamMemberRole]: teamMemberRoles },
])
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
