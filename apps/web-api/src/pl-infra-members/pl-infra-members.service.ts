import { Injectable, InternalServerErrorException, Logger, NotFoundException } from '@nestjs/common';
import { PlInfraMembersQuery, PlInfraMembersResponse } from 'libs/contracts/src/schema/pl-infra-members';
import { AccessControlV2Service } from '../access-control-v2/services/access-control-v2.service';
import { AnalyticsService } from '../analytics/service/analytics.service';
import { PrismaService } from '../shared/prisma.service';
import { ANALYTICS_EVENTS } from '../utils/constants';
import { PL_INFRA_LIST_ANALYTICS_DISTINCT_ID, PL_INFRA_POLICY_CODE } from './pl-infra-members.constants';

/**
 * Read-only view of the PL Infra user list for the MCP gateway (LAB-2765).
 *
 * The list is the set of members assigned the PL Infra policy, read live through
 * AccessControlV2Service.getPolicy (the same source as the admin RBAC view) on every
 * call, with no caching, so additions and removals show up on the gateway's next read.
 * Soft-deleted members (`Member.deletedAt` set) are left out (Vova, 2026-10-06).
 */
@Injectable()
export class PlInfraMembersService {
  private readonly logger = new Logger(PlInfraMembersService.name);

  constructor(
    private readonly accessControlService: AccessControlV2Service,
    private readonly analyticsService: AnalyticsService,
    private readonly prisma: PrismaService
  ) {}

  async listMembers({ page, limit }: PlInfraMembersQuery): Promise<PlInfraMembersResponse> {
    let assignments: Awaited<ReturnType<AccessControlV2Service['getPolicy']>>['assignments'];
    let activeUids: Set<string>;
    try {
      ({ assignments } = await this.accessControlService.getPolicy(PL_INFRA_POLICY_CODE));
      // getPolicy returns soft-deleted members too; keep only the ones whose account is not deleted.
      const active = await this.prisma.member.findMany({
        where: { uid: { in: assignments.map((assignment) => assignment.memberUid) }, deletedAt: null },
        select: { uid: true },
      });
      activeUids = new Set(active.map((member) => member.uid));
    } catch (error) {
      // Never answer with an empty list on failure: the gateway would lock everyone out.
      this.logger.error(`Failed to load PL Infra user list (${PL_INFRA_POLICY_CODE})`, error);
      if (error instanceof NotFoundException) {
        throw new InternalServerErrorException(`PL Infra policy is not configured: ${PL_INFRA_POLICY_CODE}`);
      }
      throw new InternalServerErrorException('PL Infra user list is unavailable');
    }

    const members = assignments
      .filter((assignment) => activeUids.has(assignment.memberUid))
      .map((assignment) => ({
        memberUid: assignment.memberUid,
        name: assignment.member?.name ?? null,
      }));
    const start = (page - 1) * limit;
    const result = { page, limit, total: members.length, items: members.slice(start, start + limit) };

    try {
      await this.analyticsService.trackEvent({
        name: ANALYTICS_EVENTS.MCP.PL_INFRA_LIST_READ,
        distinctId: PL_INFRA_LIST_ANALYTICS_DISTINCT_ID,
        properties: { page, limit, total: result.total, returned: result.items.length },
      });
    } catch (error) {
      this.logger.warn(`Failed to track ${ANALYTICS_EVENTS.MCP.PL_INFRA_LIST_READ}`, error);
    }

    return result;
  }
}
