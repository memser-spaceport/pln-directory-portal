import {Injectable, BadRequestException, Logger} from '@nestjs/common';
import {PrismaService} from '../shared/prisma.service';
import {parse} from 'csv-parse/sync';
import * as iconv from 'iconv-lite';
import {Prisma} from "@prisma/client";

type ImportParams = {
  csvBuffer: Buffer;
  dryRun: boolean;
  matchBy: 'uid' | 'name' | 'auto';
  requestorEmail: string;
  delimiter: string;
  encoding: string;
};

type AnyRow = Record<string, unknown>;

const MAX_REASON_SAMPLES = 15;

// Optional alias map if you ever want business labels -> tiers
const TIER_ALIASES: Record<string, number> = {
  'tier1': 1, 'tier-1': 1, 'tier 1': 1, 't1': 1, 'level1': 1, 'level-1': 1, 'level 1': 1,
  'tier2': 2, 'tier-2': 2, 'tier 2': 2, 't2': 2, 'level2': 2, 'level-2': 2, 'level 2': 2,
  'tier3': 3, 'tier-3': 3, 'tier 3': 3, 't3': 3, 'level3': 3, 'level-3': 3, 'level 3': 3,
  'tier4': 4, 'tier-4': 4, 'tier 4': 4, 't4': 4, 'level4': 4, 'level-4': 4, 'level 4': 4,
};

/** Normalize a header key for robust matching */
function normKey(k: string): string {
  return k.trim().toLowerCase().replace(/[\s\-_()]/g, '');
}

/** Try to find a key in row that matches any of candidates OR satisfies a predicate */
function findKey(keys: string[], candidates: string[], pred?: (nk: string, raw: string) => boolean): string | undefined {
  const normalized = keys.map(k => ({raw: k, nk: normKey(k)}));
  // strict candidates
  for (const c of candidates) {
    const nc = normKey(c);
    const hit = normalized.find(x => x.nk === nc);
    if (hit) return hit.raw;
  }
  // predicate fallback
  if (pred) {
    const hit = normalized.find(x => pred(x.nk, x.raw));
    return hit?.raw;
  }
  return undefined;
}

/** Parse tier from many forms: 1..4, "tier 1", "t3", "level-4", aliases map, etc. */
function parseTierLoose(input: unknown): number {
  if (input == null) return NaN;

  if (typeof input === 'number') return input;

  const raw = String(input).trim();
  if (!raw) return NaN;

  const lower = raw.toLowerCase();

  if (lower in TIER_ALIASES) return TIER_ALIASES[lower];

  // if contains a digit 1..4 anywhere (e.g., "Tier (0 - 4): 3", "t2")
  const m = lower.match(/[1-4]/);
  if (m) return Number(m[0]);

  const n = Number(lower);
  if (Number.isFinite(n)) return n;

  return NaN;
}

@Injectable()
export class AdminTeamsService {
  private readonly logger = new Logger(AdminTeamsService.name);

  constructor(private readonly prisma: PrismaService) {
  }

  async importTiersFromCsv(params: ImportParams) {
    const {csvBuffer, dryRun, matchBy, delimiter, encoding} = params;

    // Decode & parse CSV
    const decoded = iconv.decode(csvBuffer, encoding as any);
    const rows = parse(decoded, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      delimiter,
    }) as AnyRow[];

    if (!rows.length) {
      throw new BadRequestException('CSV is empty or has no header');
    }

    // Flexible header resolution per file (works with both: "tier", "Tier (0 - 4)", etc.)
    const headerKeys = Object.keys(rows[0] ?? {});
    const uidKey =
      findKey(headerKeys, ['uid', 'team_uid', 'teamuid', 'id'], (nk) => nk.includes('uid')) ?? 'uid';

    const nameKey =
      findKey(headerKeys, ['name', 'team_name', 'teamname'], (nk) => nk.includes('name')) ?? 'name';

    // Any column that *mentions* tier qualifies; also accept "level"/"rank" as fallback
    const tierKey =
      findKey(headerKeys, ['tier'], (nk, raw) => nk.includes('tier')) ??
      findKey(headerKeys, ['level', 'rank'], (nk) => nk.includes('level') || nk.includes('rank'));

    let defaultTierUsed = false;
    if (!tierKey) {
      // If file has no tier column at all (e.g., a short UID-only CSV), default to tier=1
      defaultTierUsed = true;
      this.logger.warn(
        '[CSV] No tier-like column found; applying default TIER=1 to all rows.',
      );
    } else {
      this.logger.log(`[CSV] Detected columns -> uid: "${uidKey}" | name: "${nameKey}" | tier: "${tierKey}"`);
    }

    // Normalize & validate
    const norm = this.normalize(rows, matchBy, {uidKey, nameKey, tierKey, defaultTierUsed});

    // Summary logs
    this.logger.log(
      `CSV parsed: total=${rows.length}, valid=${norm.valid.length}, invalidTier=${norm.invalidTier.length}, noKey=${norm.noKey.length}, dups=${norm.duplicates}, keyType=${norm.keyType}`,
    );

    // Print reasons (first N)
    if (norm.reasons.invalidTier.length) {
      this.logger.warn(`[Reasons] invalidTier (showing up to ${MAX_REASON_SAMPLES}):`);
      norm.reasons.invalidTier.slice(0, MAX_REASON_SAMPLES).forEach((s, i) => this.logger.warn(`  #${i + 1} ${s}`));
    }
    if (norm.reasons.noKey.length) {
      this.logger.warn(`[Reasons] noKey (showing up to ${MAX_REASON_SAMPLES}):`);
      norm.reasons.noKey.slice(0, MAX_REASON_SAMPLES).forEach((s, i) => this.logger.warn(`  #${i + 1} ${s}`));
    }
    if (norm.reasons.duplicates.length) {
      this.logger.warn(`[Reasons] duplicates dropped: ${norm.duplicates} (showing up to ${MAX_REASON_SAMPLES} samples)`);
      norm.reasons.duplicates.slice(0, MAX_REASON_SAMPLES).forEach((s, i) => this.logger.warn(`  #${i + 1} ${s}`));
    }

    if (dryRun) {
      return {
        dryRun: true as const,
        totalRows: rows.length,
        validRows: norm.valid.length,
        invalidTierRows: norm.invalidTier.length,
        noKeyRows: norm.noKey.length,
        duplicatesDropped: norm.duplicates,
        keyType: norm.keyType,
        sampleValid: norm.valid.slice(0, 5),
        note:
          norm.keyType === 'uid' && norm.valid.every((r) => !!r.uid && !r.name)
            ? 'Fast path available (single SQL UPDATE FROM VALUES).'
            : 'Will use chunked updates by uid or name.',
      };
    }

    // Perform updates
    let failedKeys: string[] = [];
    if (norm.keyType === 'uid' && norm.valid.every((r) => !!r.uid && !r.name)) {
      failedKeys = await this.updateByUidFast(norm.valid);
    } else {
      failedKeys = await this.updateByUidOrNameChunked(norm.valid);
    }

    if (failedKeys.length) {
      this.logger.warn(`[Update] Failed to update ${failedKeys.length} keys. Example(s): ${failedKeys.slice(0, 10).join(', ')}`);
    }

    return {
      dryRun: false as const,
      updatedCount: norm.valid.length - failedKeys.length,
      invalidTierRows: norm.invalidTier.length,
      noKeyRows: norm.noKey.length,
      duplicatesDropped: norm.duplicates,
      keyType: norm.keyType,
      ...(failedKeys.length ? {failedKeys} : {}),
    };
  }

  /**
   * Normalize CSV rows:
   * - choose keyType (uid/name) based on matchBy or content (auto)
   * - parse tier via parseTierLoose and enforce 1..4
   * - deduplicate by chosen key (first row wins)
   * - capture reasons for debugging (invalid tier / no key / duplicate)
   */
  private normalize(
    rows: AnyRow[],
    matchBy: 'uid' | 'name' | 'auto',
    keys: { uidKey: string; nameKey: string; tierKey?: string; defaultTierUsed: boolean },
  ) {
    const valid: { uid?: string; name?: string; tier: number }[] = [];
    const invalidTier: AnyRow[] = [];
    const noKey: AnyRow[] = [];
    const seen = new Set<string>();
    const reasons = {
      invalidTier: [] as string[],
      noKey: [] as string[],
      duplicates: [] as string[],
    };

    let keyType: 'uid' | 'name' = 'uid';
    if (matchBy === 'name') keyType = 'name';
    if (matchBy === 'auto') {
      const hasUid = rows.some((r) => (String(r[keys.uidKey] ?? '').trim().length > 0));
      const hasName = rows.some((r) => (String(r[keys.nameKey] ?? '').trim().length > 0));
      keyType = hasUid ? 'uid' : hasName ? 'name' : 'uid';
    }

    for (const r of rows) {
      const uid = String(r[keys.uidKey] ?? '').trim() || undefined;
      const name = String(r[keys.nameKey] ?? '').trim() || undefined;

      // Choose raw tier source
      const tierRaw = keys.tierKey ? r[keys.tierKey] : (keys.defaultTierUsed ? 1 : undefined);
      const tier = parseTierLoose(tierRaw);

      if (!(tier >= 1 && tier <= 4)) {
        invalidTier.push(r);
        if (reasons.invalidTier.length < MAX_REASON_SAMPLES) {
          reasons.invalidTier.push(
            `Row has invalid tier: value=${JSON.stringify(tierRaw)} parsed=${tier}; row=${JSON.stringify(r)}`,
          );
        }
        continue;
      }

      const key = keyType === 'uid' ? uid ?? '' : name ?? '';
      if (!key) {
        noKey.push(r);
        if (reasons.noKey.length < MAX_REASON_SAMPLES) {
          reasons.noKey.push(`Missing ${keyType} key; row=${JSON.stringify(r)}`);
        }
        continue;
      }

      const sig = `${keyType}:${key}`;
      if (seen.has(sig)) {
        if (reasons.duplicates.length < MAX_REASON_SAMPLES) {
          reasons.duplicates.push(`Duplicate ${sig}; row=${JSON.stringify(r)}`);
        }
        continue; // drop duplicates (first wins)
      }
      seen.add(sig);

      valid.push({uid, name, tier});
    }

    const duplicates = rows.length - (valid.length + invalidTier.length + noKey.length);
    return {valid, invalidTier, noKey, duplicates, keyType, reasons};
  }

  /**
   * Fast path — batched SQL UPDATE FROM (VALUES ...) joining by uid.
   * Returns keys that failed (Team not found).
   */
  private async updateByUidFast(rows: { uid?: string; tier: number }[]): Promise<string[]> {
    const chunkSize = 1000;
    const failed: string[] = [];

    for (let i = 0; i < rows.length; i += chunkSize) {
      const chunk = rows.slice(i, i + chunkSize).filter((r) => r.uid);

      const uids = chunk.map((r) => r.uid!);
      if (!uids.length) continue;

      // Prefetch existing UIDs to identify missing ones
      const existing = await this.prisma.team.findMany({
        where: {uid: {in: uids}},
        select: {uid: true},
      });
      const existingSet = new Set(existing.map((e) => e.uid));
      const missingInThisChunk = uids.filter((u) => !existingSet.has(u));
      failed.push(...missingInThisChunk.map((u) => `uid:${u}`));

      const toUpdate = chunk.filter((r) => existingSet.has(r.uid!));
      if (!toUpdate.length) {
        this.logger.log(`Fast update chunk: updated=0, missing=${missingInThisChunk.length}`);
        continue;
      }

      // Build VALUES list safely for Postgres using Prisma.sql
      const values = toUpdate.map((r) => Prisma.sql`(${r.uid!}, ${r.tier})`);

      await this.prisma.$executeRaw`
        UPDATE "Team" AS t
        SET "tier" = v.tier FROM (VALUES ${Prisma.join(values)}) AS v(uid
          , tier)
        WHERE v.uid = t.uid
      `;

      this.logger.log(`Fast update chunk: updated=${toUpdate.length}, missing=${missingInThisChunk.length}`);
    }

    return failed;
  }


  /**
   * Universal path — prefer uid, otherwise update by name. Chunked and transactional.
   * Returns keys that failed to update (not found / unique mismatch).
   */
  private async updateByUidOrNameChunked(rows: { uid?: string; name?: string; tier: number }[]) {
    const chunkSize = 300;
    const failed: string[] = [];

    for (let i = 0; i < rows.length; i += chunkSize) {
      const chunk = rows.slice(i, i + chunkSize);

      await this.prisma.$transaction(
        async (tx) => {
          for (const r of chunk) {
            try {
              if (r.uid) {
                await tx.team.update({where: {uid: r.uid}, data: {tier: r.tier}});
              } else if (r.name) {
                await tx.team.update({where: {name: r.name}, data: {tier: r.tier}});
              } else {
                failed.push('key:unknown');
              }
            } catch {
              failed.push(r.uid ? `uid:${r.uid}` : r.name ? `name:${r.name}` : 'key:unknown');
            }
          }
        },
        {timeout: 60_000},
      );
    }

    return failed;
  }
}
