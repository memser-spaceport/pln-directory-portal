/**
 * Discover / merge duplicate MasterProfiles for Warm Intros v2 (LAB-2187).
 *
 * Usage:
 *   # Find name matches + edge/path counts
 *   npx ts-node --transpile-only apps/web-api/src/scripts/merge-master-profiles.ts --find "Marc Andreessen"
 *
 *   # Report investors with duplicate normalized names
 *   npx ts-node --transpile-only apps/web-api/src/scripts/merge-master-profiles.ts --name-dupes
 *
 *   # Dry-run merge (default)
 *   npx ts-node --transpile-only apps/web-api/src/scripts/merge-master-profiles.ts \
 *     --canonical <uid> --duplicates <uid[,uid]>
 *
 *   # Apply
 *   npx ts-node --transpile-only apps/web-api/src/scripts/merge-master-profiles.ts \
 *     --canonical <uid> --duplicates <uid> --apply
 */
import { Prisma, PrismaClient } from '@prisma/client';
import {
  buildUidRemap,
  clusterSamePersons,
  mergeMasterProfileFields,
  normalizePersonName,
  personKeyStrength,
  pickAutoMergeCanonical,
  planEdgeRewire,
  planPathRewire,
  type MasterProfileMergeRow,
} from '../master-profile/merge-master-profiles.util';

const prisma = new PrismaClient();

function argValue(flag: string): string | null {
  const idx = process.argv.indexOf(flag);
  if (idx < 0) return null;
  const v = process.argv[idx + 1];
  if (!v || v.startsWith('--')) return null;
  return v;
}

function hasFlag(flag: string): boolean {
  return process.argv.includes(flag);
}

function unwrapPrimaryEmail(emails: unknown): string | null {
  if (!Array.isArray(emails)) return null;
  for (const item of emails) {
    if (typeof item === 'string' && item.trim()) return item.trim();
    if (item && typeof item === 'object' && typeof (item as { value?: unknown }).value === 'string') {
      const v = ((item as { value: string }).value ?? '').trim();
      if (v) return v;
    }
  }
  return null;
}

function unwrapLinkedin(socials: unknown): string | null {
  if (!socials || typeof socials !== 'object' || Array.isArray(socials)) return null;
  const li = (socials as Record<string, unknown>).linkedin;
  if (typeof li === 'string' && li.trim()) return li.trim();
  if (li && typeof li === 'object' && typeof (li as { value?: unknown }).value === 'string') {
    const v = ((li as { value: string }).value ?? '').trim();
    return v || null;
  }
  return null;
}

async function graphCounts(uids: string[]) {
  const [edgesTo, edgesFrom, paths] = await Promise.all([
    prisma.connectionEdge.groupBy({
      by: ['toProfileUid'],
      where: { toProfileUid: { in: uids } },
      _count: { _all: true },
    }),
    prisma.connectionEdge.groupBy({
      by: ['fromProfileUid'],
      where: { fromProfileUid: { in: uids } },
      _count: { _all: true },
    }),
    prisma.warmPathV2.groupBy({
      by: ['targetProfileUid'],
      where: { targetProfileUid: { in: uids } },
      _count: { _all: true },
    }),
  ]);

  const toMap = new Map(edgesTo.map((r) => [r.toProfileUid, r._count._all]));
  const fromMap = new Map(edgesFrom.map((r) => [r.fromProfileUid, r._count._all]));
  const pathMap = new Map(paths.map((r) => [r.targetProfileUid, r._count._all]));
  return { toMap, fromMap, pathMap };
}

function printProfile(
  p: {
    uid: string;
    personKey: string;
    affinityPersonId: string | null;
    canonicalName: string;
    currentOrg: string | null;
    currentTitle: string | null;
    types: string[];
    emails: unknown;
    socials: unknown;
    listMemberships: unknown;
  },
  counts: { edgesTo: number; edgesFrom: number; paths: number }
) {
  console.log(`  uid=${p.uid}`);
  console.log(`    personKey=${p.personKey} (strength=${personKeyStrength(p.personKey)})`);
  console.log(`    affinityPersonId=${p.affinityPersonId ?? '—'}`);
  console.log(`    name=${p.canonicalName} | org=${p.currentOrg ?? '—'} | title=${p.currentTitle ?? '—'}`);
  console.log(`    types=${p.types.join(',') || '—'}`);
  console.log(`    email=${unwrapPrimaryEmail(p.emails) ?? '—'} | linkedin=${unwrapLinkedin(p.socials) ?? '—'}`);
  console.log(`    listMemberships=${JSON.stringify(p.listMemberships)}`);
  console.log(`    edgesTo=${counts.edgesTo} edgesFrom=${counts.edgesFrom} paths=${counts.paths}`);
}

async function findByName(nameQuery: string): Promise<void> {
  const profiles = await prisma.masterProfile.findMany({
    where: { canonicalName: { contains: nameQuery, mode: 'insensitive' } },
    orderBy: { personKey: 'asc' },
  });
  console.log(`Found ${profiles.length} MasterProfile(s) matching "${nameQuery}":`);
  if (profiles.length === 0) return;

  const uids = profiles.map((p) => p.uid);
  const { toMap, fromMap, pathMap } = await graphCounts(uids);
  for (const p of profiles) {
    printProfile(p, {
      edgesTo: toMap.get(p.uid) ?? 0,
      edgesFrom: fromMap.get(p.uid) ?? 0,
      paths: pathMap.get(p.uid) ?? 0,
    });
    console.log('');
  }

  if (profiles.length >= 2) {
    const byStrength = [...profiles].sort((a, b) => personKeyStrength(b.personKey) - personKeyStrength(a.personKey));
    const suggestedCanonical = byStrength[0];
    const suggestedDupes = byStrength.slice(1).map((p) => p.uid);
    console.log('Suggested merge (strongest personKey as canonical):');
    console.log(`  --canonical ${suggestedCanonical.uid} --duplicates ${suggestedDupes.join(',')}`);
    console.log(
      'Note: prefer the profile with correct firm/Affinity id when identity strength ties or data is polluted.'
    );
  }
}

async function reportNameDupes(): Promise<void> {
  const profiles = await prisma.masterProfile.findMany({
    where: { types: { has: 'investor' } },
    select: { uid: true, personKey: true, canonicalName: true, currentOrg: true, affinityPersonId: true },
  });

  const byName = new Map<string, typeof profiles>();
  for (const p of profiles) {
    const key = p.canonicalName.trim().toLowerCase().replace(/\s+/g, ' ');
    if (!key) continue;
    const list = byName.get(key) ?? [];
    list.push(p);
    byName.set(key, list);
  }

  const dupes = [...byName.entries()]
    .filter(([, list]) => list.length > 1)
    .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));

  console.log(`Investor name-duplicate clusters: ${dupes.length}`);
  for (const [name, list] of dupes.slice(0, 50)) {
    console.log(`\n${name} (${list.length})`);
    for (const p of list) {
      console.log(`  ${p.uid}  ${p.personKey}  affinity=${p.affinityPersonId ?? '—'}  org=${p.currentOrg ?? '—'}`);
    }
  }
  if (dupes.length > 50) console.log(`\n… and ${dupes.length - 50} more clusters`);
}

function toMergeRow(p: {
  uid: string;
  personKey: string;
  types: string[];
  canonicalName: string;
  memberUid: string | null;
  affinityPersonId: string | null;
  investorOutreachId: string | null;
  emails: unknown;
  phones: unknown;
  socials: unknown;
  organizations: unknown;
  experience: unknown;
  education: unknown;
  investorMeta: unknown;
  funds: unknown;
  investedIn: unknown;
  coInvestments: unknown;
  plBacking: unknown;
  locations: unknown;
  listMemberships: unknown;
  raw: unknown;
  sourceSnapshots: unknown;
  currentOrg: string | null;
  currentTitle: string | null;
  bio: string | null;
  contentHash: string | null;
  enrichmentVersion: string | null;
  enrichedAt: Date | null;
}): MasterProfileMergeRow {
  return { ...p };
}

async function runMerge(canonicalUid: string, duplicateUids: string[], apply: boolean): Promise<void> {
  const allUids = [canonicalUid, ...duplicateUids];
  const profiles = await prisma.masterProfile.findMany({ where: { uid: { in: allUids } } });
  const byUid = new Map(profiles.map((p) => [p.uid, p]));

  if (!byUid.has(canonicalUid)) {
    throw new Error(`Canonical MasterProfile not found: ${canonicalUid}`);
  }
  for (const uid of duplicateUids) {
    if (!byUid.has(uid)) throw new Error(`Duplicate MasterProfile not found: ${uid}`);
    if (uid === canonicalUid) throw new Error('Duplicate uid cannot equal canonical');
  }

  const canonical = toMergeRow(byUid.get(canonicalUid)!);
  const duplicates = duplicateUids.map((uid) => toMergeRow(byUid.get(uid)!));
  const merged = mergeMasterProfileFields(canonical, duplicates);
  const remap = buildUidRemap(canonicalUid, duplicateUids);

  const [edges, paths] = await Promise.all([
    prisma.connectionEdge.findMany({
      where: {
        OR: [{ fromProfileUid: { in: allUids } }, { toProfileUid: { in: allUids } }],
      },
    }),
    prisma.warmPathV2.findMany({
      where: {
        OR: [{ targetProfileUid: { in: allUids } }, { bestConnectorProfileUid: { in: allUids } }],
      },
    }),
  ]);

  const edgePlan = planEdgeRewire(edges, remap);
  const pathPlan = planPathRewire(paths, remap);

  console.log('Merge plan');
  console.log(`  canonical=${canonicalUid}`);
  console.log(`  duplicates=${duplicateUids.join(',')}`);
  console.log(`  personKey ${canonical.personKey} → ${merged.personKey}`);
  console.log(`  affinityPersonId → ${merged.affinityPersonId ?? '—'}`);
  console.log(`  org → ${merged.currentOrg ?? '—'}`);
  console.log(`  types → ${merged.types.join(',')}`);
  console.log(`  edges: update=${edgePlan.updates.length} delete=${edgePlan.deleteUids.length}`);
  console.log(`  paths: update=${pathPlan.updates.length} delete=${pathPlan.deleteUids.length}`);

  if (!apply) {
    console.log('Dry run — pass --apply to write.');
    return;
  }

  // Remote DBs often exceed Prisma's default 5s interactive-transaction timeout (P2028).
  await prisma.$transaction(
    async (tx) => {
      // Free unique personKey on duplicates before updating canonical.
      for (const uid of duplicateUids) {
        await tx.masterProfile.update({
          where: { uid },
          data: { personKey: `__merged_into:${canonicalUid}:${uid}` },
        });
      }

      await tx.masterProfile.update({
        where: { uid: canonicalUid },
        data: {
          personKey: merged.personKey,
          types: merged.types,
          canonicalName: merged.canonicalName,
          memberUid: merged.memberUid,
          affinityPersonId: merged.affinityPersonId,
          investorOutreachId: merged.investorOutreachId,
          emails: (merged.emails ?? Prisma.DbNull) as Prisma.InputJsonValue | typeof Prisma.DbNull,
          phones: (merged.phones ?? Prisma.DbNull) as Prisma.InputJsonValue | typeof Prisma.DbNull,
          socials: (merged.socials ?? Prisma.DbNull) as Prisma.InputJsonValue | typeof Prisma.DbNull,
          organizations: (merged.organizations ?? Prisma.DbNull) as Prisma.InputJsonValue | typeof Prisma.DbNull,
          experience: (merged.experience ?? Prisma.DbNull) as Prisma.InputJsonValue | typeof Prisma.DbNull,
          education: (merged.education ?? Prisma.DbNull) as Prisma.InputJsonValue | typeof Prisma.DbNull,
          investorMeta: (merged.investorMeta ?? Prisma.DbNull) as Prisma.InputJsonValue | typeof Prisma.DbNull,
          funds: (merged.funds ?? Prisma.DbNull) as Prisma.InputJsonValue | typeof Prisma.DbNull,
          investedIn: (merged.investedIn ?? Prisma.DbNull) as Prisma.InputJsonValue | typeof Prisma.DbNull,
          coInvestments: (merged.coInvestments ?? Prisma.DbNull) as Prisma.InputJsonValue | typeof Prisma.DbNull,
          plBacking: (merged.plBacking ?? Prisma.DbNull) as Prisma.InputJsonValue | typeof Prisma.DbNull,
          locations: (merged.locations ?? Prisma.DbNull) as Prisma.InputJsonValue | typeof Prisma.DbNull,
          listMemberships: (merged.listMemberships ?? Prisma.DbNull) as Prisma.InputJsonValue | typeof Prisma.DbNull,
          raw: (merged.raw ?? Prisma.DbNull) as Prisma.InputJsonValue | typeof Prisma.DbNull,
          sourceSnapshots: (merged.sourceSnapshots ?? Prisma.DbNull) as Prisma.InputJsonValue | typeof Prisma.DbNull,
          currentOrg: merged.currentOrg,
          currentTitle: merged.currentTitle,
          bio: merged.bio,
          contentHash: null,
          enrichmentVersion: merged.enrichmentVersion,
          enrichedAt: merged.enrichedAt,
        },
      });

      // Drop colliding losers first, then park remaps on temp unique keys, then finalize.
      // Avoids P2002 on @@unique during in-place endpoint/rank updates (surfaces as P2028 after abort).
      if (edgePlan.deleteUids.length) {
        await tx.connectionEdge.deleteMany({ where: { uid: { in: edgePlan.deleteUids } } });
      }
      for (const u of edgePlan.updates) {
        await tx.connectionEdge.update({
          where: { uid: u.uid },
          data: {
            fromProfileUid: `__merge_tmp_from:${u.uid}`,
            toProfileUid: `__merge_tmp_to:${u.uid}`,
          },
        });
      }
      for (const u of edgePlan.updates) {
        await tx.connectionEdge.update({
          where: { uid: u.uid },
          data: { fromProfileUid: u.fromProfileUid, toProfileUid: u.toProfileUid },
        });
      }

      if (pathPlan.deleteUids.length) {
        await tx.warmPathV2.deleteMany({ where: { uid: { in: pathPlan.deleteUids } } });
      }
      for (const [i, u] of pathPlan.updates.entries()) {
        await tx.warmPathV2.update({
          where: { uid: u.uid },
          data: {
            targetProfileUid: `__merge_tmp_path:${u.uid}`,
            rank: -(i + 1),
          },
        });
      }
      for (const u of pathPlan.updates) {
        await tx.warmPathV2.update({
          where: { uid: u.uid },
          data: {
            targetProfileUid: u.targetProfileUid,
            rank: u.rank,
            score: u.score,
            hopCount: u.hopCount,
            hopChain: u.hopChain as Prisma.InputJsonValue,
            bestConnectorProfileUid: u.bestConnectorProfileUid,
            alternateConnectorProfileUids: (u.alternateConnectorProfileUids ?? Prisma.DbNull) as
              | Prisma.InputJsonValue
              | typeof Prisma.DbNull,
          },
        });
      }

      await tx.masterProfile.deleteMany({ where: { uid: { in: duplicateUids } } });
    },
    { maxWait: 20_000, timeout: 120_000 }
  );

  console.log('Applied merge.');
}

/**
 * Auto-dedupe: group all profiles by normalized name, union rows sharing
 * same-person evidence (affinity id / memberUid / email domain / org overlap),
 * then merge each cluster (dry-run unless --apply).
 */
async function runAutoMerge(apply: boolean): Promise<void> {
  const profiles = await prisma.masterProfile.findMany({
    select: {
      uid: true,
      personKey: true,
      canonicalName: true,
      memberUid: true,
      affinityPersonId: true,
      emails: true,
      organizations: true,
      currentOrg: true,
      types: true,
    },
  });

  const byName = new Map<string, typeof profiles>();
  for (const p of profiles) {
    const key = normalizePersonName(p.canonicalName);
    if (!key) continue;
    const list = byName.get(key) ?? [];
    list.push(p);
    byName.set(key, list);
  }

  const nameClusters = [...byName.entries()].filter(([, list]) => list.length > 1);
  console.log(`Name-duplicate clusters: ${nameClusters.length}`);

  let mergeGroups = 0;
  let skippedNames = 0;
  for (const [name, rows] of nameClusters) {
    const clusters = clusterSamePersons(rows);
    if (clusters.length === 0) {
      skippedNames += 1;
      console.log(`\nSKIP "${name}" (${rows.length} rows, no shared evidence):`);
      for (const r of rows) {
        console.log(`  ${r.uid}  ${r.personKey}  org=${r.currentOrg ?? '—'}`);
      }
      continue;
    }
    for (const cluster of clusters) {
      mergeGroups += 1;
      const canonical = pickAutoMergeCanonical(cluster.rows);
      const duplicates = cluster.rows.filter((r) => r.uid !== canonical.uid).map((r) => r.uid);
      console.log(`\nMERGE "${name}" (${cluster.rows.length} rows)`);
      for (const r of cluster.reasons) {
        console.log(`  evidence ${r.aUid} ↔ ${r.bUid}: ${r.rules.join(', ')}`);
      }
      await runMerge(canonical.uid, duplicates, apply);
    }
  }

  console.log(`\nAuto-merge summary: ${mergeGroups} merge group(s), ${skippedNames} name(s) skipped (no evidence).`);
  if (!apply) console.log('Dry run — pass --apply to write.');
}

async function main(): Promise<void> {
  const find = argValue('--find');
  const nameDupes = hasFlag('--name-dupes');
  const auto = hasFlag('--auto');
  const canonical = argValue('--canonical');
  const duplicatesRaw = argValue('--duplicates');
  const apply = hasFlag('--apply');

  if (find) {
    await findByName(find);
    return;
  }
  if (nameDupes) {
    await reportNameDupes();
    return;
  }
  if (auto) {
    await runAutoMerge(apply);
    return;
  }
  if (canonical && duplicatesRaw) {
    const duplicateUids = duplicatesRaw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (duplicateUids.length === 0) {
      throw new Error('--duplicates requires at least one uid');
    }
    await runMerge(canonical, duplicateUids, apply);
    return;
  }

  console.log(`Usage:
  --find "Marc Andreessen"
  --name-dupes
  --auto [--apply]
  --canonical <uid> --duplicates <uid[,uid]> [--apply]`);
  process.exit(1);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
