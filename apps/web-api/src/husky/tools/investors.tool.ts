import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { tool, CoreTool } from 'ai';
import { z } from 'zod';
import { LogService } from '../../shared/log.service';
import { PrismaService } from '../../shared/prisma.service';
import { RbacService } from '../../rbac/rbac.service';
import { INVESTOR_DB_VIEW_PERMISSIONS } from '../../rbac/rbac.constants';
import { memberHasAnyPermission } from '../../rbac/rbac-permission-check';
import { AccessControlV2Service } from '../../access-control-v2/services/access-control-v2.service';
import { HuskyAuthContext } from './husky-auth-context';
import { fuzzySqlCondition } from './fuzzy-match.util';

const MAX_RESULTS = 15;
// A small buffer above MAX_RESULTS, not a ranking cutoff: the real filtering (structured
// `where` filters, and — when `search` is set — the raw-SQL uid pre-filter below) is fully
// DB-pushed and correct at any table size. This only needs to absorb the one remaining
// in-memory step, dropping soft-deleted/orphaned profiles, which is rare enough that a handful
// of extra rows is always enough.
const RESULT_FETCH_LIMIT = 50;

const InvestorsToolParams = z.object({
  search: z.string().describe('Free-text match against investment focus areas, or the investor/fund name').optional(),
  investInStartupStage: z
    .string()
    .describe('Filter by a startup stage the investor invests in, e.g. Pre-Seed, Seed, Series A')
    .optional(),
  investInFundType: z.string().describe('Filter by a fund type the investor invests through').optional(),
  minCheckSize: z.number().describe('Minimum typical check size in USD').optional(),
  type: z.enum(['ANGEL', 'FUND', 'ANGEL_AND_FUND']).describe('Filter by investor profile type').optional(),
});

@Injectable()
export class InvestorsTool {
  constructor(
    private logger: LogService,
    private prisma: PrismaService,
    private rbacService: RbacService,
    private accessControlV2Service: AccessControlV2Service
  ) {}

  getTool(auth: HuskyAuthContext): CoreTool {
    return tool({
      description:
        'Search the Investor DB for angels and funds by investment focus, startup stage they invest in, fund type, or typical check size. Only returns data when the signed-in user has Investor DB access; unavailable to everyone else.',
      parameters: InvestorsToolParams,
      execute: (args) => this.execute(args, auth),
    });
  }

  private async execute(args: z.infer<typeof InvestorsToolParams>, auth: HuskyAuthContext) {
    if (!auth.memberUid) {
      return 'User is not logged in, so Investor DB data is unavailable.';
    }

    const allowed = await memberHasAnyPermission(
      this.rbacService,
      this.accessControlV2Service,
      auth.memberUid,
      INVESTOR_DB_VIEW_PERMISSIONS
    );
    if (!allowed) {
      return 'The signed-in user does not have Investor DB access, so investor data is unavailable.';
    }

    this.logger.info(`Getting investors for args: ${JSON.stringify(args)}`);

    const where: Prisma.InvestorProfileWhereInput = {};
    if (args.type) where.type = args.type;
    if (args.minCheckSize !== undefined) where.typicalCheckSize = { gte: args.minCheckSize };
    if (args.investInStartupStage) where.investInStartupStages = { has: args.investInStartupStage };
    if (args.investInFundType) where.investInFundTypes = { has: args.investInFundType };

    const search = args.search?.trim();
    if (search) {
      const matchingUids = await this.findMatchingUids(search);
      if (matchingUids.length === 0) {
        return 'No investors found matching the search criteria.';
      }
      where.uid = { in: matchingUids };
    }

    const profiles = await this.prisma.investorProfile.findMany({
      where,
      include: {
        team: { select: { uid: true, name: true } },
        member: { select: { uid: true, name: true, deletedAt: true } },
      },
      orderBy: [{ typicalCheckSize: 'desc' }, { id: 'asc' }],
      take: RESULT_FETCH_LIMIT,
    });

    const visible = profiles.filter((profile) => {
      if (profile.member?.deletedAt) return false;
      if (!profile.team && !profile.member) return false;
      return true;
    });

    if (visible.length === 0) {
      return 'No investors found matching the search criteria.';
    }

    return visible
      .slice(0, MAX_RESULTS)
      .map((profile) => {
        const name = profile.team?.name ?? profile.member?.name ?? 'Unknown';
        const link = profile.team
          ? `[TeamLink](/teams/${profile.team.uid})`
          : profile.member
          ? `[MemberLink](/members/${profile.member.uid})`
          : '';

        return `Investor: ${name} ${link}
                Type: ${profile.type ?? 'Not specified'}
                Investment Focus: ${profile.investmentFocus.join(', ') || 'Not provided'}
                Invests in Startup Stages: ${profile.investInStartupStages.join(', ') || 'Not provided'}
                Invests via Fund Types: ${profile.investInFundTypes.join(', ') || 'Not provided'}
                Typical Check Size: ${
                  profile.typicalCheckSize != null ? `$${profile.typicalCheckSize.toLocaleString()}` : 'Not provided'
                }
                Invests via Fund: ${
                  profile.isInvestViaFund === null || profile.isInvestViaFund === undefined
                    ? 'Not specified'
                    : profile.isInvestViaFund
                    ? 'Yes'
                    : 'No'
                }`;
      })
      .join('\n\n');
  }

  /**
   * `investmentFocus` is a `String[]` — Prisma's array filters are `has`/`hasSome`/`hasEvery`/
   * exact equality only, with no case-insensitive substring operator over individual elements —
   * so free-text matching against it (and against team/member name) has to be raw SQL rather
   * than a Prisma `where`. `fuzzySqlCondition` matches bidirectionally per term (search-in-tag
   * AND tag-in-search) so a model-normalized single word ("neurotechnology") still matches
   * terser stored tags ("neuro"/"tech"/"neuro tech"), and a compound tag ("DeepTech") still
   * matches a spaced-out search ("deep tech") via one of its words, while a short token such as
   * "ai" only matches a whole word — not every name with those two letters in it. Doing the
   * match here, in SQL, rather than in memory over a capped candidate fetch means it scales
   * correctly to any table size: nothing gets silently excluded by a fetch limit ahead of the
   * filter, because the filter *is* the fetch.
   */
  private async findMatchingUids(search: string): Promise<string[]> {
    const rows = await this.prisma.$queryRaw<{ uid: string }[]>(Prisma.sql`
      SELECT DISTINCT ip.uid
      FROM "InvestorProfile" ip
      LEFT JOIN "Team" t ON t."investorProfileId" = ip.uid
      LEFT JOIN "Member" m ON m."investorProfileId" = ip.uid
      WHERE
        EXISTS (SELECT 1 FROM unnest(ip."investmentFocus") AS focus_item WHERE ${fuzzySqlCondition(
          Prisma.sql`focus_item`,
          search
        )})
        OR ${fuzzySqlCondition(Prisma.sql`COALESCE(t.name, m.name)`, search)}
    `);

    return rows.map((row) => row.uid);
  }
}
