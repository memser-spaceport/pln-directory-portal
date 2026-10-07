import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { tool, CoreTool } from 'ai';
import { z } from 'zod';
import { LogService } from '../../shared/log.service';
import { PrismaService } from '../../shared/prisma.service';
import { InvestorOutreachQueryService } from '../../investor-outreach/investor-outreach-query.service';
import { WarmIntroCandidateDto } from '../../investor-outreach/dto/warm-intros.dto';
import { INVESTOR_OUTREACH_SECTOR_TAGS } from '../../investor-outreach/investor-outreach.vocab';
import { WarmIntrosV2Service } from '../../warm-intros-v2/warm-intros-v2.service';
import { WARM_INTROS_V2_MIN_SCORE } from '../../warm-intros-v2/warm-intros-v2-proximity.util';
import { asRecord, relationKindFromHopChain } from '../../warm-intros-v2/warm-intros-v2-enrich.util';
import { HuskyAuthContext } from './husky-auth-context';
import { InvestorDbAccess } from './investor-db-access';
import { investorDbPath, normalizeSectorTags, normalizeStageFocus } from './investor-db.tool';
import { fuzzySqlContainsCondition } from './fuzzy-match.util';

export const WARM_INTROS_TOOL_NAME = 'getWarmIntros';

const MIN_TARGET_LENGTH = 3;
const MAX_TARGET_INVESTORS = 5;
const MAX_PATHS_PER_INVESTOR = 3;
const MAX_CANDIDATES = 15;

const RELATION_KIND_LABELS: Record<string, string> = {
  pl_direct: 'direct PL connection',
  founder_bridge: 'via a founder',
  coinvestor_bridge: 'via a co-investor',
};

const TIER_LABELS: Record<string, string> = {
  co_invested: 'Co-invested',
  engaged: 'Engaged',
  cold_match: 'Cold match',
};

/** Warm Intros workspace on the `/investors` page, searched for this investor. */
export function warmIntrosPath(investorName: string): string {
  return `/investors?mode=warm-intros-v2&wi2_q=${encodeURIComponent(investorName)}`;
}

const WarmIntrosToolParams = z.object({
  investorOrFirm: z
    .string()
    .describe(
      'For "who can introduce us to X": the investor\'s name or their firm. Returns the connectors who can make the intro.'
    )
    .optional(),
  teamName: z
    .string()
    .describe(
      'For "warm intros for <team>": the portfolio team looking for investors. Returns ranked candidate investors.'
    )
    .optional(),
  sectorTags: z
    .array(z.string())
    .describe(
      `With or instead of teamName: sector tags to rank candidate investors for. Values: ${INVESTOR_OUTREACH_SECTOR_TAGS.join(
        ', '
      )}`
    )
    .optional(),
  stageFocus: z
    .string()
    .describe('With or instead of teamName: the raise stage, e.g. pre-seed, seed, series-a, series-b+')
    .optional(),
});

type WarmIntrosToolArgs = z.infer<typeof WarmIntrosToolParams>;

type TargetInvestorRow = { uid: string; name: string; currentOrg: string | null; currentTitle: string | null };

type WarmPathView = Awaited<ReturnType<WarmIntrosV2Service['getPathsByInvestor']>>['paths'][number];

/**
 * Warm intros for AI Search, from the same two sources as the `/investors` page:
 * - "who can introduce us to <investor/firm>": Warm Intros v2 connector paths (WarmPathV2),
 *   exactly what the workspace drawer shows for that investor;
 * - "warm intros for <team>" / sector + stage: the Investor DB warm-intro ranking.
 */
@Injectable()
export class WarmIntrosTool {
  constructor(
    private logger: LogService,
    private prisma: PrismaService,
    private investorDbAccess: InvestorDbAccess,
    private warmIntrosV2Service: WarmIntrosV2Service,
    private investorOutreachQueryService: InvestorOutreachQueryService
  ) {}

  getTool(auth: HuskyAuthContext): CoreTool {
    return tool({
      description:
        'Find warm introductions to investors. Set investorOrFirm for "who can introduce us to <investor or firm>" (returns connector paths with proximity, connector and reasoning). Set teamName, or sectorTags/stageFocus, for "warm intros for <portfolio team>" or "which investors should <team> talk to" (returns ranked candidate investors with tier, fit score and reason). Only returns data when the signed-in user has Investor DB access.',
      parameters: WarmIntrosToolParams,
      execute: (args) => this.execute(args, auth),
    });
  }

  private async execute(args: WarmIntrosToolArgs, auth: HuskyAuthContext): Promise<string> {
    const access = await this.investorDbAccess.check(auth, WARM_INTROS_TOOL_NAME);
    if (!access.allowed) {
      return access.message;
    }

    this.logger.info(`Getting warm intros for args: ${JSON.stringify(args)}`);

    const target = args.investorOrFirm?.trim();
    if (target) {
      return this.pathsToInvestor(target);
    }
    if (args.teamName?.trim() || args.sectorTags?.length || args.stageFocus?.trim()) {
      return this.candidatesFor(args);
    }
    return 'Specify either investorOrFirm (who can introduce us to an investor or firm) or teamName / sectorTags / stageFocus (which investors to approach).';
  }

  private async pathsToInvestor(target: string): Promise<string> {
    if (target.length < MIN_TARGET_LENGTH) {
      return `"${target}" is too short to look up an investor or firm; use at least ${MIN_TARGET_LENGTH} characters.`;
    }

    const investors = await this.findInvestorsWithPaths(target);
    if (investors.length === 0) {
      return `No warm intro paths found to an investor or firm matching "${target}".`;
    }

    const sections = await Promise.all(
      investors.map(async (investor) => {
        const { paths } = await this.warmIntrosV2Service.getPathsByInvestor(investor.uid, {});
        const best = [...paths].sort((a, b) => b.score - a.score).slice(0, MAX_PATHS_PER_INVESTOR);
        const org = [investor.currentTitle, investor.currentOrg].filter(Boolean).join(', ');
        const heading = `Warm intro: ${investor.name}${org ? ` (${org})` : ''} [WarmIntroLink](${warmIntrosPath(
          investor.name
        )})`;
        const body = best.length
          ? best.map((path, index) => this.formatPath(path, index + 1)).join('\n')
          : '                No warm path above the minimum score.';
        return `${heading}\n${body}`;
      })
    );
    return sections.join('\n\n');
  }

  /**
   * MasterProfile has no Prisma relation to WarmPathV2, so the "has a warm path" restriction is a
   * join here. Only paths the workspace itself would show count: at or above its minimum score,
   * and not crediting the investor with introducing themselves.
   */
  private async findInvestorsWithPaths(target: string): Promise<TargetInvestorRow[]> {
    return this.prisma.$queryRaw<TargetInvestorRow[]>(Prisma.sql`
      SELECT mp.uid, mp."canonicalName" AS name, mp."currentOrg", mp."currentTitle"
      FROM "MasterProfile" mp
      JOIN "WarmPathV2" wp ON wp."targetProfileUid" = mp.uid
      WHERE wp.score >= ${WARM_INTROS_V2_MIN_SCORE}
        AND wp."bestConnectorProfileUid" IS DISTINCT FROM mp.uid
        AND (${fuzzySqlContainsCondition(Prisma.sql`mp."canonicalName"`, target)}
          OR ${fuzzySqlContainsCondition(Prisma.sql`mp."currentOrg"`, target)})
      GROUP BY mp.uid, mp."canonicalName", mp."currentOrg", mp."currentTitle"
      ORDER BY MAX(wp.score) DESC, mp.uid
      LIMIT ${MAX_TARGET_INVESTORS}
    `);
  }

  private formatPath(path: WarmPathView, position: number): string {
    const relationKind = relationKindFromHopChain(path.hopChain);
    const hops = asRecord(path.hopChain)?.hops;
    const chain = Array.isArray(hops)
      ? hops
          .map((hop) => asRecord(hop)?.name)
          .filter((name): name is string => typeof name === 'string' && name.trim() !== '')
          .join(' → ')
      : '';
    const connector = path.bestConnector
      ? `${path.bestConnector.name}${path.bestConnector.currentOrg ? ` (${path.bestConnector.currentOrg})` : ''}`
      : 'Unknown';
    const lines = [
      `                Path ${position}: ${path.proximityCode ?? 'no code'}, score ${path.scorePercent}%, ${
        RELATION_KIND_LABELS[relationKind] ?? relationKind
      }`,
      `                  Connector: ${connector}`,
    ];
    if (chain) lines.push(`                  Hop chain: ${chain}`);
    if (path.pathSummary?.explanation) lines.push(`                  Why: ${path.pathSummary.explanation}`);
    return lines.join('\n');
  }

  private async candidatesFor(args: WarmIntrosToolArgs): Promise<string> {
    let teamId: string | undefined;
    let resolvedTeamName: string | undefined;
    const teamName = args.teamName?.trim();
    if (teamName) {
      const team = await this.findTeam(teamName);
      if (!team) {
        return `No directory team found matching "${teamName}", so no warm intro candidates can be ranked for it.`;
      }
      teamId = team.uid;
      resolvedTeamName = team.name;
    }

    const sectorTags = normalizeSectorTags(args.sectorTags);
    const stageFocus = normalizeStageFocus(args.stageFocus);
    if (!teamId && sectorTags.length === 0 && !stageFocus) {
      return 'The given sector and stage are not in the Investor DB vocabulary, so no warm intro candidates can be ranked.';
    }

    const result = await this.investorOutreachQueryService.findWarmIntros({
      teamId,
      sectorTags: sectorTags.length ? sectorTags.join(',') : undefined,
      stageFocus,
    });

    // The ranking keeps any co-investor or engaged investor regardless of sector, which suits a
    // portfolio team's page. For a sector question with no team, an investor outside that sector
    // is not an answer, so only sector matches are kept.
    const candidates =
      !teamId && sectorTags.length
        ? result.candidates.filter((candidate) => candidate.investor.sectorTags.some((tag) => sectorTags.includes(tag)))
        : result.candidates;

    if (candidates.length === 0) {
      return `No warm intro candidates found${resolvedTeamName ? ` for ${resolvedTeamName}` : ''}.`;
    }

    const shown = candidates.slice(0, MAX_CANDIDATES);
    const header = `${resolvedTeamName ? `Warm intro candidates for ${resolvedTeamName}. ` : ''}Showing ${
      shown.length
    } of ${candidates.length} ranked candidates.\n\n`;
    return header + shown.map((candidate) => this.formatCandidate(candidate)).join('\n\n');
  }

  /** Exact name first, then a substring match; teams with PL portfolio meta win ties. */
  private async findTeam(name: string): Promise<{ uid: string; name: string } | null> {
    const select = { uid: true, name: true, portfolioMeta: { select: { id: true } } } as const;
    const exact = await this.prisma.team.findFirst({ where: { name: { equals: name, mode: 'insensitive' } }, select });
    if (exact) return exact;
    const partial = await this.prisma.team.findMany({
      where: { name: { contains: name, mode: 'insensitive' } },
      select,
      orderBy: { name: 'asc' },
      take: 10,
    });
    return partial.find((team) => team.portfolioMeta) ?? partial[0] ?? null;
  }

  private formatCandidate(candidate: WarmIntroCandidateDto): string {
    const investor = candidate.investor;
    const name = [investor.firstName, investor.lastName].filter(Boolean).join(' ') || investor.firm || 'Unknown';
    const shown = (value: string | null | undefined) => (value && value.trim() ? value : 'Not provided');
    return `Warm intro: ${name} [InvestorLink](${investorDbPath(investor.investorId)})
                Firm: ${shown(investor.firm)}
                Title: ${shown(investor.title)}
                Tier: ${TIER_LABELS[candidate.tier] ?? candidate.tier}
                Fit Score: ${candidate.fitScore}/100
                Reason: ${shown(candidate.reason)}
                Evidence: ${candidate.evidence.length ? candidate.evidence.join('; ') : 'None'}`;
  }
}
