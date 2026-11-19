import { Injectable, Logger } from '@nestjs/common';
import { APP_ENV } from '../utils/constants';
import { LABOS_AGENT_PERMISSIONS } from '../access-control-v2/access-control-v2.constants';
import { AccessControlV2Service } from '../access-control-v2/services/access-control-v2.service';

/** The pilot gate for the LabOS agent (LAB-3272 contract C1, decision D1 option A in LAB-3344). */
@Injectable()
export class LabosAgentAccessService {
  private readonly logger = new Logger(LabosAgentAccessService.name);

  constructor(private readonly accessControl: AccessControlV2Service) {}

  /**
   * D1 option A (LAB-3344): staff and the pilot list see the agent, by RBAC.
   * - A caller with no live member (unknown or deleted) is never enabled.
   * - Outside production every live member is enabled (the rule from before D1, kept for dev and previews).
   * - On production only a member with `labos_agent.use` is enabled: a direct grant or a policy
   *   (`labos_agent_pilot`). Staff get the agent the same way: an admin grants the permission or the policy.
   * A failed permission lookup gives false, so the caller gets the same "agent off" response.
   */
  async isEnabled(memberUid: string | undefined): Promise<boolean> {
    if (!memberUid) return false;
    if (process.env.ENVIRONMENT !== APP_ENV.PRODUCTION) return true;
    try {
      const { allowed } = await this.accessControl.hasPermission(memberUid, LABOS_AGENT_PERMISSIONS.USE);
      return allowed === true;
    } catch (error) {
      this.logger.warn(`labos_agent.use lookup failed for ${memberUid}: ${(error as Error)?.message ?? error}`);
      return false;
    }
  }
}
