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
import { fuzzyMatches } from './fuzzy-match.util';

const MAX_CANDIDATES = 500;
const MAX_RESULTS = 15;

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

    // `search` matches free text against investment-focus tags (e.g. "neuro tech" against
    // "Neurotech"), which Prisma cannot express as a case-insensitive substring match over a
    // string array — so it is applied in-memory below rather than in `where`. The structured
    // filters above narrow the DB fetch first; a deterministic order keeps this bounded scan
    // reproducible instead of relying on whatever order Postgres happens to return.
    const profiles = await this.prisma.investorProfile.findMany({
      where,
      include: {
        team: { select: { uid: true, name: true } },
        member: { select: { uid: true, name: true, deletedAt: true } },
      },
      orderBy: [{ typicalCheckSize: 'desc' }, { id: 'asc' }],
      take: MAX_CANDIDATES,
    });

    const search = args.search?.trim();
    const visible = profiles.filter((profile) => {
      if (profile.member?.deletedAt) return false;
      if (!profile.team && !profile.member) return false;
      if (!search) return true;
      const name = profile.team?.name ?? profile.member?.name ?? '';
      return fuzzyMatches(name, search) || profile.investmentFocus.some((f) => fuzzyMatches(f, search));
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
}
