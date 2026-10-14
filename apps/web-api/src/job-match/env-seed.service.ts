import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { PrismaService } from '../shared/prisma.service';
import { currentRoleTextHash, isLiveOpening, MATCH_JOB_SELECT } from './job-match.logic';

/**
 * FEATURE-ENV ONLY — lives on the unmerged branch `lab-2837-env-seed`, never on lab-2837/develop.
 *
 * Feature environments can't run real job matching (Claude calls need WIF, which their namespaces
 * lack), so on start this writes made-up but well-formed job-match results for one team, letting the
 * Suggested tab, Edit criteria, Contact and the weekly-email "new vs previous run" logic be tested.
 *
 * Runs only when FEATURE_ENV_SEED_TEAM_UID is set. Idempotent: it owns two runs with fixed uids and
 * fixed past run dates (so it never collides with a real daily run) and rewrites their rows each start.
 */
const SEED_RUN = 'env-seed-run';
const SEED_RUN_PREV = 'env-seed-run-prev';
const SEED_RUN_DATE = new Date('2000-01-05');
const SEED_RUN_PREV_DATE = new Date('2000-01-04');
const SUGGESTIONS = 5;
const IN_PREVIOUS_RUN = 2; // the first two suggestions also appear in the previous run, so three count as new

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
    const teamUid = process.env.FEATURE_ENV_SEED_TEAM_UID?.trim();
    if (!teamUid) return;
    this.seed(teamUid).catch((error) =>
      this.logger.error(`env seed failed for team ${teamUid}: ${error instanceof Error ? error.message : error}`)
    );
  }

  async seed(teamUid: string): Promise<{ roles: number; suggestions: number }> {
    const jobs = await this.prisma.jobOpening.findMany({
      where: { teamUid },
      select: { ...MATCH_JOB_SELECT, teamUid: true, status: true, publishedAt: true },
    });
    const live = jobs.filter(isLiveOpening);
    if (!live.length) {
      this.logger.warn(`env seed: team ${teamUid} has no live roles; nothing seeded`);
      return { roles: 0, suggestions: 0 };
    }

    const teamMembers = await this.prisma.teamMemberRole.findMany({ where: { teamUid }, select: { memberUid: true } });
    const excluded = teamMembers.map((row) => row.memberUid);
    // Prefer members with a job title (the row shows it), then fill up with any active member.
    const titled = await this.prisma.member.findMany({
      where: { deletedAt: null, uid: { notIn: excluded }, role: { not: null } },
      orderBy: { name: 'asc' },
      take: SUGGESTIONS,
      select: { uid: true },
    });
    const rest =
      titled.length < SUGGESTIONS
        ? await this.prisma.member.findMany({
            where: { deletedAt: null, uid: { notIn: [...excluded, ...titled.map((m) => m.uid)] } },
            orderBy: { name: 'asc' },
            take: SUGGESTIONS - titled.length,
            select: { uid: true },
          })
        : [];
    const members = [...titled, ...rest];
    if (members.length < SUGGESTIONS) {
      this.logger.warn(`env seed: only ${members.length} candidate members available`);
    }

    // Start clean: the seed owns these two runs; cascade removes their rows.
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

    let suggestions = 0;
    for (const job of live) {
      const hash = currentRoleTextHash(job);
      const criteria = criteriaFor(job.roleTitle);
      const base = { teamUid, roleUid: job.uid };
      const previousAt = new Date(now - 7 * 864e5);

      // CRITERIA lives under the real posting hash, so the GET shows it and Edit criteria appears.
      await this.prisma.jobMatchRow.create({
        data: { ...base, runUid: SEED_RUN, kind: 'CRITERIA', roleTextHash: hash, payload: criteria },
      });

      // Previous run: older ROLE marker plus the first IN_PREVIOUS_RUN people.
      await this.prisma.jobMatchRow.create({
        data: { ...base, runUid: SEED_RUN_PREV, kind: 'ROLE', createdAt: previousAt },
      });
      for (const [index, member] of members.slice(0, IN_PREVIOUS_RUN).entries()) {
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
      for (const [index, member] of members.entries()) {
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

    this.logger.log(`env seed: team ${teamUid}, ${live.length} live role(s), ${suggestions} suggestion(s) seeded`);
    return { roles: live.length, suggestions };
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
