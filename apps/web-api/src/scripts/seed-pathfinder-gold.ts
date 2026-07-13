/**
 * LOCAL-ONLY ingest of the Gold PLC Co-Investors run into the Investor DB.
 *
 * PERSON-GRAIN (the Gold list 183682 is a person list): rows are PEOPLE
 * (contacts at co-investor firms), identified by their Affinity entity id. Each
 * person inherits the proximity of their FIRM (best across firms). Prestige
 * enrichment by name when present in the shared LP prestige cache.
 *
 * PL venture-lead connectors are grafted from `_pl_relationships_183682.json`
 * (same pull as Neuro — run pull-affinity-pl-relationships.ts for both lists).
 *
 * Idempotent: purge prior gold run + its paths, create person records keyed by
 * Affinity id with person-keyed PathfinderPath rows copied from each person's best
 * firm, repoint + graph the gold-coinvestors list, set membership.
 *
 * Needs the gold runner dump (with firm_label) — regenerate via
 *   cd pln-data-enrichment/apps/data-enrichment && npx ts-node scripts/run-pathfinder-gold.ts
 * Reads scratch (firm names — never committed). NOT for production.
 * Run via `npm run api:seed-pathfinder-gold`.
 */
import { readFileSync } from 'fs';
import { PrismaClient, Prisma } from '@prisma/client';
import { affinityBoost, blendGraphScore, comparePathsByWarmth } from './affinity-warmth-boost.util';
import { buildAffinityDirectPath, passesAffinityDirectThreshold } from './affinity-direct-path.util';
import { finalizePersonHopChain } from './path-route.util';
import { loadMemberNameIndex, loadPortfolioFounderIndex, normalizePersonName } from './founder-member-resolve.util';
import { loadMemberContactIndex } from './org-contact-resolve.util';
import { loadDirectoryTeamIndex } from './org-team-resolve.util';
import { buildMergedPlConnectors, loadPlConnectorsFromFile } from './pl-relationship-seed.util';
import { resolvePathfinderScratchDir } from './pathfinder-scratch.util';
import {
  buildRawPayload,
  mapAffinityListEntry,
  mergeProfileFields,
  type MemberResolver,
} from './affinity-roster-mapper.util';
import { loadPrestigeByName, toEnrichment } from './prestige-seed.util';
import { buildFirmByLabelIndex, lookupFirmProximity, type FirmProximity } from './firm-proximity-seed.util';
import { loadPriorBackingMap } from './pl-investors-seed.util';
import { applyPriorBackingToHopChain, backingWarmthBoost } from './prior-backing-warmth.util';
import {
  applyPathAttributionAndWarmth,
  lookupAllSocialOverlapsForInvestor,
  mergeOrCreateLinkedInPathCandidates,
  shouldAttachAffinityToPath,
  type LinkedInMergeCandidate,
  type PathHopChain,
  type SocialOverlapCache,
  type SocialOverlapEntry,
} from './social-overlap-seed.util';
import {
  normalizeEmailKey,
  resolveAdditionalEmails,
  resolvePrimaryEmail,
  rosterNormalizedEmails,
} from '../investor-outreach/investor-email.util';

const prisma = new PrismaClient();

const TARGET_SET = 'gold-co-investors';
const SOURCE = 'PATHFINDER_GOLD';
const RUN_ID = 'gold-person-seed';
const LIST_SLUG = 'gold-coinvestors';

const SCRATCH_DIR = resolvePathfinderScratchDir();
const DUMP_PATH = `${SCRATCH_DIR}/_pathfinder_gold_dump.json`;
const AFFINITY_PATH = `${SCRATCH_DIR}/_affinity_183682.json`;
const PL_REL_PATH = `${SCRATCH_DIR}/_pl_relationships_183682.json`;
const PRESTIGE_PATH = process.env.PATHFINDER_PRESTIGE_CACHE || `${SCRATCH_DIR}/_lp_prestige_cache.json`;
const SOCIAL_OVERLAP_PATH = `${SCRATCH_DIR}/_social_overlap_cache.json`;

interface DumpPath {
  targetInvestorId: string;
  connectorType: string;
  hops: number;
  caliber: string | null;
  caliberConfidence: number | null;
  proximityCode: string;
  score: number;
  rank: number;
  hopChain: Record<string, unknown>;
}
interface DumpSummary {
  investor_id: string;
  firm_label: string;
  best_proximity_code: string;
  has_path: boolean;
}
interface Dump {
  targetSet: string;
  paths: DumpPath[];
  summaries: DumpSummary[];
}
interface AffinityField {
  id: string;
  value?: { data?: unknown };
}
interface AffinityEntity {
  id: number | string;
  firstName?: string | null;
  lastName?: string | null;
  primaryEmailAddress?: string | null;
  emailAddresses?: string[] | null;
  fields?: AffinityField[];
}
interface AffinityEntry {
  entity: AffinityEntity;
}

const norm = (s: string | null | undefined): string =>
  (s ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

function entryFirmNames(entity: AffinityEntity): string[] {
  const comp = (entity.fields ?? []).find((f) => f.id === 'companies');
  const data = comp?.value?.data;
  if (!Array.isArray(data)) return [];
  return data
    .map((d) => (d && typeof d === 'object' ? (d as { name?: unknown }).name : null))
    .filter((n): n is string => typeof n === 'string' && n.trim().length > 0);
}

function proximityRank(code: string | null, hasPath: boolean): number {
  if (!hasPath || !code) return 1e9;
  const m = /\+(\d)([AB])/.exec(code);
  if (!m) return 1e6;
  const caliber = m[2] === 'A' ? 0 : 1;
  return caliber * 100 + parseInt(m[1], 10);
}

async function cleanup() {
  await prisma.pathfinderPath.deleteMany({ where: { targetSet: TARGET_SET } });
  await prisma.pathfinderEntityCrosswalk.deleteMany({ where: { ingestRunId: RUN_ID } });
  await prisma.$executeRaw`
    DELETE FROM "InvestorOutreachRecord"
    WHERE source = ${SOURCE}
      AND "updatedAt" - "createdAt" < interval '1 minute'`;
}

async function seed() {
  const dump = JSON.parse(readFileSync(DUMP_PATH, 'utf-8')) as Dump;
  if (dump.targetSet !== TARGET_SET) {
    throw new Error(`dump targetSet "${dump.targetSet}" != expected "${TARGET_SET}"`);
  }
  const prestige = loadPrestigeByName(PRESTIGE_PATH);
  const firmByLabel = buildFirmByLabelIndex(dump.summaries);
  const pathsByFirm = new Map<string, DumpPath[]>();
  for (const p of dump.paths) {
    const arr = pathsByFirm.get(p.targetInvestorId) ?? [];
    arr.push(p);
    pathsByFirm.set(p.targetInvestorId, arr);
  }

  const entries = (JSON.parse(readFileSync(AFFINITY_PATH, 'utf-8')) as { entries?: AffinityEntry[] }).entries ?? [];
  const plConnectors = buildMergedPlConnectors(
    loadPlConnectorsFromFile(PL_REL_PATH),
    entries,
    new Date().toISOString()
  );

  console.log('Loading founder → LabOS member indexes…');
  const portfolioTeams = await loadPortfolioFounderIndex(prisma);
  const membersByName = await loadMemberNameIndex(prisma);
  const memberContactIndex = await loadMemberContactIndex(prisma);
  const teamIndex = await loadDirectoryTeamIndex(prisma);
  const founderIndexes = { portfolioTeams, membersByName };

  console.log(`  directory teams (L1+): ${teamIndex.byUid.size}`);

  console.log('Loading PL prior-backer index (Affinity list 166215)…');
  const priorBackingByInvestor = loadPriorBackingMap(SCRATCH_DIR, entries);
  console.log(`  prior backers matched: ${priorBackingByInvestor.size}`);

  let socialOverlapCache: SocialOverlapCache | null = null;
  try {
    socialOverlapCache = JSON.parse(readFileSync(SOCIAL_OVERLAP_PATH, 'utf-8')) as SocialOverlapCache;
    console.log(`Loaded social overlap cache (${Object.keys(socialOverlapCache).length} entries)`);
  } catch {
    console.warn(`WARN: social overlap cache missing — skipping (${SOCIAL_OVERLAP_PATH})`);
  }

  const entryEmails = entries.flatMap((e) => rosterNormalizedEmails(e.entity)).filter((em) => em.length > 0);
  const memberByEmail = new Map<string, string>();
  if (entryEmails.length > 0) {
    const members = await prisma.member.findMany({
      where: { email: { in: [...new Set(entryEmails)] } },
      select: { email: true, uid: true },
    });
    for (const m of members) {
      if (m.email) memberByEmail.set(normalizeEmailKey(m.email), m.uid);
    }
  }

  console.log(`Snapshotting existing records…`);
  type ExistingRef = { id: number; dedupeKey: string; investorId: string };
  const existingRows: ExistingRef[] = await prisma.investorOutreachRecord.findMany({
    select: { id: true, dedupeKey: true, investorId: true },
  });
  const byDedupeKey = new Map<string, ExistingRef>(existingRows.map((r) => [r.dedupeKey, r]));
  const byInvestorId = new Map<string, ExistingRef>(existingRows.map((r) => [r.investorId, r]));

  const existingProfileRows = await prisma.investorOutreachRecord.findMany({
    select: {
      id: true,
      investorId: true,
      linkedinUrl: true,
      title: true,
      geoFocus: true,
      investorType: true,
      sectorTags: true,
      stageFocus: true,
      checkSizeRange: true,
      firmDomain: true,
      rawPayload: true,
    },
  });
  const profileByInvestorId = new Map(existingProfileRows.map((r) => [r.investorId, r]));

  const memberResolver: MemberResolver = {
    byEmail: (email) => memberByEmail.get(email) ?? memberContactIndex.byEmail.get(email)?.uid,
    byName: (name) => membersByName.get(normalizePersonName(name)),
  };
  const PENDING_ID = -1;

  let duplicates = 0;
  let reachable = 0;
  let enriched = 0;
  const seen = new Set<string>();
  const memberIds: string[] = [];

  const creates: Prisma.InvestorOutreachRecordCreateManyInput[] = [];
  const createByInvestorId = new Map<string, Prisma.InvestorOutreachRecordCreateManyInput>();
  const updates: { id: number; data: Prisma.InvestorOutreachRecordUpdateInput }[] = [];
  const crosswalkRows: Prisma.PathfinderEntityCrosswalkCreateManyInput[] = [];
  const pathInserts: Prisma.PathfinderPathCreateManyInput[] = [];
  const pathTargetsQueued = new Set<string>();
  let pathsWithSocialOverlap = 0;
  let personsWithConnector = 0;
  const dupPathCandidates: {
    investorId: string;
    firmId: string;
    bestCode: string;
    firstName: string;
    lastName: string;
    memberUid?: string;
  }[] = [];

  const queuePaths = (
    targetInvestorId: string,
    firmId: string,
    person: { firstName: string; lastName: string; memberUid?: string; email?: string; role?: string }
  ): string | null => {
    const rel = plConnectors.get(targetInvestorId);
    const priorBacking = priorBackingByInvestor.get(targetInvestorId);
    const boost = Math.max(affinityBoost(rel?.bestConnector ?? null), backingWarmthBoost(priorBacking));
    let attachedHere = false;

    type PathCandidate = DumpPath & LinkedInMergeCandidate;
    const firmPaths = pathsByFirm.get(firmId) ?? [];
    let candidates: PathCandidate[] = firmPaths.map((p) => ({
      ...p,
      score: blendGraphScore(p.score, boost),
    }));

    if (rel?.bestConnector && passesAffinityDirectThreshold(rel.bestConnector)) {
      const baseCaliber = firmPaths[0]?.caliber ?? 'B';
      const baseConf = firmPaths[0]?.caliberConfidence ?? 0.4;
      const direct = buildAffinityDirectPath({
        targetInvestorId,
        plConnector: rel.bestConnector,
        caliber: baseCaliber,
        caliberConfidence: baseConf,
        targetSet: TARGET_SET,
        summary: rel.summary,
      });
      candidates.push({ ...direct, rank: 0, score: blendGraphScore(direct.score, boost) } as PathCandidate);
    }

    const resolveMemberUidByName = (name: string) => membersByName.get(normalizePersonName(name));
    if (socialOverlapCache) {
      candidates = mergeOrCreateLinkedInPathCandidates(
        candidates,
        lookupAllSocialOverlapsForInvestor(socialOverlapCache, targetInvestorId),
        {
          targetInvestorId,
          caliber: firmPaths[0]?.caliber ?? 'B',
          caliberConfidence: firmPaths[0]?.caliberConfidence ?? 0.4,
          resolveMemberUidByName,
        }
      );
    }

    if (candidates.length === 0) return null;

    const sorted = [...candidates].sort(comparePathsByWarmth);
    let rank1Code: string | null = null;

    for (let i = 0; i < sorted.length; i++) {
      const p = sorted[i];
      const rank = i + 1;
      if (rank === 1) rank1Code = p.proximityCode;

      let hopChain = JSON.parse(JSON.stringify(p.hopChain)) as Record<string, unknown>;
      const attachAffinity = shouldAttachAffinityToPath({
        linkedInOnly: p.linkedInOnly,
        hopChain: hopChain as PathHopChain,
        affinityConnector: rel?.bestConnector ?? null,
        resolveMemberUidByName,
      });
      if (attachAffinity && rel?.bestConnector) {
        (hopChain as { plConnector?: unknown }).plConnector = rel.bestConnector;
        attachedHere = true;
      }
      hopChain = finalizePersonHopChain(hopChain, person, founderIndexes, p.hops, memberContactIndex, teamIndex);
      hopChain = applyPriorBackingToHopChain(hopChain, priorBacking);

      let overlaps: SocialOverlapEntry[] = p.linkedInOverlaps ?? [];
      if (overlaps.length === 0 && p.socialOverlap) {
        overlaps = [p.socialOverlap];
      }
      if (overlaps.length > 0) pathsWithSocialOverlap += 1;

      const attributed = applyPathAttributionAndWarmth({
        hopChain,
        pathScore: p.score,
        affinityConnector: attachAffinity ? rel?.bestConnector ?? null : null,
        overlaps,
      });
      hopChain = attributed.hopChain;
      const score = attributed.score;
      const primaryOverlap = attributed.primaryOverlap;

      pathInserts.push({
        targetInvestorId,
        targetSet: TARGET_SET,
        connectorType: p.connectorType,
        hops: p.hops,
        caliber: p.caliber,
        proximityCode: p.proximityCode,
        score,
        caliberConfidence: p.caliberConfidence,
        hopChain: hopChain as Prisma.InputJsonValue,
        ...(primaryOverlap ? { socialOverlap: primaryOverlap as unknown as Prisma.InputJsonValue } : {}),
        rank,
        ingestRunId: RUN_ID,
      });
    }
    if (attachedHere) personsWithConnector += 1;
    pathTargetsQueued.add(targetInvestorId);
    return rank1Code;
  };

  console.log(`Processing ${entries.length} Affinity entries…`);
  for (const e of entries) {
    const ent = e.entity;
    const affinityId = String(ent.id);
    if (!affinityId || seen.has(affinityId)) continue;
    seen.add(affinityId);

    const firstName = (ent.firstName ?? '').trim();
    const lastName = (ent.lastName ?? '').trim();
    const realEmail = resolvePrimaryEmail(ent);
    const additionalEmails = resolveAdditionalEmails(realEmail, ent);
    const email = realEmail || `aff-${affinityId}@gold.local`;
    const dedupeKey = normalizeEmailKey(realEmail) || `aff-${affinityId}`;
    const firms = entryFirmNames(ent);

    let best: FirmProximity | null = null;
    for (const fn of firms) {
      const fp = lookupFirmProximity(fn, firmByLabel);
      if (!fp) continue;
      if (!best || proximityRank(fp.code, fp.hasPath) < proximityRank(best.code, best.hasPath)) {
        best = fp;
      }
    }
    const firmLabel = best?.label ?? firms[0] ?? '';
    const hasGraphPath = best?.hasPath ?? false;
    const relEntry = plConnectors.get(affinityId);
    const hasAffinityDirect = !!relEntry?.bestConnector && passesAffinityDirectThreshold(relEntry.bestConnector);
    const hasLinkedInOnly =
      !!socialOverlapCache && lookupAllSocialOverlapsForInvestor(socialOverlapCache, affinityId).length > 0;
    const personHasPath = hasGraphPath || hasAffinityDirect || hasLinkedInOnly;

    const prest = prestige.get(norm(`${firstName} ${lastName}`)) ?? null;
    const enrichment = prest ? toEnrichment(prest) : undefined;
    if (enrichment) enriched += 1;

    const { profile: affinityProfile, affinityData } = mapAffinityListEntry(ent, { memberResolver });

    let bestProximityForRecord: string | null = personHasPath && best ? best.code : null;

    const existing = byDedupeKey.get(dedupeKey) ?? byInvestorId.get(affinityId);

    if (existing && existing.investorId !== affinityId) {
      duplicates += 1;
      console.log(
        `  duplicate: affinity ${affinityId} (${firstName} ${lastName}) shares email with existing ` +
          `${existing.investorId} — queued for crosswalk review`
      );
      crosswalkRows.push({
        canonicalId: existing.investorId,
        affinityId,
        investorId: existing.investorId,
        entityType: 'person',
        displayName: `${firstName} ${lastName}`.trim() || null,
        firm: firmLabel || null,
        matchMethod: 'email',
        matchConfidence: 0.95,
        isConfirmed: false,
        needsReview: true,
        ingestRunId: RUN_ID,
      });
      if (best && personHasPath) {
        dupPathCandidates.push({
          investorId: existing.investorId,
          firmId: best.firmId,
          bestCode: best.code,
          firstName,
          lastName,
          memberUid: memberByEmail.get(dedupeKey),
        });
      }
      const canonicalProfile = profileByInvestorId.get(existing.investorId);
      if (canonicalProfile) {
        const mergedProfile = mergeProfileFields(canonicalProfile, affinityProfile);
        const rawPayload = buildRawPayload(undefined, affinityData, canonicalProfile.rawPayload);
        updates.push({
          id: canonicalProfile.id,
          data: {
            ...mergedProfile,
            ...(rawPayload ? { rawPayload: rawPayload as Prisma.InputJsonValue } : {}),
          },
        });
      }
      memberIds.push(existing.investorId);
      continue;
    }

    if (personHasPath) {
      reachable += 1;
      const rank1 = queuePaths(affinityId, best?.firmId ?? '', {
        firstName,
        lastName,
        memberUid: memberByEmail.get(dedupeKey),
        email: realEmail || undefined,
      });
      if (rank1) bestProximityForRecord = rank1;
    }

    const priorProfile = profileByInvestorId.get(affinityId);
    const mergedProfile = mergeProfileFields(priorProfile ?? {}, affinityProfile);
    const rawPayload = buildRawPayload(enrichment, affinityData, priorProfile?.rawPayload);
    const priorBacking = priorBackingByInvestor.get(affinityId);
    const recordFields = {
      investorId: affinityId,
      canonicalId: affinityId,
      firstName,
      lastName,
      email,
      additionalEmails,
      emailStatus: 'unverified',
      firm: firmLabel,
      ...mergedProfile,
      engagementTier: '',
      enrichmentStatus: enrichment ? 'enriched' : 'pending',
      bestProximityCode: bestProximityForRecord,
      hasPath: personHasPath,
      ...(rawPayload || priorBacking
        ? {
            rawPayload: {
              ...((rawPayload as Record<string, unknown> | undefined) ?? {}),
              ...(priorBacking ? { priorBacking } : {}),
            } as Prisma.InputJsonValue,
          }
        : {}),
    };

    if (existing) {
      updates.push({ id: existing.id, data: recordFields });
    } else {
      const createInput = { dedupeKey, source: SOURCE, ...recordFields };
      creates.push(createInput);
      createByInvestorId.set(affinityId, createInput);
      const pending: ExistingRef = { id: PENDING_ID, dedupeKey, investorId: affinityId };
      byDedupeKey.set(dedupeKey, pending);
      byInvestorId.set(affinityId, pending);
    }
    memberIds.push(affinityId);
  }

  const candidateIds = [...new Set(dupPathCandidates.map((d) => d.investorId))].filter(
    (id) => !pathTargetsQueued.has(id)
  );
  const pathCounts = candidateIds.length
    ? await prisma.pathfinderPath.groupBy({
        by: ['targetInvestorId'],
        where: { targetInvestorId: { in: candidateIds } },
        _count: { _all: true },
      })
    : [];
  const alreadyHasPaths = new Set(pathCounts.map((c) => c.targetInvestorId));
  for (const d of dupPathCandidates) {
    if (pathTargetsQueued.has(d.investorId) || alreadyHasPaths.has(d.investorId)) continue;
    reachable += 1;
    const rank1 =
      queuePaths(d.investorId, d.firmId, {
        firstName: d.firstName,
        lastName: d.lastName,
        memberUid: d.memberUid,
      }) ?? d.bestCode;
    const pendingCreate = createByInvestorId.get(d.investorId);
    if (pendingCreate) {
      pendingCreate.bestProximityCode = rank1;
      pendingCreate.hasPath = true;
    } else {
      const ref = byInvestorId.get(d.investorId);
      if (ref && ref.id !== PENDING_ID) {
        updates.push({ id: ref.id, data: { bestProximityCode: rank1, hasPath: true } });
      }
    }
  }

  console.log(
    `Writing ${creates.length} new records, ${updates.length} updates, ` +
      `${pathInserts.length} paths, ${crosswalkRows.length} crosswalk rows…`
  );
  console.log(
    `  PL-team connector attached to ${personsWithConnector} people` +
      (plConnectors.size ? ` (of ${plConnectors.size} in the relationship file)` : ' (no relationship file)')
  );
  console.log(`  pathsWithSocialOverlap: ${pathsWithSocialOverlap} / ${pathInserts.length} paths`);
  if (creates.length > 0) {
    await prisma.investorOutreachRecord.createMany({ data: creates, skipDuplicates: true });
  }
  const UPDATE_CHUNK = 100;
  for (let i = 0; i < updates.length; i += UPDATE_CHUNK) {
    await prisma.$transaction(
      updates
        .slice(i, i + UPDATE_CHUNK)
        .map((u) => prisma.investorOutreachRecord.update({ where: { id: u.id }, data: u.data }))
    );
  }
  const PATH_CHUNK = 500;
  for (let i = 0; i < pathInserts.length; i += PATH_CHUNK) {
    await prisma.pathfinderPath.createMany({ data: pathInserts.slice(i, i + PATH_CHUNK) });
  }
  if (crosswalkRows.length > 0) {
    await prisma.pathfinderEntityCrosswalk.createMany({ data: crosswalkRows });
  }
  return {
    created: creates.length,
    updated: updates.length,
    duplicates,
    reachable,
    enriched,
    pathRows: pathInserts.length,
    personsWithConnector,
    ids: memberIds,
  };
}

async function repointListAndMembers(ids: string[]): Promise<number> {
  const list = await prisma.investorList.upsert({
    where: { slug: LIST_SLUG },
    update: { isGraphed: true, targetSet: TARGET_SET, externalRef: '183682' },
    create: {
      slug: LIST_SLUG,
      name: 'Gold PLC Co-Investors',
      description: 'PLC Gold-tier co-investors. Proximity is graphed for this list.',
      source: 'affinity',
      externalRef: '183682',
      isGraphed: true,
      targetSet: TARGET_SET,
    },
  });
  await prisma.investorListMembership.deleteMany({ where: { listId: list.id } });
  const records = await prisma.investorOutreachRecord.findMany({
    where: { investorId: { in: ids } },
    select: { id: true },
  });
  await prisma.investorListMembership.createMany({
    data: records.map((r) => ({
      listId: list.id,
      investorOutreachRecordId: r.id,
      addedByEmail: 'seed@local',
      note: 'Seeded from the Gold co-investors run (person-grain).',
    })),
    skipDuplicates: true,
  });
  return records.length;
}

async function main() {
  console.log('Purging prior gold run…');
  await cleanup();
  console.log('Creating person-grain gold records + paths…');
  const { created, updated, duplicates, reachable, enriched, pathRows, personsWithConnector, ids } = await seed();
  console.log('Repointing gold-coinvestors list + membership…');
  const members = await repointListAndMembers(ids);
  console.log('— Gold seed (person-grain) complete —');
  console.log(
    `created: ${created} | updated in place: ${updated} | ` +
      `duplicates (queued for crosswalk review): ${duplicates} | ` +
      `reachable: ${reachable} | enriched: ${enriched} | path rows: ${pathRows} | ` +
      `PL connectors on paths: ${personsWithConnector} | members: ${members}`
  );
  if (duplicates > 0) {
    console.log('Review the duplicate matches in the Investor DB → Crosswalk review panel.');
  }
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
