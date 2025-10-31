import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { InvestorProfileType } from '@prisma/client';
import { PrismaService } from '../shared/prisma.service';
import { LogService } from '../shared/log.service';
import { CacheService } from '../utils/cache/cache.service';

@Injectable()
export class InvestorProfileService {
  constructor(private prisma: PrismaService, private logger: LogService, private cacheService: CacheService) {}

  /**
   * Creates or updates an investor profile for a member
   * Only L5 and L6 members can create/update their own investor profile
   * Automatically upgrades L2-L4 members to L6 when they provide an investor type
   *
   * @param memberUid - The UID of the member
   * @param memberAccessLevel - The access level of the member
   * @param investorProfileData - The investor profile data
   * @returns The created/updated investor profile
   */
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
        select: { investorProfileId: true, investorProfile: true, accessLevel: true },
      });

      if (!member) {
        throw new NotFoundException('Member not found');
      }

      // Auto-upgrade L2-L4 members to L6 if they provide an investor type
      const investorTypes: InvestorProfileType[] = ['ANGEL', 'FUND', 'ANGEL_AND_FUND'];
      const shouldUpgradeToL6 =
        investorProfileData.type &&
        investorTypes.includes(investorProfileData.type) &&
        member.accessLevel &&
        ['L2', 'L3', 'L4'].includes(member.accessLevel);

      if (shouldUpgradeToL6) {
        await this.prisma.member.update({
          where: { uid: memberUid },
          data: { accessLevel: 'L6' },
        });
        this.logger.info(
          `Member access level upgraded to L6: memberUid=${memberUid}, oldLevel=${member.accessLevel}, investorType=${investorProfileData.type}`
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
   * Only L5 and L6 members can view their own investor profile
   *
   * @param memberUid - The UID of the member
   * @param memberAccessLevel - The access level of the member
   * @returns The investor profile or null if not found
   */
  async getInvestorProfile(memberUid: string) {
    try {
      const member = await this.prisma.member.findUnique({
        where: { uid: memberUid },
        select: { investorProfileId: true, accessLevel: true },
      });

      if (!member?.investorProfileId || (member.accessLevel !== 'L5' && member.accessLevel !== 'L6')) {
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
