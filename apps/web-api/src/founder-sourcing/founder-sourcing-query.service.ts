import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../shared/prisma.service';
import { FounderDto, PaginatedFoundersDto } from './dto/founder.dto';
import { FounderFiltersDto } from './dto/founder-filters.dto';
import { FounderKpiSummaryDto } from './dto/kpi-summary.dto';
import { FounderMethodologyDto } from './dto/methodology.dto';
import { ListFoundersQueryDto } from './dto/list-founders.query.dto';
import { toFounderDto } from './founder-sourcing.mapper';
import { isAllowedFundCode, parseFocusAreaList, parseReviewStatus, parseSourceList } from './founder-sourcing.vocab';

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;
const SORT_FIELDS = ['alignmentMax', 'lastSignalAt', 'plvsScore', 'createdAt'] as const;
type SortField = typeof SORT_FIELDS[number];

@Injectable()
export class FounderSourcingQueryService {
  constructor(private readonly prisma: PrismaService) {}

  async listFounders(query: ListFoundersQueryDto): Promise<PaginatedFoundersDto> {
    const page = clampPage(query.page);
    const limit = clampLimit(query.limit);
    const where = await this.buildWhere(query);
    const orderBy = this.buildOrderBy(query.sort);

    const [total, records] = await this.prisma.$transaction([
      this.prisma.founderSourcingRecord.count({ where }),
      this.prisma.founderSourcingRecord.findMany({
        where,
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return {
      page,
      limit,
      total,
      items: records.map((record) => toFounderDto(record)),
    };
  }

  async getFilterOptions(): Promise<FounderFiltersDto> {
    const rows = await this.prisma.$queryRaw<{ val: string }[]>`
      WITH all_sources AS (
        SELECT trim("source") AS val FROM "FounderSourcingRecord" WHERE trim("source") <> ''
        UNION ALL
        SELECT trim(u) AS val FROM "FounderSourcingRecord", unnest("sources") AS u WHERE trim(u) <> ''
      )
      SELECT DISTINCT ON (lower(val)) val
      FROM all_sources
      ORDER BY lower(val), val
    `;

    const focusAreaRows = await this.prisma.$queryRaw<{ val: string }[]>`
      SELECT DISTINCT ON (lower("focusArea")) "focusArea" AS val
      FROM "FounderSourcingRecord"
      WHERE "focusArea" IS NOT NULL AND trim("focusArea") <> ''
      ORDER BY lower("focusArea"), "focusArea"
    `;

    return { sources: rows.map((row) => row.val), focusAreas: focusAreaRows.map((row) => row.val) };
  }

  async getLatestMethodology(): Promise<FounderMethodologyDto | null> {
    const row = await this.prisma.founderSourcingMethodology.findFirst({
      orderBy: { createdAt: 'desc' },
    });
    if (!row) return null;
    return {
      version: row.version,
      payload: row.payload as Record<string, unknown>,
      createdAt: row.createdAt.toISOString(),
    };
  }

  async findFounderById(founderId: string): Promise<FounderDto> {
    const record = await this.prisma.founderSourcingRecord.findUnique({ where: { founderId } });
    if (!record) {
      throw new NotFoundException(`Founder not found: ${founderId}`);
    }
    return toFounderDto(record);
  }

  async getKpiSummary(weeks = 4): Promise<FounderKpiSummaryDto> {
    const safeWeeks = Number.isFinite(weeks) && weeks > 0 ? Math.min(Math.floor(weeks), 52) : 4;
    const since = new Date();
    since.setDate(since.getDate() - safeWeeks * 7);

    const rows = await this.prisma.founderSourcingRecord.findMany({
      where: { createdAt: { gte: since } },
      select: {
        createdAt: true,
        alignmentMax: true,
        fundCodes: true,
        sources: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    const newRecordsByFund: Record<string, number> = {};
    const sourceCoverage: Record<string, number> = {};
    const alignmentDistribution = { low: 0, medium: 0, high: 0 };
    const weeklyByStart = new Map<string, number>();

    for (const row of rows) {
      for (const fund of row.fundCodes ?? []) {
        newRecordsByFund[fund] = (newRecordsByFund[fund] ?? 0) + 1;
      }
      for (const source of row.sources ?? []) {
        sourceCoverage[source] = (sourceCoverage[source] ?? 0) + 1;
      }

      const alignment = row.alignmentMax?.toNumber() ?? null;
      if (alignment != null) {
        if (alignment < 0.4) alignmentDistribution.low++;
        else if (alignment < 0.7) alignmentDistribution.medium++;
        else alignmentDistribution.high++;
      }

      const weekStart = startOfWeekIso(row.createdAt);
      weeklyByStart.set(weekStart, (weeklyByStart.get(weekStart) ?? 0) + 1);
    }

    const weeklyNewRecords = Array.from(weeklyByStart.entries()).map(([weekStart, count]) => ({ weekStart, count }));

    return {
      newRecordsByFund,
      alignmentDistribution,
      sourceCoverage,
      weeklyNewRecords,
    };
  }

  private async buildWhere(query: ListFoundersQueryDto): Promise<Prisma.FounderSourcingRecordWhereInput> {
    const where: Prisma.FounderSourcingRecordWhereInput = {};
    const and: Prisma.FounderSourcingRecordWhereInput[] = [];

    const q = query.q?.trim();
    if (q) {
      and.push({
        OR: [
          { name: { contains: q, mode: 'insensitive' } },
          { primaryEmail: { contains: q, mode: 'insensitive' } },
          { github: { contains: q, mode: 'insensitive' } },
          { dedupeKey: { contains: q, mode: 'insensitive' } },
          { founderId: { contains: q, mode: 'insensitive' } },
        ],
      });
    }

    const funds = parseSourceList(query.fund);
    if (funds.length > 0) {
      const validFunds = funds.map((f) => f.trim().toUpperCase()).filter((f) => isAllowedFundCode(f));
      if (validFunds.length === 1) {
        where.fundCodes = { has: validFunds[0] };
      } else if (validFunds.length > 1) {
        where.fundCodes = { hasSome: validFunds };
      }
    }

    if (query.status) {
      const status = parseReviewStatus(query.status);
      if (status) where.reviewStatus = status;
    }

    if (query.isRaising?.trim().toLowerCase() === 'true') {
      where.isRaising = true;
    }

    const focusAreas = parseFocusAreaList(query.focusArea);
    if (focusAreas.length === 1) {
      where.focusArea = focusAreas[0];
    } else if (focusAreas.length > 1) {
      where.focusArea = { in: focusAreas };
    }

    const sources = parseSourceList(query.source);
    if (sources.length > 0) {
      const founderIds = await this.findFounderIdsBySources(sources);
      where.founderId = { in: founderIds };
    }

    const minAlignment = parseRange(query.minAlignment, 'minAlignment');
    if (minAlignment !== undefined) {
      where.alignmentMax = { gte: minAlignment };
    }

    const minPlnProximity = parseRange(query.minPlnProximity, 'minPlnProximity');
    if (minPlnProximity !== undefined) {
      where.plnProximity = { gte: minPlnProximity };
    }

    if (and.length > 0) {
      where.AND = and;
    }

    return where;
  }

  private async findFounderIdsBySources(sources: string[]): Promise<string[]> {
    const sourceConditions = sources.map(
      (source) =>
        Prisma.sql`(
          LOWER("source") = LOWER(${source})
          OR EXISTS (SELECT 1 FROM unnest("sources") AS u WHERE LOWER(u) = LOWER(${source}))
        )`
    );

    const rows = await this.prisma.$queryRaw<{ founderId: string }[]>`
      SELECT "founderId" FROM "FounderSourcingRecord"
      WHERE ${Prisma.join(sourceConditions, ' OR ')}
    `;

    return rows.map((row) => row.founderId);
  }

  private buildOrderBy(sortRaw?: string): Prisma.FounderSourcingRecordOrderByWithRelationInput {
    if (!sortRaw || sortRaw.trim() === '') {
      return { createdAt: 'desc' };
    }
    const [fieldRaw, dirRaw] = sortRaw.split(':');
    const field = fieldRaw?.trim() as SortField;
    const dir = dirRaw?.trim()?.toLowerCase() === 'asc' ? 'asc' : 'desc';
    if (!SORT_FIELDS.includes(field)) {
      return { createdAt: 'desc' };
    }
    return { [field]: dir };
  }
}

function parseRange(value: string | undefined, field: string): number | undefined {
  if (!value || value.trim() === '') return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
    throw new Error(`${field} must be a number in [0, 1]`);
  }
  return parsed;
}

function clampPage(raw?: string): number {
  const n = raw ? Number(raw) : DEFAULT_PAGE;
  if (!Number.isFinite(n) || n < 1) return DEFAULT_PAGE;
  return Math.floor(n);
}

function clampLimit(raw?: string): number {
  const n = raw ? Number(raw) : DEFAULT_LIMIT;
  if (!Number.isFinite(n) || n < 1) return DEFAULT_LIMIT;
  return Math.min(MAX_LIMIT, Math.floor(n));
}

function startOfWeekIso(date: Date): string {
  const d = new Date(date);
  const day = d.getUTCDay();
  const diff = (day + 6) % 7;
  d.setUTCDate(d.getUTCDate() - diff);
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}
