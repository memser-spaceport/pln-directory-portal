import { Injectable, NotFoundException } from '@nestjs/common';
import { InvestorProfileType, MemberApprovalState } from '@prisma/client';
import { upsertPolicyAssignmentByCode } from '../demo-days/demo-day-investor-policy.util';
import { PrismaService } from '../shared/prisma.service';
import { LogService } from '../shared/log.service';
import { CacheService } from '../utils/cache/cache.service';

const PL_INVESTOR_POLICY_CODE = 'investor_pl';

@Injectable()
export class InvestorProfileService {
  constructor(private prisma: PrismaService, private logger: LogService, private cacheService: CacheService) {}

  async createOrUpdateInvestorProfile(
    memberUid: string,
    investorProfileData: {
      investmentFocus: string[];
      typicalCheckSize?: number;
      secRulesAccepted?: boolean;
      investInStartupStages?: string[];
      investInFundTypes?: string[];
      teamUid?: string;
      type?: InvestorProfileType;
      isInvestViaFund?: boolean;
    }
  ) {
    try {
      const member = await this.prisma.member.findUnique({
        where: { uid: memberUid },
        select: {
          investorProfileId: true,
          investorProfile: true,
          isInvestor: true,
          memberApproval: { select: { state: true } },
        },
      });

      if (!member) {
        throw new NotFoundException('Member not found');
      }

      const investorTypes: InvestorProfileType[] = ['ANGEL', 'FUND', 'ANGEL_AND_FUND'];

      // Auto-upgrade L2-L4 members to L6 and set isInvestor if they provide an investor type
      if (investorProfileData.type && investorTypes.includes(investorProfileData.type)) {
        await this.prisma.member.update({
          where: { uid: memberUid },
          data: { isInvestor: true },
        });

        if (member.memberApproval?.state === MemberApprovalState.APPROVED) {
          await upsertPolicyAssignmentByCode(this.prisma, memberUid, PL_INVESTOR_POLICY_CODE);
        }

        this.logger.info(
          `Member isInvestor flag set: memberUid=${memberUid}, investorType=${investorProfileData.type}`
        );
      }

      let result;
      const secRulesAcceptedAt =
        investorProfileData.secRulesAccepted &&
        member.investorProfile?.secRulesAccepted !== investorProfileData.secRulesAccepted
          ? new Date()
          : member.investorProfile?.secRulesAcceptedAt;

      if (member.investorProfileId) {
        // Update existing investor profile
        result = await this.prisma.investorProfile.update({
          where: { uid: member.investorProfileId },
          data: {
            investmentFocus: investorProfileData.investmentFocus,
            typicalCheckSize: investorProfileData.typicalCheckSize,
            secRulesAccepted: investorProfileData.secRulesAccepted,
            investInStartupStages: investorProfileData.investInStartupStages ?? ([] as string[]),
            type: investorProfileData.type || null,
            investInFundTypes: investorProfileData.investInFundTypes ?? ([] as string[]),
            teamUid: investorProfileData.teamUid,
            isInvestViaFund: investorProfileData.isInvestViaFund,
            secRulesAcceptedAt,
          },
        });
      } else {
        // Create new investor profile
        result = await this.prisma.investorProfile.create({
          data: {
            investmentFocus: investorProfileData.investmentFocus,
            typicalCheckSize: investorProfileData.typicalCheckSize,
            secRulesAccepted: investorProfileData.secRulesAccepted,
            investInStartupStages: investorProfileData.investInStartupStages ?? [],
            type: investorProfileData.type || null,
            investInFundTypes: investorProfileData.investInFundTypes ?? ([] as string[]),
            isInvestViaFund: investorProfileData.isInvestViaFund,
            secRulesAcceptedAt,
            memberUid: memberUid,
            teamUid: investorProfileData.teamUid,
          },
        });

        // Link the investor profile to the member
        await this.prisma.member.update({
          where: { uid: memberUid },
          data: { investorProfileId: result.uid },
        });
      }

      await this.cacheService.reset({ service: 'members' });
      return result;
    } catch (error) {
      this.logger.error('Error creating/updating investor profile', error);
      throw error;
    }
  }

  /**
   * Gets the investor profile for a member
   *
   * @param memberUid - The UID of the member
   * @returns The investor profile or null if not found
   */
  async getInvestorProfile(memberUid: string) {
    try {
      const member = await this.prisma.member.findUnique({
        where: { uid: memberUid },
        select: { investorProfileId: true },
      });

      if (!member?.investorProfileId) {
        return null;
      }

      return await this.prisma.investorProfile.findUnique({
        where: { uid: member.investorProfileId },
      });
    } catch (error) {
      this.logger.error('Error fetching investor profile', error);
      throw error;
    }
  }
}
