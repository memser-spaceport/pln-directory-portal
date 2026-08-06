/**
 * One-time cleanup: merge TeamNewsItem rows that share a normalized source URL
 * (including cross-team) into the oldest row, unioning sourceUrls/tags, then
 * delete the duplicates. Also merges same-team semantic / publication variants.
 *
 *   npm run api:backfill-team-news-source-duplicates           # dry-run
 *   npm run api:backfill-team-news-source-duplicates -- --apply
 */
import { PrismaClient } from '@prisma/client';
import { isDuplicateNewsStory } from '../team-news/utils/news-dedup';
import { normalizeSourceUrl } from '../team-news/utils/url-normalize';

const prisma = new PrismaClient();

type NewsRow = {
  id: number;
  uid: string;
  teamUid: string;
  sourceUrl: string;
  sourceUrls: string[];
  title: string;
  summary: string | null;
  contentHtml: string | null;
  tags: string[];
  eventDate: Date;
  createdAt: Date;
};

function uniqueSourceUrls(...urlLists: Array<string | string[] | null | undefined>): string[] {
  const unique: string[] = [];
  const seen = new Set<string>();
  for (const list of urlLists) {
    const values = Array.isArray(list) ? list : list ? [list] : [];
    for (const value of values) {
      if (typeof value !== 'string' || !value.trim()) continue;
      const normalized = normalizeSourceUrl(value);
      if (!normalized || seen.has(normalized)) continue;
      seen.add(normalized);
      unique.push(value.trim());
    }
  }
  return unique;
}

function storedUrls(item: { sourceUrl: string; sourceUrls: string[] }): string[] {
  return uniqueSourceUrls(item.sourceUrls?.length ? item.sourceUrls : [item.sourceUrl]);
}

async function mergeGroup(keep: NewsRow, duplicates: NewsRow[], apply: boolean): Promise<void> {
  const sourceUrls = uniqueSourceUrls(storedUrls(keep), ...duplicates.map((d) => storedUrls(d)));
  const tags = [...new Set([keep.tags, ...duplicates.map((d) => d.tags)].flat())];
  const contentHtml =
    keep.contentHtml ?? duplicates.find((d) => d.contentHtml)?.contentHtml ?? null;

  console.log(
    `  keep id=${keep.id} uid=${keep.uid} team=${keep.teamUid} ← merge ` +
      `[${duplicates.map((d) => `${d.id}/${d.teamUid}`).join(', ')}] urls=${sourceUrls.length}`
  );

  if (!apply) return;

  await prisma.teamNewsItem.update({
    where: { id: keep.id },
    data: { sourceUrls, tags, contentHtml },
  });

  for (const dup of duplicates) {
    await prisma.networkOverview.updateMany({
      where: { featuredNewsItemUid: dup.uid },
      data: { featuredNewsItemUid: keep.uid },
    });
    await prisma.teamNewsItem.delete({ where: { id: dup.id } });
  }
}

/** Build connected components of items that share any normalized source URL. */
function partitionUrlGroups(items: NewsRow[]): NewsRow[][] {
  const parent = new Map<number, number>();
  const find = (id: number): number => {
    let cur = id;
    while (parent.get(cur) !== cur) {
      const p = parent.get(cur)!;
      parent.set(cur, parent.get(p)!);
      cur = parent.get(cur)!;
    }
    return cur;
  };
  const union = (a: number, b: number) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(rb, ra);
  };

  for (const item of items) parent.set(item.id, item.id);

  const byNorm = new Map<string, number[]>();
  for (const item of items) {
    for (const norm of storedUrls(item).map((u) => normalizeSourceUrl(u)).filter(Boolean)) {
      const ids = byNorm.get(norm) ?? [];
      ids.push(item.id);
      byNorm.set(norm, ids);
    }
  }

  for (const ids of byNorm.values()) {
    for (let i = 1; i < ids.length; i++) union(ids[0], ids[i]);
  }

  const groups = new Map<number, NewsRow[]>();
  const byId = new Map(items.map((i) => [i.id, i]));
  for (const item of items) {
    const root = find(item.id);
    const group = groups.get(root) ?? [];
    group.push(byId.get(item.id)!);
    groups.set(root, group);
  }

  return [...groups.values()].filter((g) => g.length >= 2);
}

async function main() {
  const apply = process.argv.includes('--apply');
  console.log(apply ? 'APPLY mode' : 'DRY-RUN mode (pass --apply to persist)');

  const items: NewsRow[] = await prisma.teamNewsItem.findMany({
    select: {
      id: true,
      uid: true,
      teamUid: true,
      sourceUrl: true,
      sourceUrls: true,
      title: true,
      summary: true,
      contentHtml: true,
      tags: true,
      eventDate: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'asc' },
  });

  console.log(`Loaded ${items.length} team news items`);

  const removed = new Set<number>();
  let urlGroups = 0;

  for (const group of partitionUrlGroups(items)) {
    const remaining = group
      .filter((g) => !removed.has(g.id))
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    if (remaining.length < 2) continue;

    urlGroups += 1;
    const [keep, ...dups] = remaining;
    console.log(`URL group (${normalizeSourceUrl(keep.sourceUrl)}):`);
    await mergeGroup(keep, dups, apply);
    for (const d of dups) removed.add(d.id);
  }

  const semanticPool = items
    .filter((i) => !removed.has(i.id))
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

  let semanticGroups = 0;
  const semanticallyMerged = new Set<number>();
  const windowMs = 7 * 24 * 60 * 60 * 1000;

  for (let i = 0; i < semanticPool.length; i++) {
    const left = semanticPool[i];
    if (semanticallyMerged.has(left.id)) continue;

    const dups: NewsRow[] = [];
    for (let j = i + 1; j < semanticPool.length; j++) {
      const right = semanticPool[j];
      if (semanticallyMerged.has(right.id) || removed.has(right.id)) continue;
      if (left.teamUid !== right.teamUid) continue;
      if (Math.abs(left.eventDate.getTime() - right.eventDate.getTime()) > windowMs) continue;

      if (
        isDuplicateNewsStory(
          {
            sourceUrl: left.sourceUrl,
            title: left.title,
            summary: left.summary,
            eventDate: left.eventDate,
          },
          {
            sourceUrl: right.sourceUrl,
            title: right.title,
            summary: right.summary,
            eventDate: right.eventDate,
          }
        )
      ) {
        dups.push(right);
      }
    }

    if (dups.length === 0) continue;
    semanticGroups += 1;
    console.log(`Semantic group team=${left.teamUid}:`);
    await mergeGroup(left, dups, apply);
    semanticallyMerged.add(left.id);
    for (const d of dups) {
      semanticallyMerged.add(d.id);
      removed.add(d.id);
    }
  }

  console.log(
    `Done. URL merge groups=${urlGroups}, semantic merge groups=${semanticGroups}` +
      (apply ? '' : ' (dry-run; re-run with --apply to persist)')
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
