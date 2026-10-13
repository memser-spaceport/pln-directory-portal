import { PrismaService } from '../shared/prisma.service';
import { GOOD_FIT, TOP_N } from './job-match.logic';

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
    select: { uid: true, name: true, role: true, image: { select: { url: true } } },
  });
  const byUid = new Map(members.map((item) => [item.uid, item]));

  return rows.flatMap((row) => {
    const person = byUid.get(row.memberUid);
    if (!person || row.fit == null || row.rank == null || row.fit < GOOD_FIT || !row.label) return [];
    return [{ row, person, fit: row.fit, rank: row.rank, label: row.label }];
  });
}

export type ListedSuggestion = Awaited<ReturnType<typeof listRunSuggestions>>[number];
