/**
 * LOCAL-ONLY ingest of the REAL Neuro Fund I LP run into the Investor DB.
 *
 * PERSON-GRAIN (matches the Affinity LP list, the outreach tracker, and the
 * existing investor DB): rows are PEOPLE, identified by their Affinity entity id
 * (the authoritative LP id domain in the PathfinderEntityCrosswalk design). Each
 * person inherits the warm-path proximity of their FIRM — the graph resolves
 * proximity at the firm level (you reach a firm via people-connectors), and every
 * person at that firm shares it. When a person spans multiple firms, the BEST
 * (warmest) firm's proximity + paths are used.
 *
 * Idempotent:
 *   1. Purge the demo cohort + prior real run + their pathfinder paths.
 *   2. For each person in the Affinity LP list (352080): create an
 *      InvestorOutreachRecord keyed by the Affinity entity id (investorId =
 *      canonicalId = affinity id), with name/email/firm + prestige enrichment by
 *      name, and write person-keyed PathfinderPath rows copied from the person's
 *      best firm (so WarmPathDetail resolves by investor_id = person).
 *   3. Repoint + graph the neuro-lp list and set membership to the people.
 *
 * Crosswalk note: the record's investorId/canonicalId IS the Affinity id; the
 * affinity<->directory uid crosswalk table population is a separate follow-up
 * (the LabOS badge already works via the email->member join).
 *
 * Duplicates: when a dedupeKey (email) already belongs to a record with a
 * DIFFERENT investorId, the seed does NOT overwrite that record's identity.
 * It writes a PathfinderEntityCrosswalk row (needsReview=true) so the match
 * shows up in the Crosswalk Review panel for human confirmation, keeps the
 * existing record as canonical, and attaches this run's warm paths to it.
 *
 * Reads the runner dump + Affinity raw pull + prestige cache from local scratch
 * (PII, never committed). NOT for production. Run via `npm run api:seed-pathfinder-neuro`.
 */
import { readFileSync } from 'fs';
import { PrismaClient, Prisma } from '@prisma/client';
import { affinityBoost, blendGraphScore, comparePathsByWarmth } from './affinity-warmth-boost.util';
import { buildAffinityDirectPath, passesAffinityDirectThreshold } from './affinity-direct-path.util';
import { finalizePersonHopChain } from './path-route.util';
import { loadMemberNameIndex, loadPortfolioFounderIndex, normalizePersonName } from './founder-member-resolve.util';
import { loadMemberContactIndex } from './org-contact-resolve.util';
import { loadDirectoryTeamIndex } from './org-team-resolve.util';
import { resolvePathfinderScratchDir } from './pathfinder-scratch.util';
import {
  buildRawPayload,
  mapAffinityListEntry,
  mergeProfileFields,
  type MemberResolver,
} from './affinity-roster-mapper.util';
import { buildMergedPlConnectors, loadPlConnectorsFromFile } from './pl-relationship-seed.util';
import { loadPrestigeByName, toEnrichment } from './prestige-seed.util';
import { buildFirmByLabelIndex, lookupFirmProximity, type FirmProximity } from './firm-proximity-seed.util';
import { loadPriorBackingMap } from './pl-investors-seed.util';
import { applyPriorBackingToHopChain, backingWarmthBoost } from './prior-backing-warmth.util';
import {
  applyPathAttributionAndWarmth,
  buildLinkedInOnlyPath,
  lookupAllSocialOverlapsForInvestor,
  lookupAllSocialOverlapsForPath,
  pickBestLinkedInOnlyOverlap,
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

const TARGET_SET = 'neuro-fund-i';
/** Legacy default from run-pathfinder before TARGET_SET was aligned to neuro-fund-i. */
const LEGACY_DUMP_TARGET_SET = 'lp-target-set';
const NEW_SOURCE = 'PATHFINDER_NEURO';
const DEMO_SOURCE = 'DEMO_PATHFINDER';
const DEMO_TARGET_SET = 'demo-neuro-lp';
const DEMO_RUN_ID = 'demo-seed';
const RUN_ID = 'neuro-person-seed';
const LIST_SLUG = 'neuro-lp';

const SCRATCH_DIR = resolvePathfinderScratchDir();
const DUMP_PATH = `${SCRATCH_DIR}/_pathfinder_dump.json`;
const AFFINITY_PATH = `${SCRATCH_DIR}/_affinity_352080.json`;
const PRESTIGE_PATH = process.env.PATHFINDER_PRESTIGE_CACHE || `${SCRATCH_DIR}/_lp_prestige_cache.json`;
// Per-LP PL venture-team connector (relationship axis), keyed by Affinity person
// id — precomputed by pln-data-enrichment scripts/pull-affinity-pl-relationships.ts.
const PL_REL_PATH = `${SCRATCH_DIR}/_pl_relationships_352080.json`;
const SOCIAL_OVERLAP_PATH = `${SCRATCH_DIR}/_social_overlap_cache.json`;

// ── Types (loose — these are local scratch JSON shapes) ──────────────────────
interface DumpPath {
  targetInvestorId: string;
  connectorType: string;
  hops: number;
  caliber: string | null;
  caliberConfidence: number | null;
  proximityCode: string;
  score: number;
  rank: number;
  hopChain: unknown;
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

/** Firm names attached to an Affinity person's `companies` field. */
function entryFirmNames(entity: AffinityEntity): string[] {
  const comp = (entity.fields ?? []).find((f) => f.id === 'companies');
  const data = comp?.value?.data;
  if (!Array.isArray(data)) return [];
  return data
    .map((d) => (d && typeof d === 'object' ? (d as { name?: unknown }).name : null))
    .filter((n): n is string => typeof n === 'string' && n.trim().length > 0);
}

/** Warmer = smaller. Cold (no path) sinks last. */
function proximityRank(code: string | null, hasPath: boolean): number {
  if (!hasPath || !code) return 1e9;
  const m = /\+(\d)([AB])/.exec(code); // e.g. VC+2A -> hops=2 caliber=A
  if (!m) return 1e6;
  const caliber = m[2] === 'A' ? 0 : 1;
  const hops = parseInt(m[1], 10);
  return caliber * 100 + hops;
}

async function cleanup() {
  await prisma.pathfinderPath.deleteMany({
    where: { targetSet: { in: [DEMO_TARGET_SET, TARGET_SET] } },
  });
  await prisma.pathfinderEntityCrosswalk.deleteMany({
    where: { ingestRunId: { in: [DEMO_RUN_ID, RUN_ID] } },
  });
  // Delete ONLY rows this seed created itself (createdAt ~ updatedAt at creation).
  // Rows that pre-existed in the investor DB and were absorbed by a pre-fix run
  // (their source was overwritten to PATHFINDER_NEURO) have a drifted updatedAt —
  // sparing them preserves real investor data; the seed loop below re-matches
  // them by dedupeKey and updates in place instead of delete+recreate.
  await prisma.$executeRaw`
    DELETE FROM "InvestorOutreachRecord"
    WHERE source IN (${DEMO_SOURCE}, ${NEW_SOURCE})
      AND "updatedAt" - "createdAt" < interval '1 minute'`;
}

async function seed() {
  const dump = JSON.parse(readFileSync(DUMP_PATH, 'utf-8')) as Dump;
  if (dump.targetSet !== TARGET_SET) {
    if (dump.targetSet === LEGACY_DUMP_TARGET_SET) {
      console.warn(
        `dump targetSet "${dump.targetSet}" is legacy — paths will be stored as "${TARGET_SET}". ` +
          'Re-run run-pathfinder.ts (or set PATHFINDER_TARGET_SET=neuro-fund-i) to refresh the dump label.'
      );
    } else {
      throw new Error(`dump targetSet "${dump.targetSet}" != expected "${TARGET_SET}"`);
    }
  }
  const prestige = loadPrestigeByName(PRESTIGE_PATH);
  const v1PlConnectors = loadPlConnectorsFromFile(PL_REL_PATH);
  let personsWithConnector = 0;

  const firmByLabel = buildFirmByLabelIndex(dump.summaries);
  const pathsByFirm = new Map<string, DumpPath[]>();
  for (const p of dump.paths) {
    const arr = pathsByFirm.get(p.targetInvestorId) ?? [];
    arr.push(p);
    pathsByFirm.set(p.targetInvestorId, arr);
  }

  const entries = (JSON.parse(readFileSync(AFFINITY_PATH, 'utf-8')) as { entries?: AffinityEntry[] }).entries ?? [];
  const plConnectors = buildMergedPlConnectors(v1PlConnectors, entries, new Date().toISOString());

  // LabOS member uid by normalized email (investor routeNodes terminus).
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

  console.log('Loading founder → LabOS member indexes…');
  const portfolioTeams = await loadPortfolioFounderIndex(prisma);
  const membersByName = await loadMemberNameIndex(prisma);
  const memberContactIndex = await loadMemberContactIndex(prisma);
  const teamIndex = await loadDirectoryTeamIndex(prisma);
  const founderIndexes = { portfolioTeams, membersByName };
  console.log(`  portfolio teams: ${portfolioTeams.size} keys, unique member names: ${membersByName.size}`);
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

  // ── Pass 1 (pure memory): classify every entry against a one-shot snapshot
  // of existing records. All writes happen in bulk afterwards — the previous
  // row-by-row awaits cost 3-5 round-trips per person and took minutes over a
  // remote DB.
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
  const PENDING_ID = -1; // marks rows queued for creation in this run

  let duplicates = 0;
  let reachable = 0;
  let enriched = 0;
  const seenAffinity = new Set<string>();
  /** investorIds to enroll in the neuro-lp list (the existing record's id when a duplicate was detected). */
  const memberIds: string[] = [];

  const creates: Prisma.InvestorOutreachRecordCreateManyInput[] = [];
  const createByInvestorId = new Map<string, Prisma.InvestorOutreachRecordCreateManyInput>();
  const updates: { id: number; data: Prisma.InvestorOutreachRecordUpdateInput }[] = [];
  const crosswalkRows: Prisma.PathfinderEntityCrosswalkCreateManyInput[] = [];
  const pathInserts: Prisma.PathfinderPathCreateManyInput[] = [];
  /** investorIds whose paths are already queued this run (avoid double-attach). */
  const pathTargetsQueued = new Set<string>();
  let pathsWithSocialOverlap = 0;
  /** Duplicate matches that may need this run's paths attached to the existing record. */
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

    type PathCandidate = DumpPath & { score: number; socialOverlap?: SocialOverlapEntry };
    const firmPaths = pathsByFirm.get(firmId) ?? [];
    const candidates: PathCandidate[] = firmPaths.map((p) => ({
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

    if (candidates.length === 0 && socialOverlapCache) {
      const liOverlap = pickBestLinkedInOnlyOverlap(
        lookupAllSocialOverlapsForInvestor(socialOverlapCache, targetInvestorId),
      );
      if (liOverlap) {
        const liPath = buildLinkedInOnlyPath({
          targetInvestorId,
          overlap: liOverlap,
          caliber: 'B',
          caliberConfidence: 0.4,
        });
        candidates.push({ ...liPath, rank: 0 } as PathCandidate);
      }
    }

    if (candidates.length === 0) return null;

    const sorted = [...candidates].sort(comparePathsByWarmth);

    let rank1Code: string | null = null;
    for (let i = 0; i < sorted.length; i++) {
      const p = sorted[i];
      const rank = i + 1;
      if (rank === 1) rank1Code = p.proximityCode;

      let hopChain = JSON.parse(JSON.stringify(p.hopChain)) as Record<string, unknown>;
      if (rel?.bestConnector) {
        (hopChain as { plConnector?: unknown }).plConnector = rel.bestConnector;
        attachedHere = true;
      }
      hopChain = finalizePersonHopChain(hopChain, person, founderIndexes, p.hops, memberContactIndex, teamIndex);
      hopChain = applyPriorBackingToHopChain(hopChain, priorBacking);

      let overlaps: SocialOverlapEntry[] = [];
      if (socialOverlapCache) {
        overlaps = lookupAllSocialOverlapsForPath(socialOverlapCache, {
          investorId: targetInvestorId,
          hopChain: hopChain as PathHopChain,
          resolveMemberUidByName: (name) => membersByName.get(normalizePersonName(name)),
        });
        if (overlaps.length === 0 && p.socialOverlap) {
          overlaps = [p.socialOverlap];
        }
        if (overlaps.length > 0) pathsWithSocialOverlap += 1;
      }

      const attributed = applyPathAttributionAndWarmth({
        hopChain,
        pathScore: p.score,
        affinityConnector: rel?.bestConnector ?? null,
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
    if (!affinityId || seenAffinity.has(affinityId)) continue;
    seenAffinity.add(affinityId);

    const firstName = (ent.firstName ?? '').trim();
    const lastName = (ent.lastName ?? '').trim();
    const realEmail = resolvePrimaryEmail(ent);
    const additionalEmails = resolveAdditionalEmails(realEmail, ent);
    const email = realEmail || `aff-${affinityId}@lp.local`;
    // dedupeKey = normalized email (prod convention) so this person matches the
    // existing investor DB on ingest; aff-<id> fallback when no real email.
    const dedupeKey = normalizeEmailKey(realEmail) || `aff-${affinityId}`;
    const firms = entryFirmNames(ent);

    // Best (warmest) firm across this person's companies.
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
      !!socialOverlapCache &&
      lookupAllSocialOverlapsForInvestor(socialOverlapCache, affinityId).length > 0;
    const personHasPath = hasGraphPath || hasAffinityDirect || hasLinkedInOnly;

    const prest = prestige.get(norm(`${firstName} ${lastName}`)) ?? null;
    const enrichment = prest ? toEnrichment(prest) : undefined;
    if (enrichment) enriched += 1;

    const { profile: affinityProfile, affinityData } = mapAffinityListEntry(ent, { memberResolver });

    let bestProximityForRecord: string | null = personHasPath && best ? best.code : null;

    // Match by dedupeKey (prod convention) — a person may already exist via the
    // Gold list (same Affinity id) or the wider investor DB (same email).
    const existing = byDedupeKey.get(dedupeKey) ?? byInvestorId.get(affinityId);

    if (existing && existing.investorId !== affinityId) {
      // Same email, DIFFERENT id: a duplicate entity, not this run's row. Never
      // steal the existing record's identity (the silent upsert here is what
      // rewrote 49 pre-existing investors on dev) — queue the match for human
      // confirmation in the crosswalk review instead, and keep the existing
      // record as canonical.
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

    // Same Affinity id (re-run / Gold-shared person) or brand new. On update,
    // leave source untouched so Gold-first shared people stay gold-sourced (and
    // each seed's cleanup only ever deletes its own rows).
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
      const createInput = { dedupeKey, source: NEW_SOURCE, ...recordFields };
      creates.push(createInput);
      createByInvestorId.set(affinityId, createInput);
      const pending: ExistingRef = { id: PENDING_ID, dedupeKey, investorId: affinityId };
      byDedupeKey.set(dedupeKey, pending);
      byInvestorId.set(affinityId, pending);
    }
    memberIds.push(affinityId);
  }

  // ── Pass 2: surface this run's warm paths on duplicate-matched existing
  // records that have none. One grouped count instead of one count per match;
  // count actual rows (not the hasPath flag) since cleanup() purges this target
  // set's paths each run.
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

  // ── Pass 3: bulk writes. Records before paths (paths FK onto investorId).
  console.log(
    `Writing ${creates.length} new records, ${updates.length} updates, ` +
      `${pathInserts.length} paths, ${crosswalkRows.length} crosswalk rows…`
  );
  console.log(
    `  PL-team connector attached to ${personsWithConnector} people` +
      (plConnectors.size ? ` (of ${plConnectors.size} LPs in the relationship file)` : ' (no relationship file)')
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
    ids: memberIds,
  };
}

async function repointListAndMembers(ids: string[]): Promise<number> {
  const list = await prisma.investorList.upsert({
    where: { slug: LIST_SLUG },
    update: { isGraphed: true, targetSet: TARGET_SET, externalRef: '352080' },
    create: {
      slug: LIST_SLUG,
      name: 'Neuro Fund I LP Pipeline',
      description: 'Curated LP pipeline for Neuro Fund I. Proximity is graphed for this list.',
      source: 'affinity',
      externalRef: '352080',
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
      note: 'Seeded from the real Neuro Fund I LP run (person-grain).',
    })),
    skipDuplicates: true,
  });
  return records.length;
}

async function main() {
  console.log('Purging demo cohort + prior real run…');
  await cleanup();
  console.log('Creating person-grain LP records + paths…');
  const { created, updated, duplicates, reachable, enriched, pathRows, ids } = await seed();
  console.log('Repointing neuro-lp list + membership…');
  const members = await repointListAndMembers(ids);
  console.log('— Real Neuro LP seed (person-grain) complete —');
  console.log(
    `created: ${created} | updated in place: ${updated} | ` +
      `duplicates (queued for crosswalk review): ${duplicates} | ` +
      `reachable (has warm path): ${reachable} | enriched: ${enriched} | ` +
      `path rows: ${pathRows} | neuro-lp members: ${members}`
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
