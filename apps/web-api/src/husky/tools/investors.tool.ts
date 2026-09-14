import { Injectable } from '@nestjs/common';
import { InvestorProfileType, Prisma } from '@prisma/client';
import { tool, CoreTool } from 'ai';
import { z } from 'zod';
import { LogService } from '../../shared/log.service';
import { PrismaService } from '../../shared/prisma.service';
import { RbacService } from '../../rbac/rbac.service';
import { RBAC_PERMISSION_CODES } from '../../rbac/rbac.constants';
import { memberHasAnyPermission } from '../../rbac/rbac-permission-check';
import { AccessControlV2Service } from '../../access-control-v2/services/access-control-v2.service';
import { ADMIN_PERMISSIONS } from '../../access-control-v2/access-control-v2.constants';
import { HuskyAuthContext } from './husky-auth-context';

/** Same grant the Investor Lists / warm-intros surface requires (investor-lists.controller.ts). */
const INVESTOR_VIEW_PERMISSIONS = [RBAC_PERMISSION_CODES.INVESTOR_DB_VIEW, ADMIN_PERMISSIONS.DIRECTORY_FULL] as const;

const MAX_CANDIDATES = 200;
const MAX_RESULTS = 15;

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
      parameters: z.object({
        search: z
          .string()
          .describe('Free-text match against investment focus areas, or the investor/fund name')
          .optional(),
        investInStartupStage: z
          .string()
          .describe('Filter by a startup stage the investor invests in, e.g. Pre-Seed, Seed, Series A')
          .optional(),
        investInFundType: z.string().describe('Filter by a fund type the investor invests through').optional(),
        minCheckSize: z.number().describe('Minimum typical check size in USD').optional(),
        type: z.enum(['ANGEL', 'FUND', 'ANGEL_AND_FUND']).describe('Filter by investor profile type').optional(),
      }),
      execute: (args) => this.execute(args, auth),
    });
  }

  private async execute(
    args: {
      search?: string;
      investInStartupStage?: string;
      investInFundType?: string;
      minCheckSize?: number;
      type?: InvestorProfileType;
    },
    auth: HuskyAuthContext
  ) {
    if (!auth.memberUid) {
      return 'User is not logged in, so Investor DB data is unavailable.';
    }

    const allowed = await memberHasAnyPermission(
      this.rbacService,
      this.accessControlV2Service,
      auth.memberUid,
      INVESTOR_VIEW_PERMISSIONS
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

    const profiles = await this.prisma.investorProfile.findMany({
      where,
      include: {
        team: { select: { uid: true, name: true } },
        member: { select: { uid: true, name: true, deletedAt: true } },
      },
      take: MAX_CANDIDATES,
    });

    const search = args.search?.toLowerCase();
    const visible = profiles.filter((profile) => {
      if (profile.member?.deletedAt) return false;
      if (!profile.team && !profile.member) return false;
      if (!search) return true;
      const name = profile.team?.name ?? profile.member?.name ?? '';
      return (
        name.toLowerCase().includes(search) || profile.investmentFocus.some((f) => f.toLowerCase().includes(search))
      );
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
                  profile.typicalCheckSize ? `$${profile.typicalCheckSize.toLocaleString()}` : 'Not provided'
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
