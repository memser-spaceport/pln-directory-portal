import { Prisma } from '@prisma/client';
import camelCase from 'camelcase';
import { prisma } from './index';

// Thresholds for detecting non-seed data (seed creates ~33 members, ~44 teams)
const SEED_MEMBER_THRESHOLD = 10;
const SEED_TEAM_THRESHOLD = 10;

/**
 * Safety check to prevent accidental data loss on non-seed databases.
 * Blocks seeding if member or team count exceeds thresholds.
 *
 * Override with: SEED_FORCE=true yarn nx seed web-api
 */
async function checkDatabaseSafety(): Promise<void> {
  const forceFlag = process.env.SEED_FORCE === 'true';

  if (forceFlag) {
    console.log('⚠️  SEED_FORCE=true detected, skipping safety check\n');
    return;
  }

  const memberCount = await prisma.member.count();
  const teamCount = await prisma.team.count();

  // If counts exceed thresholds, this might be production data
  if (memberCount > SEED_MEMBER_THRESHOLD || teamCount > SEED_TEAM_THRESHOLD) {
    console.error('❌ SAFETY CHECK FAILED');
    console.error(`   Found ${memberCount} members and ${teamCount} teams`);
    console.error(`   Thresholds: ${SEED_MEMBER_THRESHOLD} members, ${SEED_TEAM_THRESHOLD} teams`);
    console.error('');
    console.error('   To force seeding (WILL DELETE ALL DATA), run:');
    console.error('   SEED_FORCE=true yarn nx seed web-api');
    console.error('');
    process.exit(1);
  }

  console.log(`✅ Safety check passed (${memberCount} members, ${teamCount} teams)\n`);
}

import {
  membershipSources,
  communityAffiliations,
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
import { demoDayAdmins, directoryAdmin } from './fixtures/demoDayAdmins';
import { demoDayAdminScopes } from './fixtures/demoDayAdminScopes';
import { adminRoleAssignments } from './fixtures/adminRoleAssignments';
import { irlGatheringPushConfigs } from './fixtures/irl-gathering-push-config';
import {
  irlGatheringPushCandidates,
  irlGatheringPushEventGuests,
  irlGatheringPushEventLocations,
  irlGatheringPushEvents,
} from './fixtures/irl-gathering-push-candidates';

// Demo Day fixtures
import { demoDayMembers } from './fixtures/demoDayMembers';
import { demoDayTeams } from './fixtures/demoDayTeams';
import { demoDayInvestorProfiles } from './fixtures/demoDayInvestorProfiles';
import { demoDayTeamFundraisingProfiles } from './fixtures/demoDayTeamFundraisingProfiles';
import { demoDayParticipants } from './fixtures/demoDayParticipants';
import { demoDayExpressInterestStats } from './fixtures/demoDayExpressInterestStats';
import { articles, articleStatistics, articleWhitelists } from './fixtures/articles';

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

    const sanitizedFixturesToCreate = fixturesToCreate.map((item: Record<string, any>) =>
      Object.fromEntries(
        Object.entries(item).filter(([_, value]) => value !== null)
      )
    );

    await prisma[model].createMany({
      data: sanitizedFixturesToCreate,
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
 * Assign admin roles to members (DEMO_DAY_ADMIN, DIRECTORY_ADMIN).
 */
async function seedAdminRoleAssignments() {
  console.log('=== Seed: admin role assignments (start) ===');

  for (const { memberUid, roleName } of adminRoleAssignments) {
    // Find the member and role to get their IDs
    const member = await prisma.member.findUnique({
      where: { uid: memberUid },
      select: { id: true, uid: true, name: true },
    });

    const role = await prisma.memberRole.findUnique({
      where: { name: roleName },
      select: { id: true, name: true },
    });

    if (!member) {
      console.error(`  ❌ Member not found: uid=${memberUid}`);
      continue;
    }

    if (!role) {
      console.error(`  ❌ Role not found: name=${roleName}`);
      continue;
    }

    // Insert into join table using the correct IDs
    await prisma.$executeRawUnsafe(`
      INSERT INTO "_MemberToMemberRole" ("A", "B")
      VALUES (${member.id}, ${role.id})
      ON CONFLICT ("A", "B") DO NOTHING;
    `);

    console.log(`  ✅ Assigned ${roleName} to ${member.name} (member.id=${member.id}, role.id=${role.id})`);
  }

  console.log('=== Seed: admin role assignments (done) ===');
}



async function seedArticleRequests() {
  console.log('=== Seed: article requests (start) ===');

  const articles = await prisma.article.findMany({
    take: 2,
    orderBy: { createdAt: 'asc' },
    select: { uid: true },
  });

  const members = await prisma.member.findMany({
    take: 2,
    orderBy: { createdAt: 'asc' },
    select: { uid: true },
  });

  const firstMember = members[0];
  const secondMember = members[1];
  const firstArticle = articles[0];
  const secondArticle = articles[1];

  if (!firstMember) {
    console.log('⚠️ Skipping article request seed: members not found');
    return;
  }

  const seedRows: Array<{
    articleUid?: string;
    title: string;
    description: string;
    requestedByUserUid: string;
  }> = [];

  if (firstArticle) {
    seedRows.push({
      articleUid: firstArticle.uid,
      title: 'Guide about raising a pre-seed round',
      description:
        'Would be helpful to have a practical guide with examples and common investor questions.',
      requestedByUserUid: firstMember.uid,
    });
  }

  if (secondMember && secondArticle) {
    seedRows.push({
      articleUid: secondArticle.uid,
      title: 'Guide about Delaware C-Corp setup',
      description:
        'Please add a founder guide covering incorporation flow, costs, and legal pitfalls.',
      requestedByUserUid: secondMember.uid,
    });
  }

  seedRows.push({
    title: 'Guide request without linked article',
    description: 'General request not attached to any existing article.',
    requestedByUserUid: firstMember.uid,
  });

  for (const row of seedRows) {
    if (row.articleUid) {
      await prisma.articleRequest.upsert({
        where: {
          articleUid_requestedByUserUid: {
            articleUid: row.articleUid,
            requestedByUserUid: row.requestedByUserUid,
          },
        },
        create: {
          articleUid: row.articleUid,
          title: row.title,
          description: row.description,
          requestedByUserUid: row.requestedByUserUid,
        },
        update: {
          title: row.title,
          description: row.description,
        },
      });
    } else {
      await prisma.articleRequest.create({
        data: {
          title: row.title,
          description: row.description,
          requestedByUserUid: row.requestedByUserUid,
        },
      });
    }
  }

  console.log(`✅ Added ${seedRows.length} article request records`);
  console.log('=== Seed: article requests (done) ===');
}


async function seedDealRequests() {
  console.log('=== Seed: deal requests (start) ===');

  const deals = await prisma.deal.findMany({
    take: 2,
    orderBy: { createdAt: 'asc' },
    select: { uid: true },
  });

  const members = await prisma.member.findMany({
    take: 2,
    orderBy: { createdAt: 'asc' },
    select: { uid: true },
  });

  if (!deals.length || !members.length) {
    console.log('⚠️  Skipping deal request seed: deals or members not found');
    return;
  }

  const seedRows = [
    {
      dealUid: deals[0].uid,
      description: 'Interested in this deal for our team. Please share activation details and current availability.',
      requestedByUserUid: members[0].uid,
      whatDealAreYouLookingFor: 'Vercel credits, Stripe discount, AI tools',
      howToReachOutToYou: 'telegram: @member1',
    },
    deals[1] && members[1]
      ? {
          dealUid: deals[1].uid,
          description: 'Would like to request access to this deal and understand the eligibility requirements.',
          requestedByUserUid: members[1].uid,
          whatDealAreYouLookingFor: 'Vercel credits, Stripe discount, AI tools',
          howToReachOutToYou: 'telegram: @member1',
        }
      : null,
  ].filter(Boolean) as Array<{ dealUid: string; description: string; requestedByUserUid: string; howToReachOutToYou: string; whatDealAreYouLookingFor: string }>;

  for (const row of seedRows) {
    await prisma.dealRequest.upsert({
      where: {
        dealUid_requestedByUserUid: {
          dealUid: row.dealUid,
          requestedByUserUid: row.requestedByUserUid,
        },
      },
      create: row,
      update: {
        description: row.description,
        whatDealAreYouLookingFor: row.whatDealAreYouLookingFor,
        howToReachOutToYou: row.howToReachOutToYou
      },
    });
  }

  console.log(`✅ Added ${seedRows.length} deal request records`);
  console.log('=== Seed: deal requests (done) ===');
}

async function main() {
  // Safety check to prevent accidental data loss
  await checkDatabaseSafety();

  await resetAllTables();

  // Load core fixtures in a FK-safe order
  await load([
    { [Prisma.ModelName.MemberRole]: memberRoles },
    { [Prisma.ModelName.Skill]: skills },
    { [Prisma.ModelName.FundingStage]: fundingStages },
    { [Prisma.ModelName.MembershipSource]: membershipSources },
    { [Prisma.ModelName.CommunityAffiliation]: communityAffiliations },
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
    { [Prisma.ModelName.Member]: { fixtures: [directoryAdmin] } },
    { [Prisma.ModelName.MemberDemoDayAdminScope]: { fixtures: demoDayAdminScopes } },
    { [Prisma.ModelName.DemoDay]: { fixtures: demoDays } },

    // Demo Day fixtures (must be after DemoDay, Member, and Team)
    { [Prisma.ModelName.Member]: { fixtures: demoDayMembers } },
    { [Prisma.ModelName.Team]: { fixtures: demoDayTeams } },
    { [Prisma.ModelName.InvestorProfile]: { fixtures: demoDayInvestorProfiles } },
    {
      [Prisma.ModelName.TeamFundraisingProfile]: {
        fixtures: demoDayTeamFundraisingProfiles,
      },
    },
    { [Prisma.ModelName.DemoDayParticipant]: { fixtures: demoDayParticipants } },
    {
      [Prisma.ModelName.DemoDayExpressInterestStatistic]: {
        fixtures: demoDayExpressInterestStats,
      },
    },

    { [Prisma.ModelName.IrlGatheringPushConfig]: { fixtures: irlGatheringPushConfigs } },
    { [Prisma.ModelName.PLEventLocation]: { fixtures: irlGatheringPushEventLocations } },
    { [Prisma.ModelName.PLEvent]: { fixtures: irlGatheringPushEvents } },
    { [Prisma.ModelName.PLEventGuest]: { fixtures: irlGatheringPushEventGuests } },
    { [Prisma.ModelName.IrlGatheringPushCandidate]: { fixtures: irlGatheringPushCandidates } },
  ]);

  // After members + roles are created, assign DEMO_DAY_ADMIN role to demo day admins
  await seedAdminRoleAssignments();
  await seedDealRequests();
  await seedArticleRequests();

  // Link InvestorProfiles to Members (update Member.investorProfileId)
  await linkInvestorProfilesToMembers();

  // DEALS_V1_SEED_MARKER
  const seedMember = await prisma.member.findFirst({
    select: { uid: true },
  });

  if (!seedMember) {
    throw new Error('No member found for deals seed');
  }

  await prisma.deal.createMany({
    data: [
      {
        uid: 'deal_vercel',
        vendorName: 'Vercel',
        category: 'Hosting & Infrastructure',
        audience: 'All Founders',
        shortDescription: 'Free Vercel credits for startups.',
        fullDescription: 'Seeded Vercel deal.',
        redemptionInstructions: 'Contact admin',
        status: 'ACTIVE',
      },
      {
        uid: 'deal_figma',
        vendorName: 'Figma',
        category: 'Design',
        audience: 'PL Funded Founders',
        shortDescription: 'Free Figma plan.',
        fullDescription: 'Seeded Figma deal.',
        redemptionInstructions: 'Contact admin',
        status: 'ACTIVE',
      },
    ],
    skipDuplicates: true,
  });

  await prisma.dealSubmission.createMany({
    data: [
      {
        uid: 'deal_submission_datadog',
        vendorName: 'Datadog',
        category: 'Monitoring',
        audience: 'All Founders',
        shortDescription: 'Free credits',
        fullDescription: 'Monitoring platform',
        redemptionInstructions: 'Apply',
        authorMemberUid: seedMember.uid,
        status: 'OPEN',
      },
      {
        uid: 'deal_submission_aws',
        vendorName: 'AWS',
        category: 'Cloud',
        audience: 'PL Funded Founders',
        shortDescription: 'AWS credits',
        fullDescription: 'Cloud credits',
        redemptionInstructions: 'Apply',
        authorMemberUid: seedMember.uid,
        status: 'APPROVED',
        reviewedByMemberUid: seedMember.uid,
        reviewedAt: new Date(),
      },
    ],
    skipDuplicates: true,
  });

  await prisma.dealIssue.createMany({
    data: [
      {
        uid: 'deal_issue_vercel_1',
        dealUid: 'deal_vercel',
        authorMemberUid: seedMember.uid,
        description: 'Promo code not working',
        status: 'OPEN',
      },
      {
        uid: 'deal_issue_vercel_2',
        dealUid: 'deal_vercel',
        authorMemberUid: seedMember.uid,
        description: 'Instructions outdated',
        status: 'RESOLVED',
        resolvedByMemberUid: seedMember.uid,
        resolvedAt: new Date(),
      },
    ],
    skipDuplicates: true,
  });

  await prisma.dealWhitelist.upsert({
    where: { memberUid: seedMember.uid },
    create: { memberUid: seedMember.uid },
    update: {},
  });

  await prisma.dealRequest.createMany({
    data: [
      {
        uid: 'deal_request_vercel_1',
        dealUid: 'deal_vercel',
        description: 'Please enable this deal for our team.',
        requestedByUserUid: seedMember.uid,
        requestedDate: new Date('2026-03-26T10:00:00.000Z'),
        howToReachOutToYou: 'test',
        whatDealAreYouLookingFor: 'test'
      },
      {
        uid: 'deal_request_figma_1',
        dealUid: 'deal_figma',
        description: 'We want access to the Figma offer.',
        requestedByUserUid: seedMember.uid,
        requestedDate: new Date('2026-03-26T11:00:00.000Z'),
        howToReachOutToYou: 'test',
        whatDealAreYouLookingFor: 'test'
      },
    ],
    skipDuplicates: true,
  });

  console.log('✅ Deals V1 seed added');

  // ARTICLES_SEED_MARKER
  const articleData = await articles();
  await prisma.article.createMany({
    data: articleData,
    skipDuplicates: true,
  });

  const articleStatData = await articleStatistics();
  await prisma.articleStatistic.createMany({
    data: articleStatData,
    skipDuplicates: true,
  });

  const articleWhitelistData = await articleWhitelists();
  for (const entry of articleWhitelistData) {
    await prisma.articleWhitelist.upsert({
      where: { memberUid: entry.memberUid },
      create: { memberUid: entry.memberUid },
      update: {},
    });
  }

  console.log('✅ Articles seed added');
}

/**
 * Link InvestorProfiles to Members by updating Member.investorProfileId.
 * This creates the bidirectional relationship between Member and InvestorProfile.
 */
async function linkInvestorProfilesToMembers() {
  console.log('=== Seed: linking investor profiles to members (start) ===');

  // Find all investor profiles that have a memberUid
  const investorProfiles = await prisma.investorProfile.findMany({
    where: { memberUid: { not: null } },
    select: { uid: true, memberUid: true },
  });

  for (const profile of investorProfiles) {
    if (!profile.memberUid) continue;

    await prisma.member.update({
      where: { uid: profile.memberUid },
      data: { investorProfileId: profile.uid },
    });

    console.log(`  ✅ Linked InvestorProfile ${profile.uid} to Member ${profile.memberUid}`);
  }

  console.log('=== Seed: linking investor profiles to members (done) ===');
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


// DEALS_V1_SEED_MARKER
// Optional seed examples:
// await prisma.deal.createMany({ data: [
//   {
//     vendorName: 'Vercel',
//     category: 'Hosting & Infrastructure',
//     audience: 'general',
//     shortDescription: 'Free Vercel Pro plan.',
//     fullDescription: 'V1 seeded deal.',
//     redemptionInstructions: 'Contact PL admin for test redemption.',
//     status: 'ACTIVE',
//   },
// ] });
// await prisma.dealWhitelist.upsert({
//   where: { memberUid: 'member_uid_here' },
//   create: { memberUid: 'member_uid_here' },
//   update: {},
// });
