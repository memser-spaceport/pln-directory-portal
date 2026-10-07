import { Injectable } from '@nestjs/common';
import { LogService } from '../../shared/log.service';
import { RbacService } from '../../rbac/rbac.service';
import { INVESTOR_DB_VIEW_PERMISSIONS } from '../../rbac/rbac.constants';
import { memberHasAnyPermission } from '../../rbac/rbac-permission-check';
import { AccessControlV2Service } from '../../access-control-v2/services/access-control-v2.service';
import { HuskyAuthContext } from './husky-auth-context';

export type InvestorDbAccessResult = { allowed: true } | { allowed: false; message: string };

/**
 * The one access rule for every Husky investor tool: the same Investor DB view permissions the
 * `/investors` page APIs require. A denial is logged before the tool answers, so a member who
 * reports "search can't see the Investor DB" can be traced in the pod logs.
 *
 * The investor tools and the dataset each one reads:
 * - `getInvestorDb` (investor-db.tool.ts): the curated Investor DB, InvestorOutreachRecord.
 *   Rows link to `/investors?mode=list&investorId=…`.
 * - `getWarmIntros` (warm-intros.tool.ts): "intro to <investor/firm>" reads Warm Intros v2
 *   paths (WarmPathV2 via WarmIntrosV2Service, linking to `/investors?mode=warm-intros-v2&wi2_q=…`);
 *   "warm intros for <team>" reads the Investor DB ranking (InvestorOutreachQueryService.findWarmIntros).
 * - `getInvestorProfiles` (investors.tool.ts): the self-reported InvestorProfile that members and
 *   teams fill in on their own profile. Not the Investor DB.
 * The system prompt (HUSKY_CONTEXTUAL_TOOLS_SYSTEM_PROMPT) routes questions between them.
 */
@Injectable()
export class InvestorDbAccess {
  constructor(
    private logger: LogService,
    private rbacService: RbacService,
    private accessControlV2Service: AccessControlV2Service
  ) {}

  async check(auth: HuskyAuthContext, toolName: string): Promise<InvestorDbAccessResult> {
    if (!auth.memberUid) {
      this.logger.info(`Husky ${toolName} denied: not logged in member=none`);
      return { allowed: false, message: 'User is not logged in, so investor data is unavailable.' };
    }

    const allowed = await memberHasAnyPermission(
      this.rbacService,
      this.accessControlV2Service,
      auth.memberUid,
      INVESTOR_DB_VIEW_PERMISSIONS
    );
    if (!allowed) {
      this.logger.info(`Husky ${toolName} denied: no Investor DB access member=${auth.memberUid}`);
      return {
        allowed: false,
        message: 'The signed-in user does not have Investor DB access, so investor data is unavailable.',
      };
    }

    return { allowed: true };
  }
}
