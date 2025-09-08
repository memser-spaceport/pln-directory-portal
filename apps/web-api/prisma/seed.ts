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
  projects,
  projectRelations,
  eventLocations,
  events,
  eventGuests,
  focusAreas,
  teamFocusAreas,
  projectFocusAreas,
  discoveryQuestions,
} from './fixtures';

async function resetAllTables() {
  // Truncate all public tables (except _prisma_migrations) with CASCADE restart identity
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
  console.log('🔄 Reset all tables\n');
}

async function load(fixtures: Array<Record<string, any>>) {
  for (const fixture of fixtures) {
    const model = Object.keys(fixture)[0]; // e.g. 'MemberRole', 'Team', etc.
    const modelBlock = fixture[model];

    const fixturesValue = modelBlock?.fixtures ?? modelBlock;
    const fixturesToCreate =
      typeof fixturesValue === 'function'
        ? await fixturesValue().then((data) => Promise.all(data))
        : fixturesValue;

    const relationsToConnect = modelBlock?.relations
      ? await modelBlock.relations(fixturesToCreate).then((data) => Promise.all(data))
      : null;
    await prisma[model].createMany({
      data: fixturesToCreate,
      skipDuplicates: true,
    });
    console.log(`✅ Added ${model} data\n`);

    // Due to Prisma limitation:
    // https://www.prisma.io/docs/concepts/components/prisma-client/relation-queries#create-multiple-records-and-multiple-related-records
    if (!relationsToConnect) continue;

    // Prisma limitation: relation updates must be issued one-by-one
    for (const relation of relationsToConnect) {
      await prisma[camelCase(model)].update(relation);
    }
    console.log(`✅ Updated ${model} with its relations\n`);
  }
}

async function seedTeamFundraisingProfilesFromDb() {
  // Build TeamFundraisingProfile rows from actual DB teams to avoid FK issues.
  const dbTeams = await prisma.team.findMany({ select: { uid: true } });
  if (!dbTeams.length) {
    console.log('ℹ️ No teams found — skipping TeamFundraisingProfile seeding\n');
    return;
  }

  const now = new Date();
  const rows = dbTeams.map((t) => ({
    // Let Prisma default cuid() for uid
    teamUid: t.uid,
    focusAreaUid: null,
    fundingStageUid: null,
    onePagerUrl: null,
    videoUrl: null,
    status: 'DRAFT' as const, // default as DRAFT
    createdAt: now,
    updatedAt: now,
    lastModifiedBy: null,
  }));

  // Use delegate in camelCase to be 100% safe across Prisma versions
  await prisma.teamFundraisingProfile.createMany({
    data: rows,
    skipDuplicates: true,
  });

  console.log(`✅ Added TeamFundraisingProfile for ${rows.length} teams\n`);
}

async function main() {
  await resetAllTables();

  // Load your core fixtures in the correct order
  await load([
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
    { [Prisma.ModelName.Team]: { fixtures: teams, relations: teamRelations } }, // Teams FIRST
    {
      [Prisma.ModelName.Member]: {
        fixtures: members,
        relations: memberRelations,
      },
    },
    { [Prisma.ModelName.TeamMemberRole]: teamMemberRoles },
    {
      [Prisma.ModelName.Project]: {
        fixtures: projects,
        relations: projectRelations,
      },
    },
    { [Prisma.ModelName.PLEventLocation]: { fixtures: eventLocations } },
    { [Prisma.ModelName.PLEvent]: { fixtures: events } },
    { [Prisma.ModelName.PLEventGuest]: { fixtures: eventGuests } },
    { [Prisma.ModelName.FocusArea]: focusAreas },
    { [Prisma.ModelName.TeamFocusArea]: { fixtures: teamFocusAreas } },
    { [Prisma.ModelName.ProjectFocusArea]: { fixtures: projectFocusAreas } },
    { [Prisma.ModelName.DiscoveryQuestion]: { fixtures: discoveryQuestions } },
  ]);

  await seedTeamFundraisingProfilesFromDb();
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
