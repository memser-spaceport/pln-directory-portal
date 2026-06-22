import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../shared/prisma.service';
import { InvestorDto, PaginatedInvestorsDto } from '../investor-outreach/dto/investor.dto';
import { MemberByEmail, OverlapsByInvestorId, toInvestorDto } from '../investor-outreach/investor-outreach.mapper';
import { INVESTOR_OUTREACH_SECTOR_TAGS, isAllowedStageFocus } from '../investor-outreach/investor-outreach.vocab';
import { buildInvestorTextSearch } from '../investor-outreach/investor-text-search.util';
import { connectorMatchClause } from '../pathfinder/connector-match.util';
import { compareWarmIntroMembers } from './warm-intro-list-sort.util';
import { InvestorListDto, InvestorListsResponseDto } from './dto/investor-list.dto';
import { ListMembersQueryDto } from './dto/list-members.query.dto';

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;
const MAX_CONNECTOR_LABELS = 20;
const MIN_CONNECTOR_CONTAINS_LENGTH = 3;

const SECTOR_TAG_SET = new Set<string>(INVESTOR_OUTREACH_SECTOR_TAGS);

/** Engagement tiers that count as "engaged" (anything short of T4_cold). */
const ENGAGED_TIERS = ['T1_registered', 'T2_clicked', 'T3_opened'];
const RELATIONSHIPS = ['co_invested', 'engaged', 'cold'] as const;
type Relationship = typeof RELATIONSHIPS[number];

@Injectable()
export class InvestorListsQueryService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Resolve a route param that is a SLUG (the public list identifier — the numeric
   * `id` is concealed by ConcealEntityIDInterceptor, so slug is what the client
   * holds) into the internal numeric list id. Accepts a numeric id too, for
   * backward-compat / internal callers.
   */
  async resolveListId(idOrSlug: string): Promise<number> {
    const raw = (idOrSlug ?? '').trim();
    const n = Number(raw);
    if (Number.isInteger(n) && n > 0 && String(n) === raw) return n;
    const list = await this.prisma.investorList.findUnique({
      where: { slug: raw },
      select: { id: true },
    });
    if (!list) throw new NotFoundException(`Investor list not found: ${raw}`);
    return list.id;
  }

  /** GET /v1/investor-lists → `{ items: InvestorListDto[] }` with member counts. */
  async listLists(investorId?: string): Promise<InvestorListsResponseDto> {
    const lists = await this.prisma.investorList.findMany({
      orderBy: { name: 'asc' },
      include: { _count: { select: { memberships: true } } },
    });

    let memberListIds: Set<number> | null = null;
    if (investorId) {
      const record = await this.prisma.investorOutreachRecord.findUnique({
        where: { investorId },
        select: { id: true },
      });
      if (record) {
        const memberships = await this.prisma.investorListMembership.findMany({
          where: { investorOutreachRecordId: record.id },
          select: { listId: true },
        });
        memberListIds = new Set(memberships.map((m) => m.listId));
      } else {
        memberListIds = new Set();
      }
    }

    const items: InvestorListDto[] = lists.map((list) => {
      const dto: InvestorListDto = {
        id: list.id,
        slug: list.slug,
        name: list.name,
        description: list.description,
        isGraphed: list.isGraphed,
        memberCount: list._count.memberships,
      };
      if (memberListIds !== null) {
        dto.isMember = memberListIds.has(list.id);
      }
      return dto;
    });

    return { items };
  }

  /**
   * GET /v1/investor-lists/:listId/members — members are InvestorOutreachRecords
   * joined via InvestorListMembership for this list, returned as full InvestorDtos
   * (so they carry proximity/enrichment/co-invested data) in the standard envelope.
   */
  async listMembers(listId: number, query: ListMembersQueryDto): Promise<PaginatedInvestorsDto> {
    const list = await this.prisma.investorList.findUnique({ where: { id: listId } });
    if (!list) {
      throw new NotFoundException(`Investor list not found: ${listId}`);
    }

    const page = clampPage(query.page);
    const limit = clampLimit(query.limit);

    // Connector lens (task 04): resolve the set of members reachable through the
    // requested connector ACROSS THE WHOLE LIST (not just a loaded page) before
    // building the member query, so pagination + total reflect the filter.
    const connectorMatchIds = await this.resolveConnectorMatchIds(list.targetSet, query);
    const where = this.buildMemberWhere(listId, query, connectorMatchIds);

    if (list.isGraphed) {
      const [total, allRecords] = await this.prisma.$transaction([
        this.prisma.investorOutreachRecord.count({ where }),
        this.prisma.investorOutreachRecord.findMany({ where }),
      ]);
      const proximityByInvestorId = await this.loadListProximity(
        list.targetSet,
        allRecords.map((r) => r.investorId)
      );
      const sorted = (await this.attachJoins(allRecords, proximityByInvestorId)).sort((a, b) =>
        compareWarmIntroMembers(
          {
            hasPath: a.hasPath ?? false,
            hops: proximityByInvestorId.get(a.investorId)?.hops ?? null,
            score: proximityByInvestorId.get(a.investorId)?.score ?? null,
            bestProximityCode: a.bestProximityCode ?? null,
            lastName: a.lastName ?? null,
          },
          {
            hasPath: b.hasPath ?? false,
            hops: proximityByInvestorId.get(b.investorId)?.hops ?? null,
            score: proximityByInvestorId.get(b.investorId)?.score ?? null,
            bestProximityCode: b.bestProximityCode ?? null,
            lastName: b.lastName ?? null,
          }
        )
      );
      const items = sorted.slice((page - 1) * limit, page * limit);
      return { page, limit, total, items };
    }

    const [total, records] = await this.prisma.$transaction([
      this.prisma.investorOutreachRecord.count({ where }),
      this.prisma.investorOutreachRecord.findMany({
        where,
        orderBy: [{ engagementTier: 'asc' }, { lastSentDate: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    const items = await this.attachJoins(records);
    return { page, limit, total, items };
  }

  /** Best path (rank 1) per member for this list's targetSet — overrides denormalized record fields. */
  private async loadListProximity(
    targetSet: string,
    investorIds: string[]
  ): Promise<Map<string, { code: string | null; hasPath: boolean; hops: number | null; score: number | null }>> {
    const map = new Map<string, { code: string | null; hasPath: boolean; hops: number | null; score: number | null }>();
    if (!investorIds.length) return map;

    for (const id of investorIds) {
      map.set(id, { code: null, hasPath: false, hops: null, score: null });
    }

    const paths = await this.prisma.pathfinderPath.findMany({
      where: { targetSet, targetInvestorId: { in: investorIds }, rank: 1 },
      select: { targetInvestorId: true, proximityCode: true, hops: true, score: true },
    });
    for (const p of paths) {
      map.set(p.targetInvestorId, {
        code: p.proximityCode,
        hasPath: true,
        hops: p.hops,
        score: p.score,
      });
    }
    return map;
  }

  /**
   * Resolve the targetInvestorIds reachable through the requested connector across
   * the entire list's targetSet. Returns `null` when no connector filter is set
   * (so the caller leaves the member set unfiltered), or `string[]` of matches
   * (possibly empty → the member query yields nothing). Match semantics are shared
   * with the per-page connector lens via connectorMatchClause.
   */
  private async resolveConnectorMatchIds(targetSet: string, query: ListMembersQueryDto): Promise<string[] | null> {
    const labels = parseCsv(query.connectorLabels)
      .map((l) => l.toLowerCase())
      .slice(0, MAX_CONNECTOR_LABELS);
    const containsLabels = parseCsv(query.connectorLabelsContains)
      .map((l) => l.toLowerCase())
      .filter((l) => l.length >= MIN_CONNECTOR_CONTAINS_LENGTH)
      .slice(0, MAX_CONNECTOR_LABELS);
    if (labels.length === 0 && containsLabels.length === 0) return null;

    const rows = await this.prisma.$queryRaw<{ targetInvestorId: string }[]>`
      SELECT DISTINCT p."targetInvestorId"
      FROM "PathfinderPath" p
      WHERE p."targetSet" = ${targetSet}
        AND ${connectorMatchClause(labels, containsLabels)}`;
    return rows.map((r) => r.targetInvestorId);
  }

  private buildMemberWhere(
    listId: number,
    query: ListMembersQueryDto,
    connectorMatchIds: string[] | null
  ): Prisma.InvestorOutreachRecordWhereInput {
    const conditions: Prisma.InvestorOutreachRecordWhereInput[] = [{ listMemberships: { some: { listId } } }];

    // Connector lens: restrict to the matched members (empty array → no member
    // matches, so the list comes back empty — the correct "no LPs" result).
    if (connectorMatchIds !== null) {
      conditions.push({ investorId: { in: connectorMatchIds } });
    }

    if (query.q && query.q.trim()) {
      conditions.push(buildInvestorTextSearch(query.q));
    }

    // sectorTags is stored as a comma-separated string; match each tag as a discrete token.
    const sectorTags = parseCsv(query.sectorTags).filter((t) => SECTOR_TAG_SET.has(t));
    if (sectorTags.length) {
      conditions.push({
        OR: sectorTags.flatMap((tag) => [
          { sectorTags: tag },
          { sectorTags: { startsWith: `${tag},` } },
          { sectorTags: { endsWith: `,${tag}` } },
          { sectorTags: { contains: `,${tag},` } },
        ]),
      });
    }

    const stageFocus = parseCsv(query.stageFocus).filter(isAllowedStageFocus);
    if (stageFocus.length) conditions.push({ stageFocus: { in: stageFocus } });

    if (query.checkSizeRange && query.checkSizeRange.trim()) {
      conditions.push({ checkSizeRange: { contains: query.checkSizeRange.trim(), mode: 'insensitive' } });
    }

    const relationships = parseCsv(query.relationship).filter((r): r is Relationship =>
      (RELATIONSHIPS as readonly string[]).includes(r)
    );
    if (relationships.length) {
      const relConditions: Prisma.InvestorOutreachRecordWhereInput[] = relationships.map((rel) => {
        if (rel === 'co_invested') {
          return { portfolioOverlaps: { some: {} } };
        }
        if (rel === 'engaged') {
          return { engagementTier: { in: ENGAGED_TIERS } };
        }
        // cold: not co-invested AND not engaged.
        return {
          portfolioOverlaps: { none: {} },
          NOT: { engagementTier: { in: ENGAGED_TIERS } },
        };
      });
      conditions.push(relConditions.length === 1 ? relConditions[0] : { OR: relConditions });
    }

    return { AND: conditions };
  }

  private async attachJoins(
    records: Prisma.InvestorOutreachRecordGetPayload<Record<string, never>>[],
    proximityByInvestorId?: Map<
      string,
      { code: string | null; hasPath: boolean; hops: number | null; score: number | null }
    >
  ): Promise<InvestorDto[]> {
    if (records.length === 0) return [];

    const emails = Array.from(
      new Set(
        records
          .map((r) => r.email)
          .filter((e): e is string => !!e)
          .map((e) => e.toLowerCase())
      )
    );
    const ids = records.map((r) => r.id);

    const [members, overlaps] = await Promise.all([
      emails.length
        ? this.prisma.member.findMany({
            where: {
              email: { in: emails, mode: 'insensitive' },
              memberApproval: { state: 'APPROVED' },
            },
            include: { image: true },
          })
        : Promise.resolve([]),
      ids.length
        ? this.prisma.investorPortfolioOverlap.findMany({
            where: { investorOutreachRecordId: { in: ids } },
            select: { investorOutreachRecordId: true, teamUid: true },
          })
        : Promise.resolve([]),
    ]);

    const membersByEmail: MemberByEmail = new Map();
    for (const member of members) {
      if (member.email) membersByEmail.set(member.email.toLowerCase(), member);
    }

    const overlapsByInvestorId: OverlapsByInvestorId = new Map();
    for (const overlap of overlaps) {
      const list = overlapsByInvestorId.get(overlap.investorOutreachRecordId) ?? [];
      list.push(overlap.teamUid);
      overlapsByInvestorId.set(overlap.investorOutreachRecordId, list);
    }

    return records.map((record) => {
      const dto = toInvestorDto(record, membersByEmail, overlapsByInvestorId);
      const prox = proximityByInvestorId?.get(record.investorId);
      if (!prox) return dto;
      return { ...dto, bestProximityCode: prox.code, hasPath: prox.hasPath };
    });
  }
}

function clampPage(raw: string | undefined): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) return DEFAULT_PAGE;
  return Math.floor(n);
}

function clampLimit(raw: string | undefined): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) return DEFAULT_LIMIT;
  return Math.min(MAX_LIMIT, Math.floor(n));
}

function parseCsv(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}
