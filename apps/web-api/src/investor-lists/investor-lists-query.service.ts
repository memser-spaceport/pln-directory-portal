import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../shared/prisma.service';
import { InvestorDto, PaginatedInvestorsDto } from '../investor-outreach/dto/investor.dto';
import { MemberByEmail, OverlapsByInvestorId, toInvestorDto } from '../investor-outreach/investor-outreach.mapper';
import { INVESTOR_OUTREACH_SECTOR_TAGS, isAllowedStageFocus } from '../investor-outreach/investor-outreach.vocab';
import { buildInvestorTextSearch } from '../investor-outreach/investor-text-search.util';
import { connectorMatchClause } from '../pathfinder/connector-match.util';
import { pathKeywordMatchClause, tokenizeKeywordQuery } from '../pathfinder/path-keyword-search.util';
import {
  hasPathViaFilters,
  MAX_PATH_VIA_VALUES,
  pathViaMatchClause,
  type PathViaFilterInput,
} from '../pathfinder/path-via-match.util';
import { parseRouteNodesFromHopChain } from '../pathfinder/route-node-display.util';
import { compareWarmIntroMembers } from './warm-intro-list-sort.util';
import { InvestorListDto, InvestorListsResponseDto } from './dto/investor-list.dto';
import { ListMembersQueryDto } from './dto/list-members.query.dto';
import {
  WarmIntroFacetsResponseDto,
  WarmIntroFounderFacetDto,
  WarmIntroPlMemberFacetDto,
} from './dto/warm-intro-facets.dto';
import type { PathHopNodeDto } from '../pathfinder/dto/ingest-pathfinder.dto';

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

interface PathDisplayFields {
  bestRouteNodes?: PathHopNodeDto[];
  bestRouteScore?: number | null;
  pathCount?: number | null;
}

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

    validateListMembersQuery(query);

    // Path filters (connector lens + path-via) resolve ACROSS THE WHOLE LIST before
    // building the member query so pagination + total reflect the filter.
    const pathFilterMatchIds = await this.resolvePathFilterMatchIds(list.targetSet, query);
    const pathKeywordMatchIds =
      query.q && query.q.trim() ? await this.resolvePathKeywordMatchIds(list.targetSet, listId, query.q) : null;
    const where = this.buildMemberWhere(listId, query, pathFilterMatchIds, pathKeywordMatchIds);

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
      const pageItems = sorted.slice((page - 1) * limit, page * limit);
      const displayByInvestorId = await this.loadPathDisplayForPage(
        list.targetSet,
        pageItems.map((i) => i.investorId)
      );
      const items = pageItems.map((item) => {
        const display = displayByInvestorId.get(item.investorId);
        return display ? { ...item, ...display } : item;
      });
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

  /** Facet counts for warm-intros PL member / founder dropdowns (full list scope). */
  async listWarmIntroFacets(listId: number): Promise<WarmIntroFacetsResponseDto> {
    const list = await this.prisma.investorList.findUnique({ where: { id: listId } });
    if (!list) {
      throw new NotFoundException(`Investor list not found: ${listId}`);
    }
    if (!list.isGraphed) {
      return { plMembers: [], founders: [] };
    }

    const [plRows, founderRows] = await Promise.all([
      this.queryPlMemberFacets(list.targetSet, listId),
      this.queryFounderFacets(list.targetSet, listId),
    ]);

    return { plMembers: plRows, founders: founderRows };
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

  /** Rank-1 route chips + path totals for the current results page only. */
  private async loadPathDisplayForPage(
    targetSet: string,
    investorIds: string[]
  ): Promise<Map<string, PathDisplayFields>> {
    const out = new Map<string, PathDisplayFields>();
    if (!investorIds.length) return out;

    const [rank1Paths, pathCounts] = await Promise.all([
      this.prisma.pathfinderPath.findMany({
        where: { targetSet, targetInvestorId: { in: investorIds }, rank: 1 },
        select: { targetInvestorId: true, score: true, hopChain: true },
      }),
      this.prisma.pathfinderPath.groupBy({
        by: ['targetInvestorId'],
        where: { targetSet, targetInvestorId: { in: investorIds } },
        _count: { _all: true },
      }),
    ]);

    const countByInvestorId = new Map(pathCounts.map((row) => [row.targetInvestorId, row._count._all]));

    for (const p of rank1Paths) {
      const nodes = parseRouteNodesFromHopChain(p.hopChain);
      out.set(p.targetInvestorId, {
        bestRouteNodes: nodes.length > 0 ? nodes : undefined,
        bestRouteScore: p.score,
        pathCount: countByInvestorId.get(p.targetInvestorId) ?? null,
      });
    }

    return out;
  }

  /**
   * Intersect connector-lens and path-via match sets (AND between groups).
   * Returns `null` when neither group is active.
   */
  private async resolvePathFilterMatchIds(targetSet: string, query: ListMembersQueryDto): Promise<string[] | null> {
    const connectorIds = await this.resolveConnectorMatchIds(targetSet, query);
    const pathViaIds = await this.resolvePathViaMatchIds(targetSet, query);
    return intersectIdSets(connectorIds, pathViaIds);
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

  /** Path-via structured filters (PL member / founder / direct). OR within group. */
  private async resolvePathViaMatchIds(targetSet: string, query: ListMembersQueryDto): Promise<string[] | null> {
    const input = parsePathViaFilters(query);
    if (!hasPathViaFilters(input)) return null;

    const rows = await this.prisma.$queryRaw<{ targetInvestorId: string }[]>`
      SELECT DISTINCT p."targetInvestorId"
      FROM "PathfinderPath" p
      WHERE p."targetSet" = ${targetSet}
        AND ${pathViaMatchClause(input)}`;
    return rows.map((r) => r.targetInvestorId);
  }

  /** Founder / portfolio-company keyword matches scoped to list members. */
  private async resolvePathKeywordMatchIds(targetSet: string, listId: number, q: string): Promise<string[] | null> {
    const tokens = tokenizeKeywordQuery(q);
    if (tokens.length === 0) return null;

    const memberIds = await this.fetchListMemberInvestorIds(listId);
    if (memberIds.length === 0) return [];

    const rows = await this.prisma.$queryRaw<{ targetInvestorId: string }[]>`
      SELECT DISTINCT p."targetInvestorId"
      FROM "PathfinderPath" p
      WHERE p."targetSet" = ${targetSet}
        AND p."targetInvestorId" IN (${Prisma.join(memberIds)})
        AND ${pathKeywordMatchClause(tokens)}`;
    return rows.map((r) => r.targetInvestorId);
  }

  private async fetchListMemberInvestorIds(listId: number): Promise<string[]> {
    const rows = await this.prisma.investorOutreachRecord.findMany({
      where: { listMemberships: { some: { listId } } },
      select: { investorId: true },
    });
    return rows.map((r) => r.investorId);
  }

  private async queryPlMemberFacets(targetSet: string, listId: number): Promise<WarmIntroPlMemberFacetDto[]> {
    const rows = await this.prisma.$queryRaw<{ name: string; member_uid: string | null; cnt: number }[]>`
      SELECT
        lower(btrim(p."hopChain"->'plConnector'->>'name')) AS name,
        max(p."hopChain"->'plConnector'->>'memberUid') AS member_uid,
        count(DISTINCT p."targetInvestorId")::int AS cnt
      FROM "PathfinderPath" p
      INNER JOIN "InvestorOutreachRecord" r ON r."investorId" = p."targetInvestorId"
      INNER JOIN "InvestorListMembership" m ON m."investorOutreachRecordId" = r."id" AND m."listId" = ${listId}
      WHERE p."targetSet" = ${targetSet}
        AND p."hopChain"->'plConnector'->>'name' IS NOT NULL
        AND btrim(p."hopChain"->'plConnector'->>'name') <> ''
      GROUP BY 1
      ORDER BY cnt DESC, name ASC`;

    return rows.map((row) => ({
      name: titleCaseName(row.name),
      ...(row.member_uid ? { memberUid: row.member_uid } : {}),
      count: row.cnt,
    }));
  }

  private async queryFounderFacets(targetSet: string, listId: number): Promise<WarmIntroFounderFacetDto[]> {
    const rows = await this.prisma.$queryRaw<
      {
        facet_key: string;
        name: string | null;
        member_uid: string | null;
        role: string | null;
        teams: unknown;
        cnt: number;
      }[]
    >`
      SELECT
        lower(btrim(broker.founder_name)) AS facet_key,
        max(broker.founder_name) AS name,
        max(broker.member_uid) AS member_uid,
        max(broker.role) AS role,
        (array_agg(broker.teams ORDER BY broker.score DESC))[1] AS teams,
        count(DISTINCT broker."targetInvestorId")::int AS cnt
      FROM (
        SELECT
          p."targetInvestorId",
          p."score" AS score,
          COALESCE(
            NULLIF(btrim((
              SELECT n->>'label'
              FROM jsonb_array_elements(
                CASE
                  WHEN jsonb_typeof(p."hopChain"->'nodes') = 'array' THEN p."hopChain"->'nodes'
                  ELSE '[]'::jsonb
                END
              ) AS n
              WHERE n->>'id' LIKE 'f_%'
              LIMIT 1
            )), ''),
            NULLIF(btrim(p."hopChain"->'connectorTeam'->'leads'->0->>'name'), '')
          ) AS founder_name,
          NULLIF(btrim(p."hopChain"->'connectorTeam'->'leads'->0->>'memberUid'), '') AS member_uid,
          NULLIF(btrim(p."hopChain"->'connectorTeam'->'leads'->0->>'role'), '') AS role,
          p."hopChain"->'connectorTeam'->'leads'->0->'teams' AS teams
        FROM "PathfinderPath" p
        INNER JOIN "InvestorOutreachRecord" r ON r."investorId" = p."targetInvestorId"
        INNER JOIN "InvestorListMembership" m ON m."investorOutreachRecordId" = r."id" AND m."listId" = ${listId}
        WHERE p."targetSet" = ${targetSet}
          AND p."connectorType" = 'F'
      ) AS broker
      WHERE broker.founder_name IS NOT NULL
        AND btrim(broker.founder_name) <> ''
      GROUP BY facet_key
      ORDER BY cnt DESC, name ASC`;

    return rows.map((row) => ({
      name: row.name ?? titleCaseName(row.facet_key),
      ...(row.member_uid ? { memberUid: row.member_uid } : {}),
      ...(row.role ? { role: row.role } : {}),
      ...(parseTeamsFacet(row.teams).length ? { teams: parseTeamsFacet(row.teams) } : {}),
      count: row.cnt,
    }));
  }

  private buildMemberWhere(
    listId: number,
    query: ListMembersQueryDto,
    pathFilterMatchIds: string[] | null,
    pathKeywordMatchIds: string[] | null
  ): Prisma.InvestorOutreachRecordWhereInput {
    const conditions: Prisma.InvestorOutreachRecordWhereInput[] = [{ listMemberships: { some: { listId } } }];

    // Path filters: restrict to matched members (empty array → no member matches).
    if (pathFilterMatchIds !== null) {
      conditions.push({ investorId: { in: pathFilterMatchIds } });
    }

    if (query.q && query.q.trim()) {
      const textSearch = buildInvestorTextSearch(query.q);
      if (pathKeywordMatchIds !== null && pathKeywordMatchIds.length > 0) {
        conditions.push({
          OR: [textSearch, { investorId: { in: pathKeywordMatchIds } }],
        });
      } else {
        conditions.push(textSearch);
      }
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
      return {
        ...dto,
        bestProximityCode: prox.code,
        hasPath: prox.hasPath,
        bestRouteScore: prox.hasPath ? prox.score : null,
      };
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

function parsePathViaFilters(query: ListMembersQueryDto): PathViaFilterInput {
  return {
    plMembers: parseCsv(query.plMembers).map((n) => n.toLowerCase()),
    founderUids: parseCsv(query.founderUids).map((uid) => uid.toLowerCase()),
    founderNames: parseCsv(query.founderNames).map((name) => name.toLowerCase()),
    anyFounder: query.anyFounder === 'true',
    directOnly: query.directOnly === 'true',
  };
}

function validateListMembersQuery(query: ListMembersQueryDto): void {
  const plMembers = parseCsv(query.plMembers);
  if (plMembers.length > MAX_PATH_VIA_VALUES) {
    throw new BadRequestException(`plMembers must contain at most ${MAX_PATH_VIA_VALUES} values`);
  }
  const founderUids = parseCsv(query.founderUids);
  if (founderUids.length > MAX_PATH_VIA_VALUES) {
    throw new BadRequestException(`founderUids must contain at most ${MAX_PATH_VIA_VALUES} values`);
  }
  const founderNames = parseCsv(query.founderNames);
  if (founderNames.length > MAX_PATH_VIA_VALUES) {
    throw new BadRequestException(`founderNames must contain at most ${MAX_PATH_VIA_VALUES} values`);
  }
  const connectorLabels = parseCsv(query.connectorLabels);
  if (connectorLabels.length > MAX_CONNECTOR_LABELS) {
    throw new BadRequestException(`connectorLabels must contain at most ${MAX_CONNECTOR_LABELS} labels`);
  }
  const connectorContains = parseCsv(query.connectorLabelsContains);
  if (connectorContains.length > MAX_CONNECTOR_LABELS) {
    throw new BadRequestException(`connectorLabelsContains must contain at most ${MAX_CONNECTOR_LABELS} labels`);
  }
}

function intersectIdSets(a: string[] | null, b: string[] | null): string[] | null {
  if (a === null && b === null) return null;
  if (a === null) return b;
  if (b === null) return a;
  const allowed = new Set(b);
  return a.filter((id) => allowed.has(id));
}

function titleCaseName(lowerName: string): string {
  return lowerName
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function parseTeamsFacet(raw: unknown): { name: string; teamUid?: string }[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
    .map((item) => ({
      name: String(item.name ?? ''),
      ...(typeof item.teamUid === 'string' && item.teamUid ? { teamUid: item.teamUid } : {}),
    }))
    .filter((t) => t.name);
}
