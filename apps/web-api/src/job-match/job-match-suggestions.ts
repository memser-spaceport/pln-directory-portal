import { PrismaService } from '../shared/prisma.service';
import {
  GOOD_FIT,
  TOP_N,
  asCriteria,
  asMarkedCriteria,
  currentRoleTextHash,
  withCriterionMeta,
  type MatchCriterionItem,
  type MatchJob,
} from './job-match.logic';

/**
 * The suggestions the Suggested tab lists for a role from one run: the run's `SUGGESTION` rows ranked, the top
 * `TOP_N`, minus rows whose member is deleted or whose fit, rank or label is missing or below `GOOD_FIT`.
 *
 * Shared by `JobMatchService` (the tab, its counts, the contact check) and the weekly suggested-candidates email
 * (LAB-2850), so what the email calls "listed" never drifts from what the tab shows.
 */
export async function listRunSuggestions(prisma: PrismaService, runUid: string, roleUid: string) {
  const rows = await prisma.jobMatchRow.findMany({
    where: { kind: 'SUGGESTION', runUid, roleUid },
    orderBy: { rank: 'asc' },
    take: TOP_N,
  });
  const members = await prisma.member.findMany({
    where: { uid: { in: rows.map((row) => row.memberUid) }, deletedAt: null },
    select: {
      uid: true,
      name: true,
      role: true,
      image: { select: { url: true } },
      location: { select: { city: true, country: true } },
    },
  });
  const byUid = new Map(members.map((item) => [item.uid, item]));

  return rows.flatMap((row) => {
    const person = byUid.get(row.memberUid);
    if (!person || row.fit == null || row.rank == null || row.fit < GOOD_FIT || !row.label) return [];
    return [{ row, person, fit: row.fit, rank: row.rank, label: row.label }];
  });
}

export type ListedSuggestion = Awaited<ReturnType<typeof listRunSuggestions>>[number];

/**
 * The criteria extracted for the role's current posting, read the way the runner reads them: either stored shape
 * (LAB-2854), newest row first, so a legacy row's labels appear once the runner has labelled it. Shared by the
 * Suggested tab and the weekly email (LAB-2865), so both label a suggestion's criteria the same way.
 */
export async function currentRoleCriteria(
  prisma: PrismaService,
  job: MatchJob
): Promise<{ hash: string; all: MatchCriterionItem[] }> {
  const hash = currentRoleTextHash(job);
  const row = await prisma.jobMatchRow.findFirst({
    where: { kind: 'CRITERIA', roleUid: job.uid, roleTextHash: hash },
    orderBy: { createdAt: 'desc' },
    select: { payload: true },
  });
  return { hash, all: asCriteria(row?.payload).slice(0, 6) };
}

/**
 * A suggestion's stored `{ text, matched }` criteria, in the stored order, each with the label and group of the
 * role's current criterion of the same statement (absent when the statement is no longer current or unlabelled).
 */
export function suggestionCriteria(payload: unknown, current: readonly MatchCriterionItem[]) {
  return withCriterionMeta(asMarkedCriteria(payload), current);
}
