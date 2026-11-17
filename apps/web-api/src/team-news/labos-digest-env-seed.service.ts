// FEATURE-ENV ONLY — never merge (branch lab-3241-env-seed only).
import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { PrismaService } from '../shared/prisma.service';
import { LabosDigestPageService } from './labos-digest-page.service';

/**
 * FEATURE-ENV ONLY — never merge. Lives on the unmerged branch `lab-3241-env-seed`, never on lab-3241/develop.
 *
 * Feature environments run dev's notification service, which never records sends into the env's database, so
 * Past issues (LAB-3294) would stay empty there. On start this records made-up issues for the members in
 * FEATURE_ENV_SEED_DIGEST_MEMBER_UIDS (comma-separated), through the same recordIssues the service endpoint uses:
 * one daily issue newer than the existing test links (so their own issue isn't the Latest one), four older daily
 * ones and one weekly. Stories are the newest news items, a different set per issue; the top story is the first.
 * Idempotent: fixed send times, and repeats are skipped.
 */
const DAILY = [
  '2026-11-17T09:00:00.000Z',
  '2026-11-13T09:00:00.000Z',
  '2026-11-12T09:00:00.000Z',
  '2026-11-11T09:00:00.000Z',
  '2026-11-10T09:00:00.000Z',
];
const WEEKLY = ['2026-11-09T11:00:00.000Z'];
const STORIES_PER_ISSUE = 4;
const FORUM_TIDS = [1, 2, 3];

@Injectable()
export class LabosDigestEnvSeedService implements OnApplicationBootstrap {
  private readonly logger = new Logger(LabosDigestEnvSeedService.name);

  constructor(private readonly prisma: PrismaService, private readonly page: LabosDigestPageService) {}

  async onApplicationBootstrap() {
    const memberUids = (process.env.FEATURE_ENV_SEED_DIGEST_MEMBER_UIDS ?? '')
      .split(',')
      .map((uid) => uid.trim())
      .filter(Boolean);
    if (memberUids.length === 0) return;
    try {
      const sends = [
        ...DAILY.map((sentAt) => ({ sentAt, frequency: 'daily' as const })),
        ...WEEKLY.map((sentAt) => ({ sentAt, frequency: 'weekly' as const })),
      ];
      const items = await this.prisma.teamNewsItem.findMany({
        orderBy: { createdAt: 'desc' },
        take: sends.length * STORIES_PER_ISSUE,
        select: { uid: true },
      });
      if (items.length === 0) {
        this.logger.warn('Env seed: no news items to seed digest issues with');
        return;
      }
      const issues = memberUids.flatMap((memberUid) =>
        sends.map(({ sentAt, frequency }, index) => {
          const n = Array.from(
            { length: Math.min(STORIES_PER_ISSUE, items.length) },
            (_, k) => items[(index * STORIES_PER_ISSUE + k) % items.length].uid
          );
          return { memberUid, frequency, sentAt, n: [...new Set(n)], l: n[0], p: FORUM_TIDS };
        })
      );
      const { recorded } = await this.page.recordIssues(issues);
      this.logger.log(`Env seed: recorded ${recorded} of ${issues.length} digest issue(s) for Past issues`);
    } catch (error) {
      this.logger.error(`Env seed: digest issues failed: ${(error as Error).message}`);
    }
  }
}
