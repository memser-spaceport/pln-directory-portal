import type { PrismaClient } from '@prisma/client';
import { isExcludedMember } from './member-exclusion';
import { MemberSignalOwnershipResolver } from './member-signal-ownership';
import {
  MEMBER_SIGNAL_SOURCE_KEY_PREFIX,
  MemberSignalAction,
  MemberSignalEntityType,
} from './member-signals.constants';

/**
 * One-time copy of the stored action records into the member signal log
 * (LAB-3121). Each current record becomes one row with its own created time and
 * `sourceKey = backfill:<table>:<uid>`, so a second run adds nothing.
 *
 * Records created at or after the first live row of the same action are skipped:
 * the live writer already logged them.
 */
export type BackfillRow = {
  sourceKey: string;
  memberUid: string;
  action: MemberSignalAction;
  entityType: MemberSignalEntityType;
  entityUid: string;
  createdAt: Date;
};

type SourceRecord = { id: number; createdAt: Date } & Record<string, unknown>;

type Source = {
  table: string;
  action: MemberSignalAction;
  load: (prisma: PrismaClient, afterId: number, take: number) => Promise<SourceRecord[]>;
  toRow: (record: SourceRecord) => Omit<BackfillRow, 'sourceKey' | 'action' | 'createdAt'>;
};

const page = { orderBy: { id: 'asc' as const } };

export const BACKFILL_SOURCES: Source[] = [
  {
    table: 'Follow',
    action: 'follow',
    load: (p, afterId, take) =>
      p.follow.findMany({
        ...page,
        where: { id: { gt: afterId } },
        take,
        select: { id: true, uid: true, memberUid: true, entityType: true, entityUid: true, createdAt: true },
      }),
    toRow: (r) => ({
      memberUid: r.memberUid as string,
      entityType: r.entityType as MemberSignalEntityType,
      entityUid: r.entityUid as string,
    }),
  },
  {
    table: 'TeamNewsUpvote',
    action: 'news-upvote',
    load: (p, afterId, take) =>
      p.teamNewsUpvote.findMany({
        ...page,
        where: { id: { gt: afterId } },
        take,
        select: { id: true, uid: true, memberUid: true, newsItemUid: true, createdAt: true },
      }),
    toRow: (r) => ({ memberUid: r.memberUid as string, entityType: 'NEWS_ITEM', entityUid: r.newsItemUid as string }),
  },
  {
    table: 'FeedNewsLike',
    action: 'news-like',
    load: (p, afterId, take) =>
      p.feedNewsLike.findMany({
        ...page,
        where: { id: { gt: afterId } },
        take,
        select: { id: true, uid: true, memberUid: true, newsItemUid: true, createdAt: true },
      }),
    toRow: (r) => ({ memberUid: r.memberUid as string, entityType: 'NEWS_ITEM', entityUid: r.newsItemUid as string }),
  },
  {
    table: 'FeedComment',
    action: 'news-comment',
    load: (p, afterId, take) =>
      p.feedComment.findMany({
        ...page,
        where: { id: { gt: afterId } },
        take,
        select: { id: true, uid: true, authorUid: true, newsItemUid: true, createdAt: true },
      }),
    toRow: (r) => ({ memberUid: r.authorUid as string, entityType: 'NEWS_ITEM', entityUid: r.newsItemUid as string }),
  },
  {
    table: 'JobOpeningInterest',
    action: 'job-interest',
    load: (p, afterId, take) =>
      p.jobOpeningInterest.findMany({
        ...page,
        where: { id: { gt: afterId } },
        take,
        select: { id: true, uid: true, memberUid: true, jobOpeningUid: true, createdAt: true },
      }),
    toRow: (r) => ({
      memberUid: r.memberUid as string,
      entityType: 'JOB_OPENING',
      entityUid: r.jobOpeningUid as string,
    }),
  },
  {
    table: 'SavedJobOpening',
    action: 'job-saved',
    load: (p, afterId, take) =>
      p.savedJobOpening.findMany({
        ...page,
        where: { id: { gt: afterId } },
        take,
        select: { id: true, uid: true, memberUid: true, jobOpeningUid: true, createdAt: true },
      }),
    toRow: (r) => ({
      memberUid: r.memberUid as string,
      entityType: 'JOB_OPENING',
      entityUid: r.jobOpeningUid as string,
    }),
  },
  {
    table: 'TeamInterest',
    action: 'team-interest',
    load: (p, afterId, take) =>
      p.teamInterest.findMany({
        ...page,
        where: { id: { gt: afterId } },
        take,
        select: { id: true, uid: true, memberUid: true, teamUid: true, createdAt: true },
      }),
    toRow: (r) => ({ memberUid: r.memberUid as string, entityType: 'TEAM', entityUid: r.teamUid as string }),
  },
  {
    table: 'MemberInteraction',
    action: 'office-hours-booking-intent',
    load: (p, afterId, take) =>
      p.memberInteraction.findMany({
        ...page,
        where: { id: { gt: afterId }, type: 'SCHEDULE_MEETING', targetMemberUid: { not: null } },
        take,
        select: { id: true, uid: true, sourceMemberUid: true, targetMemberUid: true, createdAt: true },
      }),
    toRow: (r) => ({
      memberUid: r.sourceMemberUid as string,
      entityType: 'MEMBER',
      entityUid: r.targetMemberUid as string,
    }),
  },
];

export type BackfillSourceResult = { table: string; scanned: number; skipped: number; inserted: number };

export type BackfillOptions = { apply: boolean; batchSize?: number; log?: (line: string) => void };

export async function runMemberSignalBackfill(
  prisma: PrismaClient,
  { apply, batchSize = 1000, log = () => undefined }: BackfillOptions
): Promise<BackfillSourceResult[]> {
  const ownership = new MemberSignalOwnershipResolver(prisma);
  const excluded = new Map<string, boolean>();
  const results: BackfillSourceResult[] = [];

  for (const source of BACKFILL_SOURCES) {
    const firstLive = await prisma.memberSignal.findFirst({
      where: { action: source.action, sourceKey: null },
      orderBy: { createdAt: 'asc' },
      select: { createdAt: true },
    });
    const cutoff = firstLive?.createdAt;
    const result: BackfillSourceResult = { table: source.table, scanned: 0, skipped: 0, inserted: 0 };

    let afterId = 0;
    for (;;) {
      const records = await source.load(prisma, afterId, batchSize);
      if (records.length === 0) break;
      afterId = records[records.length - 1].id;
      result.scanned += records.length;

      const candidates = records.filter((r) => !cutoff || r.createdAt < cutoff);
      const rows = candidates.map((r) => ({
        ...source.toRow(r),
        action: source.action,
        createdAt: r.createdAt,
        sourceKey: `${MEMBER_SIGNAL_SOURCE_KEY_PREFIX}${source.table}:${r.uid as string}`,
      }));
      await loadExclusions(
        prisma,
        excluded,
        rows.map((r) => r.memberUid)
      );
      const kept = rows.filter((r) => !excluded.get(r.memberUid));
      result.skipped += records.length - kept.length;
      if (kept.length === 0) continue;

      const data = await Promise.all(
        kept.map(async (r) => ({ ...r, own: await ownership.isOwn(r.memberUid, r.entityType, r.entityUid) }))
      );
      if (apply) {
        const { count } = await prisma.memberSignal.createMany({ data, skipDuplicates: true });
        result.inserted += count;
      } else {
        const existing = await prisma.memberSignal.count({
          where: { sourceKey: { in: data.map((r) => r.sourceKey) } },
        });
        result.inserted += data.length - existing;
      }
    }

    log(
      `${source.table} → ${source.action}: scanned ${result.scanned}, skipped ${result.skipped}, ` +
        `${apply ? 'inserted' : 'would insert'} ${result.inserted}` +
        (cutoff ? ` (before first live row ${cutoff.toISOString()})` : '')
    );
    results.push(result);
  }
  return results;
}

async function loadExclusions(prisma: PrismaClient, cache: Map<string, boolean>, memberUids: string[]) {
  const missing = [...new Set(memberUids)].filter((uid) => !cache.has(uid));
  if (missing.length === 0) return;
  const members = await prisma.member.findMany({
    where: { uid: { in: missing } },
    select: { uid: true, signUpSource: true, email: true },
  });
  const byUid = new Map(members.map((m) => [m.uid, m]));
  for (const uid of missing) cache.set(uid, isExcludedMember(byUid.get(uid)));
}
