// FEATURE-ENV ONLY — never merge (branch lab-2837-env-seed only).
import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { PrismaService } from '../shared/prisma.service';
import { currentRoleTextHash, isLiveOpening, MATCH_JOB_SELECT } from './job-match.logic';

/**
 * FEATURE-ENV ONLY — never merge. Lives on the unmerged branch `lab-2837-env-seed`, never on lab-2837/develop.
 *
 * Feature environments can't run real job matching (Claude calls need WIF, which their namespaces
 * lack), so on start this writes made-up but well-formed job-match results for one team, letting the
 * Suggested tab, Edit criteria, Contact and the weekly-email "new vs previous run" logic be tested.
 *
 * Runs when FEATURE_ENV_SEED_TEAM_UID is set (seed that team's live roles) and/or when BOTH
 * FEATURE_ENV_SEED_TEST_LEAD_EMAIL and FEATURE_ENV_SEED_TEST_CANDIDATE_EMAIL are set (seed a dedicated test
 * team whose members are those existing leads (comma-separated), with one role whose top suggestion is a test candidate — so the
 * weekly email can be sent to the developer's own inbox without touching any real team).
 * Idempotent: it owns two runs with fixed uids and fixed past run dates (so it never collides with a real daily
 * run) and rewrites their rows each start; the test team, role, candidate and lead membership are upserts.
 * It never writes NotificationSetting: the lead's suggested-candidates opt-out is left as it is.
 */
const SEED_RUN = 'env-seed-run';
const SEED_RUN_PREV = 'env-seed-run-prev';
const SEED_RUN_DATE = new Date('2000-01-05');
const SEED_RUN_PREV_DATE = new Date('2000-01-04');
const SUGGESTIONS = 5;
const IN_PREVIOUS_RUN = 2; // the first two suggestions also appear in the previous run, so three count as new

const TEST_TEAM_UID = 'env-seed-test-team';
const TEST_TEAM_NAME = 'Env Seed Test Team';
const TEST_ROLE_UID = 'env-seed-test-role';
const TEST_ROLE_TITLE = 'Senior Backend Engineer (test)';
const TEST_CANDIDATE_UID = 'env-seed-test-candidate';
const TEST_CANDIDATE_NAME = 'Test Candidate (env seed)';
const TEST_ROLE_DESCRIPTION_HTML =
  '<h2>About</h2><p>A made-up role seeded for feature-environment testing only. You would own backend services ' +
  'end to end, work with a small distributed team and write down the trade-offs behind your decisions.</p>';
/** Test role, previous run: ranks 4 and 5 only, so ranks 1–3 (the test candidate first) count as new. */
const TEST_PREVIOUS_INDEXES = [3, 4];

const LOOKABLE = {
  deletedAt: null,
  OR: [{ jobSearchStatus: null }, { jobSearchStatus: { not: 'NOT_LOOKING' as const } }],
};

type SeedRole = { uid: string; roleTitle: string; hash: string };
type RoleSeed = { teamUid: string; roles: SeedRole[]; members: { uid: string }[]; previousIndexes: number[] };

type SeedCriterion = {
  statement: string;
  label: string;
  group: 'Skills' | 'Experience' | 'Seniority' | 'Location' | 'Other';
};

const criteriaFor = (roleTitle: string): SeedCriterion[] => [
  {
    group: 'Skills',
    label: 'Core role skills',
    statement: `Shipped production work as a ${roleTitle} or a close equivalent`,
  },
  { group: 'Skills', label: 'Open-source work', statement: 'Has worked on an open-source or protocol project' },
  {
    group: 'Experience',
    label: 'End-to-end ownership',
    statement: 'Comfortable owning a problem end to end with little supervision',
  },
  { group: 'Location', label: 'Remote collaboration', statement: 'Has collaborated with a distributed, remote team' },
  { group: 'Seniority', label: 'Clear written trade-offs', statement: 'Communicates trade-offs clearly in writing' },
];

const PROFILES = [
  {
    fit: 91,
    label: 'STRONG' as const,
    met: 5,
    blurb: 'Has done this role before at a comparable team and owns work end to end.',
  },
  {
    fit: 84,
    label: 'STRONG' as const,
    met: 4,
    blurb: 'Strong overlap with the role and a long open-source track record.',
  },
  {
    fit: 72,
    label: 'GOOD' as const,
    met: 4,
    blurb: 'Relevant experience and remote collaboration, lighter on the core skill.',
  },
  { fit: 63, label: 'GOOD' as const, met: 3, blurb: 'Adjacent background that maps onto most of the requirements.' },
  { fit: 55, label: 'GOOD' as const, met: 3, blurb: 'Promising fit on ownership and writing; less direct experience.' },
];

@Injectable()
export class JobMatchEnvSeedService implements OnApplicationBootstrap {
  private readonly logger = new Logger(JobMatchEnvSeedService.name);

  constructor(private readonly prisma: PrismaService) {}

  onApplicationBootstrap(): void {
    const teamUid = process.env.FEATURE_ENV_SEED_TEAM_UID?.trim() || undefined;
    const leadEmail = process.env.FEATURE_ENV_SEED_TEST_LEAD_EMAIL?.trim() || undefined;
    const candidateEmail = process.env.FEATURE_ENV_SEED_TEST_CANDIDATE_EMAIL?.trim() || undefined;
    const test = leadEmail && candidateEmail ? { leadEmail, candidateEmail } : undefined;
    if (!teamUid && !test) return;
    this.seed(teamUid, test).catch((error) =>
      this.logger.error(`env seed failed: ${error instanceof Error ? error.message : error}`)
    );
  }

  async seed(
    teamUid: string | undefined,
    test?: { leadEmail: string; candidateEmail: string }
  ): Promise<{ roles: number; suggestions: number }> {
    const plans: RoleSeed[] = [];
    if (teamUid) {
      const plan = await this.mainTeamPlan(teamUid);
      if (plan) plans.push(plan);
    }
    if (test) {
      const plan = await this.testTeamPlan(test.leadEmail, test.candidateEmail);
      if (plan) plans.push(plan);
    }
    if (!plans.length) return { roles: 0, suggestions: 0 };

    // Start clean: the seed owns these two runs; cascade removes their rows (and any email claims on them).
    await this.prisma.jobMatchRun.deleteMany({ where: { uid: { in: [SEED_RUN, SEED_RUN_PREV] } } });
    const now = Date.now();
    await this.prisma.jobMatchRun.create({
      data: {
        uid: SEED_RUN_PREV,
        runDate: SEED_RUN_PREV_DATE,
        status: 'COMPLETED',
        finishedAt: new Date(now - 7 * 864e5),
      },
    });
    await this.prisma.jobMatchRun.create({
      data: { uid: SEED_RUN, runDate: SEED_RUN_DATE, status: 'COMPLETED', finishedAt: new Date(now) },
    });

    let roles = 0;
    let suggestions = 0;
    for (const plan of plans) {
      const seeded = await this.seedRoles(plan, now);
      roles += plan.roles.length;
      suggestions += seeded;
      this.logger.log(
        `env seed: team ${plan.teamUid}, ${plan.roles.length} live role(s), ${seeded} suggestion(s) seeded`
      );
    }
    return { roles, suggestions };
  }

  /** The configured team's live roles and the first SUGGESTIONS members outside it. */
  private async mainTeamPlan(teamUid: string): Promise<RoleSeed | null> {
    const jobs = await this.prisma.jobOpening.findMany({
      where: { teamUid },
      select: { ...MATCH_JOB_SELECT, teamUid: true, status: true, publishedAt: true },
    });
    const live = jobs.filter(isLiveOpening);
    if (!live.length) {
      this.logger.warn(`env seed: team ${teamUid} has no live roles; nothing seeded for it`);
      return null;
    }
    const teamMembers = await this.prisma.teamMemberRole.findMany({ where: { teamUid }, select: { memberUid: true } });
    const members = await this.pickMembers(
      [...teamMembers.map((row) => row.memberUid), TEST_CANDIDATE_UID],
      SUGGESTIONS
    );
    return {
      teamUid,
      roles: live.map((job) => ({ uid: job.uid, roleTitle: job.roleTitle, hash: currentRoleTextHash(job) })),
      members,
      previousIndexes: [...Array(IN_PREVIOUS_RUN).keys()],
    };
  }

  /**
   * The test team: upserts the team, its one live role, the test candidate and the existing lead's lead
   * membership on it (no other membership is created or changed). Null, with a warning, when the lead does not
   * exist or the candidate email already belongs to another member.
   */
  private async testTeamPlan(leadEmail: string, candidateEmail: string): Promise<RoleSeed | null> {
    // FEATURE_ENV_SEED_TEST_LEAD_EMAIL may list several leads, comma-separated; each must be an existing member.
    const leadEmails = leadEmail
      .split(',')
      .map((email) => email.trim())
      .filter(Boolean);
    const leads: { uid: string }[] = [];
    for (const email of leadEmails) {
      const lead = await this.prisma.member.findFirst({
        where: { email: { equals: email, mode: 'insensitive' }, deletedAt: null },
        select: { uid: true },
      });
      if (lead) leads.push(lead);
      else this.logger.warn(`env seed: no member for one FEATURE_ENV_SEED_TEST_LEAD_EMAIL entry; it is skipped`);
    }
    if (!leads.length) {
      this.logger.warn('env seed: no member with FEATURE_ENV_SEED_TEST_LEAD_EMAIL; test team skipped');
      return null;
    }
    const emailOwner = await this.prisma.member.findFirst({
      where: { email: { equals: candidateEmail, mode: 'insensitive' }, uid: { not: TEST_CANDIDATE_UID } },
      select: { uid: true },
    });
    if (emailOwner) {
      this.logger.warn(
        'env seed: FEATURE_ENV_SEED_TEST_CANDIDATE_EMAIL already belongs to another member; test team skipped'
      );
      return null;
    }

    await this.prisma.team.upsert({
      where: { uid: TEST_TEAM_UID },
      create: { uid: TEST_TEAM_UID, name: TEST_TEAM_NAME },
      update: { name: TEST_TEAM_NAME },
    });
    const now = new Date();
    const role = {
      companyName: TEST_TEAM_NAME,
      signalType: 'env-seed',
      roleTitle: TEST_ROLE_TITLE,
      canonicalKey: TEST_ROLE_UID,
      dedupKey: TEST_ROLE_UID,
      teamUid: TEST_TEAM_UID,
      descriptionHtml: TEST_ROLE_DESCRIPTION_HTML,
    };
    // NEW is a board-visible status; publishedAt is reset every start so the role is always live and recent.
    await this.prisma.jobOpening.upsert({
      where: { uid: TEST_ROLE_UID },
      create: { uid: TEST_ROLE_UID, ...role, status: 'NEW', detectionDate: now, publishedAt: now },
      update: { ...role, status: 'NEW', publishedAt: now },
    });
    await this.prisma.member.upsert({
      where: { uid: TEST_CANDIDATE_UID },
      create: { uid: TEST_CANDIDATE_UID, name: TEST_CANDIDATE_NAME, email: candidateEmail, role: 'Backend Engineer' },
      update: {
        name: TEST_CANDIDATE_NAME,
        email: candidateEmail,
        role: 'Backend Engineer',
        deletedAt: null,
        jobSearchStatus: null,
      },
    });
    for (const lead of leads) {
      await this.prisma.teamMemberRole.upsert({
        where: { memberUid_teamUid: { memberUid: lead.uid, teamUid: TEST_TEAM_UID } },
        create: { memberUid: lead.uid, teamUid: TEST_TEAM_UID, teamLead: true, endDate: null },
        update: { teamLead: true, endDate: null },
      });
    }

    const job = await this.prisma.jobOpening.findUniqueOrThrow({
      where: { uid: TEST_ROLE_UID },
      select: MATCH_JOB_SELECT,
    });
    const teamMembers = await this.prisma.teamMemberRole.findMany({
      where: { teamUid: TEST_TEAM_UID },
      select: { memberUid: true },
    });
    const others = await this.pickMembers(
      [...teamMembers.map((row) => row.memberUid), ...leads.map((l) => l.uid), TEST_CANDIDATE_UID],
      SUGGESTIONS - 1
    );
    return {
      teamUid: TEST_TEAM_UID,
      roles: [{ uid: job.uid, roleTitle: job.roleTitle, hash: currentRoleTextHash(job) }],
      members: [{ uid: TEST_CANDIDATE_UID }, ...others],
      previousIndexes: TEST_PREVIOUS_INDEXES,
    };
  }

  /**
   * Members with a job title first (the row shows it), then any active member; never one of `excluded`, and
   * never a NOT_LOOKING member (the weekly email does not count those as new, which would skew "3 new").
   */
  private async pickMembers(excluded: string[], count: number): Promise<{ uid: string }[]> {
    const titled = await this.prisma.member.findMany({
      where: { ...LOOKABLE, uid: { notIn: excluded }, role: { not: null } },
      orderBy: { name: 'asc' },
      take: count,
      select: { uid: true },
    });
    const rest =
      titled.length < count
        ? await this.prisma.member.findMany({
            where: { ...LOOKABLE, uid: { notIn: [...excluded, ...titled.map((m) => m.uid)] } },
            orderBy: { name: 'asc' },
            take: count - titled.length,
            select: { uid: true },
          })
        : [];
    const members = [...titled, ...rest];
    if (members.length < count) {
      this.logger.warn(`env seed: only ${members.length} of ${count} candidate members available`);
    }
    return members;
  }

  /** CRITERIA, previous-run and latest-run rows for each role of a plan; returns the suggestions written. */
  private async seedRoles(plan: RoleSeed, now: number): Promise<number> {
    let suggestions = 0;
    const previousAt = new Date(now - 7 * 864e5);
    for (const job of plan.roles) {
      const criteria = criteriaFor(job.roleTitle);
      const base = { teamUid: plan.teamUid, roleUid: job.uid };

      // CRITERIA lives under the real posting hash, so the GET shows it and Edit criteria appears.
      await this.prisma.jobMatchRow.create({
        data: { ...base, runUid: SEED_RUN, kind: 'CRITERIA', roleTextHash: job.hash, payload: criteria },
      });

      // Previous run: older ROLE marker plus the members at `previousIndexes`, at their same ranks.
      await this.prisma.jobMatchRow.create({
        data: { ...base, runUid: SEED_RUN_PREV, kind: 'ROLE', createdAt: previousAt },
      });
      for (const index of plan.previousIndexes) {
        const member = plan.members[index];
        if (!member) continue;
        await this.prisma.jobMatchRow.create({
          data: {
            ...base,
            runUid: SEED_RUN_PREV,
            kind: 'SUGGESTION',
            memberUid: member.uid,
            ...this.suggestion(index, criteria),
            createdAt: previousAt,
          },
        });
      }

      // Latest run: newest ROLE marker plus all suggestions, in rank order.
      await this.prisma.jobMatchRow.create({ data: { ...base, runUid: SEED_RUN, kind: 'ROLE' } });
      for (const [index, member] of plan.members.entries()) {
        await this.prisma.jobMatchRow.create({
          data: {
            ...base,
            runUid: SEED_RUN,
            kind: 'SUGGESTION',
            memberUid: member.uid,
            ...this.suggestion(index, criteria),
          },
        });
        suggestions += 1;
      }
    }
    return suggestions;
  }

  private suggestion(index: number, criteria: SeedCriterion[]) {
    const profile = PROFILES[index % PROFILES.length];
    return {
      rank: index + 1,
      fit: profile.fit,
      label: profile.label,
      blurb: profile.blurb,
      payload: criteria.map(({ statement }, i) => ({ text: statement, matched: i < profile.met })),
    };
  }
}
