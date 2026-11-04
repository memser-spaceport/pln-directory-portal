import { ConflictException, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../shared/prisma.service';
import { AnalyticsService } from '../analytics/service/analytics.service';
import { ANALYTICS_EVENTS } from '../utils/constants';
import { excludedMemberWhere } from '../member-signals/member-exclusion';
import { buildNewsTagVocabulary } from '../team-news/news-tag-vocabulary.service';
import { buildProfile } from './build-profile';
import { loadProfileBatch } from './profile-sources.loader';
import {
  PROFILE_ANALYTICS_DISTINCT_ID,
  PROFILE_BATCH_SIZE,
  PROFILE_RUN_LOCK_KEY,
  STALE_RUN_MS,
  halfLifeDays,
} from './member-interest-profile.constants';

export type RebuildTrigger = 'CRON' | 'ADMIN';
export type RebuildResult = { runId: number; membersCount: number; nonEmptyCount: number; durationMs: number };

export type ProfileReadQuery = { memberUids: string[]; top: number; page: number; limit: number };

type ScoredItem = { key: string; score: number };

/**
 * Member interest profiles (LAB-3122): the daily rebuild and the admin read.
 * No member-facing code reads the profile until the LAB-3124 pilot passes.
 */
@Injectable()
export class MemberInterestProfileService {
  private readonly logger = new Logger(MemberInterestProfileService.name);

  constructor(private readonly prisma: PrismaService, private readonly analytics: AnalyticsService) {}

  /**
   * Claim a rebuild across API instances: under a transaction-scoped advisory
   * lock, refuse when a non-stale rebuild is RUNNING, or (cron only) when one
   * already finished today (UTC). Returns the new run id, or null when refused.
   */
  async claimRun(trigger: RebuildTrigger, now = new Date()): Promise<number | null> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${PROFILE_RUN_LOCK_KEY}))::text`;
      const running = await tx.memberInterestProfileRun.findFirst({
        where: { status: 'RUNNING', startedAt: { gt: new Date(now.getTime() - STALE_RUN_MS) } },
        select: { id: true },
      });
      if (running) return null;
      if (trigger === 'CRON') {
        const dayStart = new Date(now);
        dayStart.setUTCHours(0, 0, 0, 0);
        const doneToday = await tx.memberInterestProfileRun.findFirst({
          where: { status: 'DONE', trigger: 'CRON', startedAt: { gte: dayStart } },
          select: { id: true },
        });
        if (doneToday) return null;
      }
      await tx.memberInterestProfileRun.updateMany({
        where: { status: 'RUNNING' },
        data: { status: 'FAILED', error: 'stale', finishedAt: now },
      });
      const run = await tx.memberInterestProfileRun.create({
        data: { trigger, status: 'RUNNING' },
        select: { id: true },
      });
      return run.id;
    });
  }

  /** Claim and run a rebuild. Resolves null when another rebuild holds the claim. */
  async rebuild(trigger: RebuildTrigger): Promise<RebuildResult | null> {
    const runId = await this.claimRun(trigger);
    if (runId === null) {
      this.logger.log(`Member interest profile rebuild (${trigger}) skipped: another run holds the claim`);
      return null;
    }
    return this.runClaimed(runId);
  }

  /** Admin trigger: claim now (409 when taken), run in the background. */
  async startAdminRebuild(): Promise<{ runId: number }> {
    const runId = await this.claimRun('ADMIN');
    if (runId === null) throw new ConflictException('A member interest profile rebuild is already running');
    void this.runClaimed(runId).catch(() => undefined);
    return { runId };
  }

  private async runClaimed(runId: number): Promise<RebuildResult> {
    const started = Date.now();
    try {
      const { membersCount, nonEmptyCount } = await this.rebuildAll(new Date());
      const durationMs = Date.now() - started;
      await this.prisma.memberInterestProfileRun.update({
        where: { id: runId },
        data: { status: 'DONE', finishedAt: new Date(), membersCount, nonEmptyCount },
      });
      void this.analytics.trackEvent({
        name: ANALYTICS_EVENTS.PERSONALIZATION.MEMBER_INTEREST_PROFILE_COMPUTED,
        distinctId: PROFILE_ANALYTICS_DISTINCT_ID,
        properties: { runId, membersCount, nonEmptyCount, durationMs },
      });
      this.logger.log(
        `Member interest profiles rebuilt: ${nonEmptyCount}/${membersCount} non-empty in ${durationMs}ms (run ${runId})`
      );
      return { runId, membersCount, nonEmptyCount, durationMs };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Member interest profile rebuild failed (run ${runId}): ${message}`);
      await this.prisma.memberInterestProfileRun
        .update({
          where: { id: runId },
          data: { status: 'FAILED', finishedAt: new Date(), error: message.slice(0, 2000) },
        })
        .catch(() => undefined);
      throw error;
    }
  }

  private async rebuildAll(now: Date): Promise<{ membersCount: number; nonEmptyCount: number }> {
    const areas = await this.prisma.focusArea.findMany({
      select: { uid: true, title: true, parentUid: true },
      orderBy: { id: 'asc' },
    });
    const vocabulary = buildNewsTagVocabulary(areas);
    const options = { now, halfLifeDays: halfLifeDays() };
    const eligible: Prisma.MemberWhereInput = { deletedAt: null, NOT: excludedMemberWhere() };

    let membersCount = 0;
    let nonEmptyCount = 0;
    let cursor: string | undefined;
    for (;;) {
      const members = await this.prisma.member.findMany({
        where: cursor ? { ...eligible, uid: { gt: cursor } } : eligible,
        orderBy: { uid: 'asc' },
        take: PROFILE_BATCH_SIZE,
        select: {
          uid: true,
          preferences: true,
          customSkills: true,
          ohInterest: true,
          skills: { select: { title: true } },
        },
      });
      if (members.length === 0) break;
      cursor = members[members.length - 1].uid;

      const { sources, lookups } = await loadProfileBatch(this.prisma, members, vocabulary, now);
      const rows = sources.flatMap((source) =>
        buildProfile(source, lookups, options).map((entry) => ({ memberUid: source.memberUid, ...entry }))
      );
      const uids = members.map((m) => m.uid);
      await this.prisma.$transaction([
        this.prisma.memberInterestProfileEntry.deleteMany({ where: { memberUid: { in: uids } } }),
        this.prisma.memberInterestProfileEntry.createMany({ data: rows }),
      ]);

      membersCount += members.length;
      nonEmptyCount += new Set(rows.map((r) => r.memberUid)).size;
    }

    // Members who became excluded or were soft-deleted since the last run.
    await this.prisma.memberInterestProfileEntry.deleteMany({
      where: { member: { OR: [{ deletedAt: { not: null } }, excludedMemberWhere()] } },
    });

    return { membersCount, nonEmptyCount };
  }

  async readProfiles({ memberUids, top, page, limit }: ProfileReadQuery) {
    const total = memberUids.length;
    const pageUids = memberUids.slice((page - 1) * limit, page * limit);
    const [entries, members] = await Promise.all([
      this.prisma.memberInterestProfileEntry.findMany({
        where: { memberUid: { in: pageUids } },
        select: { memberUid: true, kind: true, key: true, score: true },
      }),
      this.prisma.member.findMany({ where: { uid: { in: pageUids } }, select: { uid: true, name: true } }),
    ]);

    const entityUids = { TEAM: new Set<string>(), MEMBER: new Set<string>(), PROJECT: new Set<string>() };
    for (const entry of entries) {
      if (entry.kind !== 'ENTITY') continue;
      const [type, uid] = splitEntityKey(entry.key);
      if (type in entityUids) entityUids[type as keyof typeof entityUids].add(uid);
    }
    const [teams, entityMembers, projects] = await Promise.all([
      this.prisma.team.findMany({ where: { uid: { in: [...entityUids.TEAM] } }, select: { uid: true, name: true } }),
      this.prisma.member.findMany({
        where: { uid: { in: [...entityUids.MEMBER] } },
        select: { uid: true, name: true },
      }),
      this.prisma.project.findMany({
        where: { uid: { in: [...entityUids.PROJECT] } },
        select: { uid: true, name: true },
      }),
    ]);
    const names = new Map<string, string>([
      ...teams.map((t) => [`TEAM:${t.uid}`, t.name] as const),
      ...entityMembers.map((m) => [`MEMBER:${m.uid}`, m.name] as const),
      ...projects.map((p) => [`PROJECT:${p.uid}`, p.name] as const),
    ]);
    const memberNames = new Map(members.map((m) => [m.uid, m.name]));

    const items = pageUids.map((memberUid) => {
      const own = entries.filter((e) => e.memberUid === memberUid);
      const topOf = (kind: string): ScoredItem[] =>
        own
          .filter((e) => e.kind === kind)
          .sort((a, b) => b.score - a.score || a.key.localeCompare(b.key))
          .slice(0, top)
          .map((e) => ({ key: e.key, score: e.score }));
      return {
        memberUid,
        name: memberNames.get(memberUid) ?? null,
        topics: topOf('TOPIC').map(({ key, score }) => ({ slug: key, score })),
        entities: topOf('ENTITY').map(({ key, score }) => {
          const [type, uid] = splitEntityKey(key);
          return { type, uid, name: names.get(key) ?? null, score };
        }),
        expertise: topOf('EXPERTISE').map(({ key, score }) => ({ slug: key, score })),
      };
    });

    return { page, limit, total, items };
  }
}

function splitEntityKey(key: string): [string, string] {
  const at = key.indexOf(':');
  return [key.slice(0, at), key.slice(at + 1)];
}
