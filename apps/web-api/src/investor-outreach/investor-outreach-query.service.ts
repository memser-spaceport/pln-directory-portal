import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../shared/prisma.service';
import { InvestorDto, PaginatedInvestorsDto } from './dto/investor.dto';
import { ListInvestorsQueryDto } from './dto/list-investors.query.dto';
import { PlPortfolioTeamDto } from './dto/pl-portfolio-team.dto';
import { WarmIntrosQueryDto } from './dto/warm-intros.query.dto';
import { WarmIntroCandidateDto, WarmIntrosResponseDto } from './dto/warm-intros.dto';
import { MemberByEmail, OverlapsByInvestorId, toInvestorDto, toPlPortfolioTeamDto } from './investor-outreach.mapper';
import { scoreCandidate } from './warm-intros.scorer';
import {
  isAllowedEmailStatus,
  isAllowedEngagementTier,
  isAllowedEnrichmentStatus,
  isAllowedInvestorSource,
  isAllowedInvestorType,
  isAllowedStageFocus,
  INVESTOR_OUTREACH_SECTOR_TAGS,
} from './investor-outreach.vocab';

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

const SORT_FIELDS = ['engagementTier', 'lastSentDate', 'lastName', 'firm', 'createdAt', 'enrichmentDate'] as const;
type SortField = typeof SORT_FIELDS[number];

const SECTOR_TAG_SET = new Set<string>(INVESTOR_OUTREACH_SECTOR_TAGS);

@Injectable()
export class InvestorOutreachQueryService {
  constructor(private readonly prisma: PrismaService) {}

  async listInvestors(query: ListInvestorsQueryDto): Promise<PaginatedInvestorsDto> {
    const page = clampPage(query.page);
    const limit = clampLimit(query.limit);

    const where = await this.buildWhere(query);
    const orderBy = this.buildOrderBy(query.sort);

    const [total, records] = await this.prisma.$transaction([
      this.prisma.investorOutreachRecord.count({ where }),
      this.prisma.investorOutreachRecord.findMany({
        where,
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    const items = await this.attachJoins(records);
    return { page, limit, total, items };
  }

  async findInvestorById(investorId: string): Promise<InvestorDto> {
    const record = await this.prisma.investorOutreachRecord.findUnique({ where: { investorId } });
    if (!record) {
      throw new NotFoundException(`Investor not found: ${investorId}`);
    }
    const [item] = await this.attachJoins([record]);
    return item;
  }

  async findCoInvestorsByTeam(): Promise<PlPortfolioTeamDto[]> {
    const teams = await this.prisma.team.findMany({
      where: { portfolioOverlaps: { some: {} } },
      include: {
        logo: true,
        portfolioMeta: true,
        portfolioOverlaps: {
          include: { investorOutreachRecord: { select: { investorId: true } } },
        },
      },
      orderBy: { name: 'asc' },
    });
    return teams.map(toPlPortfolioTeamDto);
  }

  async findWarmIntros(query: WarmIntrosQueryDto): Promise<WarmIntrosResponseDto> {
    // Resolve the target team (if any) and derive auto-filled criteria from its meta sidecar.
    let targetTeamUid: string | undefined;
    let targetTeamDto: PlPortfolioTeamDto | undefined;
    let targetTeamName: string | undefined;
    let teamSectors: string[] = [];
    let teamStage: string | undefined;

    if (query.teamId && query.teamId.trim()) {
      const team = await this.prisma.team.findUnique({
        where: { uid: query.teamId.trim() },
        include: {
          logo: true,
          portfolioMeta: true,
          portfolioOverlaps: {
            include: { investorOutreachRecord: { select: { investorId: true } } },
          },
        },
      });
      if (team) {
        targetTeamUid = team.uid;
        targetTeamName = team.name;
        targetTeamDto = toPlPortfolioTeamDto(team);
        teamSectors = targetTeamDto.sectors;
        teamStage = targetTeamDto.raisingNow ?? targetTeamDto.plInvestedStage ?? undefined;
      }
    }

    // Explicit query params override the team auto-fill.
    const explicitSectors = parseCsv(query.sectorTags).filter((t) => SECTOR_TAG_SET.has(t));
    const targetSectors = explicitSectors.length ? explicitSectors : teamSectors;

    const explicitStage =
      query.stageFocus && query.stageFocus.trim() && isAllowedStageFocus(query.stageFocus.trim())
        ? query.stageFocus.trim()
        : undefined;
    const targetStage = explicitStage ?? teamStage;

    // Candidate superset: any signal that could plausibly score > 0.
    // - Co-investors (warm)
    // - T1/T2/T3 engagement (engaged)
    // - When target sectors are set, also any investor whose sectorTags column is populated (cold-match)
    const candidateWhere: Prisma.InvestorOutreachRecordWhereInput = {
      OR: [
        { portfolioOverlaps: { some: {} } },
        { engagementTier: { in: ['T1_registered', 'T2_clicked', 'T3_opened'] } },
        ...(targetSectors.length > 0 ? [{ NOT: { sectorTags: null } }] : []),
      ],
    };

    const records = await this.prisma.investorOutreachRecord.findMany({ where: candidateWhere });
    const investors = await this.attachJoins(records);

    // Build a uid→name map for portfolio teams referenced by any candidate's overlaps.
    // Used by the scorer to produce "Co-invested on <team>" reason strings for any-team matches.
    const allReferencedTeamUids = Array.from(new Set(investors.flatMap((i) => i.coInvestedTeamIds)));
    const referencedTeams = allReferencedTeamUids.length
      ? await this.prisma.team.findMany({
          where: { uid: { in: allReferencedTeamUids } },
          select: { uid: true, name: true },
        })
      : [];
    const portfolioTeamsByUid = new Map<string, string>(referencedTeams.map((t) => [t.uid, t.name]));

    const candidates: WarmIntroCandidateDto[] = investors
      .map((investor) => {
        const { tier, score, reason, evidence } = scoreCandidate({
          investor,
          targetTeamUid,
          targetTeamName,
          targetSectors,
          targetStage,
          portfolioTeamsByUid,
        });
        return { investor, tier, fitScore: score, reason, evidence };
      })
      .filter((c) => c.fitScore > 0)
      .sort((a, b) => b.fitScore - a.fitScore);

    return {
      team: targetTeamDto,
      total: candidates.length,
      candidates,
    };
  }

  private async buildWhere(query: ListInvestorsQueryDto): Promise<Prisma.InvestorOutreachRecordWhereInput> {
    const conditions: Prisma.InvestorOutreachRecordWhereInput[] = [];

    if (query.q && query.q.trim()) {
      const q = query.q.trim();
      conditions.push({
        OR: [
          { firstName: { contains: q, mode: 'insensitive' } },
          { lastName: { contains: q, mode: 'insensitive' } },
          { email: { contains: q, mode: 'insensitive' } },
          { firm: { contains: q, mode: 'insensitive' } },
        ],
      });
    }

    const enumFilter = (raw: string | undefined, isAllowed: (v: string) => boolean) => {
      const values = parseCsv(raw).filter(isAllowed);
      return values.length ? values : undefined;
    };

    const source = enumFilter(query.source, isAllowedInvestorSource);
    if (source) conditions.push({ source: { in: source } });

    const investorType = enumFilter(query.investorType, isAllowedInvestorType);
    if (investorType) conditions.push({ investorType: { in: investorType } });

    const stageFocus = enumFilter(query.stageFocus, isAllowedStageFocus);
    if (stageFocus) conditions.push({ stageFocus: { in: stageFocus } });

    const emailStatus = enumFilter(query.emailStatus, isAllowedEmailStatus);
    if (emailStatus) conditions.push({ emailStatus: { in: emailStatus } });

    const engagementTier = enumFilter(query.engagementTier, isAllowedEngagementTier);
    if (engagementTier) conditions.push({ engagementTier: { in: engagementTier } });

    const enrichmentStatus = enumFilter(query.enrichmentStatus, isAllowedEnrichmentStatus);
    if (enrichmentStatus) conditions.push({ enrichmentStatus: { in: enrichmentStatus } });

    // sectorTags is stored as a comma-separated string. Match each requested tag as a discrete token
    // (delimited by commas or string edges) to avoid substring collisions inside the CSV value.
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

    if (query.geoFocus && query.geoFocus.trim()) {
      conditions.push({ geoFocus: { contains: query.geoFocus.trim(), mode: 'insensitive' } });
    }

    const inLabOs = parseBool(query.inLabOs);
    if (inLabOs !== undefined) {
      const cond = await this.buildInLabOsCondition(inLabOs);
      if (cond) conditions.push(cond);
    }

    const isCoInvestor = parseBool(query.isCoInvestor);
    if (isCoInvestor === true) {
      conditions.push({ portfolioOverlaps: { some: {} } });
    } else if (isCoInvestor === false) {
      conditions.push({ portfolioOverlaps: { none: {} } });
    }

    if (query.coInvestedTeamId && query.coInvestedTeamId.trim()) {
      conditions.push({ portfolioOverlaps: { some: { teamUid: query.coInvestedTeamId.trim() } } });
    }

    const tags = parseCsv(query.tags);
    if (tags.length) {
      conditions.push({ tags: { hasSome: tags } });
    }

    return conditions.length ? { AND: conditions } : {};
  }

  /**
   * Resolves outreach email against approved LabOS members (visible profiles only).
   * Done as an explicit email IN (...) clause because InvestorOutreachRecord has no Member relation.
   */
  private async buildInLabOsCondition(inLabOs: boolean): Promise<Prisma.InvestorOutreachRecordWhereInput | null> {
    const members = await this.prisma.member.findMany({
      where: {
        email: { not: null },
        memberApproval: { state: 'APPROVED' },
      },
      select: { email: true },
    });
    const emails = members.map((m) => m.email).filter((e): e is string => !!e);
    if (inLabOs) {
      return { email: { in: emails.length ? emails : [''], mode: 'insensitive' } };
    }
    if (emails.length === 0) return null;
    return { NOT: { email: { in: emails, mode: 'insensitive' } } };
  }

  private buildOrderBy(sort: string | undefined): Prisma.InvestorOutreachRecordOrderByWithRelationInput[] {
    if (sort && sort.trim()) {
      const [field, direction] = sort.split(':').map((s) => s.trim());
      if (this.isSortField(field) && (direction === 'asc' || direction === 'desc')) {
        return [{ [field]: direction } as Prisma.InvestorOutreachRecordOrderByWithRelationInput];
      }
    }
    return [{ engagementTier: 'asc' }, { lastSentDate: 'desc' }];
  }

  private isSortField(s: string): s is SortField {
    return (SORT_FIELDS as readonly string[]).includes(s);
  }

  private async attachJoins(
    records: Prisma.InvestorOutreachRecordGetPayload<Record<string, never>>[]
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

    return records.map((record) => toInvestorDto(record, membersByEmail, overlapsByInvestorId));
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

function parseBool(raw: string | undefined): boolean | undefined {
  if (raw === undefined || raw === null || raw === '') return undefined;
  const v = String(raw).toLowerCase();
  if (v === 'true' || v === '1') return true;
  if (v === 'false' || v === '0') return false;
  return undefined;
}
