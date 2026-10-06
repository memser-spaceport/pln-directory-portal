import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { PlInfraMembersQuery, PlInfraMembersResponse } from 'libs/contracts/src/schema/pl-infra-members';
import { AccessControlV2Service } from '../access-control-v2/services/access-control-v2.service';
import { AnalyticsService } from '../analytics/service/analytics.service';
import { ANALYTICS_EVENTS } from '../utils/constants';
import { PL_INFRA_LIST_ANALYTICS_DISTINCT_ID, PL_INFRA_POLICY_CODE } from './pl-infra-members.constants';

/**
 * Read-only view of the PL Infra user list for the MCP gateway (LAB-2765).
 *
 * The list is the set of members assigned the PL Infra policy, read live through
 * AccessControlV2Service.getPolicy (the same source as the admin RBAC view) on every
 * call, with no caching, so additions and removals show up on the gateway's next read.
 */
@Injectable()
export class PlInfraMembersService {
  private readonly logger = new Logger(PlInfraMembersService.name);

  constructor(
    private readonly accessControlService: AccessControlV2Service,
    private readonly analyticsService: AnalyticsService
  ) {}

  async listMembers({ page, limit }: PlInfraMembersQuery): Promise<PlInfraMembersResponse> {
    let assignments: Awaited<ReturnType<AccessControlV2Service['getPolicy']>>['assignments'];
    try {
      ({ assignments } = await this.accessControlService.getPolicy(PL_INFRA_POLICY_CODE));
    } catch (error) {
      // Never answer with an empty list on failure: the gateway would lock everyone out.
      this.logger.error(`Failed to load PL Infra user list (${PL_INFRA_POLICY_CODE})`, error);
      throw new InternalServerErrorException('PL Infra user list is unavailable');
    }

    const members = assignments.map((assignment) => ({
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
      this.logger.warn(`Failed to track ${ANALYTICS_EVENTS.MCP.PL_INFRA_LIST_READ}`);
    }

    return result;
  }
}
