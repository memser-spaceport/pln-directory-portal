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

import { demoDays } from './fixtures/demo-days';
import { demoDayAdmins } from './fixtures/demoDayAdmins';
import { demoDayAdminScopes } from './fixtures/demoDayAdminScopes';
import { demoDayAdminRoleAssignments } from './fixtures/demoDayAdminRoleAssignments';

/**
 * Truncate all public tables (except _prisma_migrations) and reset identities.
 * Uses CASCADE to handle FK dependencies.
 */
async function resetAllTables() {
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

/**
 * Generic loader for fixtures with optional relation updates.
 * - Creates many (skipDuplicates)
 * - Then applies relation updates one-by-one (Prisma limitation)
 */
async function load(fixtures: Array<Record<string, any>>) {
  for (const fixture of fixtures) {
    const model = Object.keys(fixture)[0]; // e.g., 'MemberRole', 'Team', etc.
    const modelBlock = fixture[model];

    const fixturesValue = modelBlock?.fixtures ?? modelBlock;
    const fixturesToCreate =
      typeof fixturesValue === 'function'
        ? await fixturesValue().then((data: any[]) => Promise.all(data))
        : fixturesValue;

    const relationsToConnect = modelBlock?.relations
      ? await modelBlock.relations(fixturesToCreate).then((data: any[]) => Promise.all(data))
      : null;

    await prisma[model].createMany({
      data: fixturesToCreate,
      skipDuplicates: true,
    });
    console.log(`✅ Added ${model} data\n`);

    // Relation updates must be sent one-by-one
    if (!relationsToConnect) continue;
    for (const relation of relationsToConnect) {
      await prisma[camelCase(model)].update(relation);
    }
  }
}

/**
 * Assign DEMO_DAY_ADMIN role to demo day admin members.
 *
 * Prisma does not expose M:N join tables as models, so we use a raw insert
 * into the join table "_MemberToMemberRole".
 */
async function seedDemoDayAdminRoleAssignments() {
  console.log('=== Seed: demo day admin role assignments (start) ===');

  // Ensure DEMO_DAY_ADMIN role exists (idempotent)
  await prisma.memberRole.upsert({
    where: { name: 'DEMO_DAY_ADMIN' },
    update: {},
    create: {
      name: 'DEMO_DAY_ADMIN',
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  });

  for (const { memberUid, roleName } of demoDayAdminRoleAssignments) {
    // Insert into Prisma-generated join table between Member and MemberRole.
    // Default name is "_MemberToMemberRole" with columns "A" (Member.id) and "B" (MemberRole.id).
    await prisma.$executeRawUnsafe(`
      INSERT INTO "_MemberToMemberRole" ("A", "B")
      SELECT
        m."id",
        r."id"
      FROM "Member" m, "MemberRole" r
      WHERE m."uid" = '${memberUid}'
        AND r."name" = '${roleName}'
      ON CONFLICT ("A", "B") DO NOTHING;
    `);
  }

  console.log('=== Seed: demo day admin role assignments (done) ===');
}

async function main() {
  await resetAllTables();

  // Load core fixtures in a FK-safe order
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

    // Extra demo day–related fixtures
    { [Prisma.ModelName.Member]: { fixtures: demoDayAdmins } },
    { [Prisma.ModelName.MemberDemoDayAdminScope]: { fixtures: demoDayAdminScopes } },
    { [Prisma.ModelName.DemoDay]: { fixtures: demoDays } },
  ]);

  // After members + roles are created, assign DEMO_DAY_ADMIN role to demo day admins
  await seedDemoDayAdminRoleAssignments();
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
