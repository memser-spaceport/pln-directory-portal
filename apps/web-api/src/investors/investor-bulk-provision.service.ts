import { Injectable } from '@nestjs/common';
import { Prisma, Team } from '@prisma/client';
import {
  ExistingMemberForBulk,
  InvestorBulkParticipantInput,
  InvestorBulkProvisionOptions,
  InvestorBulkProvisionResult,
} from './investor-bulk.types';

type TransactionClient = Omit<
  Prisma.TransactionClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;

@Injectable()
export class InvestorBulkProvisionService {
  normalizeTwitterHandler(handler?: string | null): string | undefined {
    if (!handler) return undefined;

    let normalized = handler.trim().replace(/^@/, '');
    const twitterUrlMatch = normalized.match(/(?:https?:\/\/)?(?:www\.)?(?:twitter\.com|x\.com)\/([a-zA-Z0-9_]+)/);
    if (twitterUrlMatch) {
      normalized = twitterUrlMatch[1];
    }

    return normalized || undefined;
  }

  normalizeLinkedinHandler(handler?: string | null): string | undefined {
    if (!handler) return undefined;

    const trimmed = handler.trim();
    const linkedinUrlMatch = trimmed.match(/(?:https?:\/\/)?(?:www\.)?linkedin\.com\/in\/([a-zA-Z0-9-]+)/);
    if (linkedinUrlMatch) {
      return linkedinUrlMatch[1];
    }

    return trimmed || undefined;
  }

  normalizeTelegramHandler(handler?: string | null): string | undefined {
    if (!handler) return undefined;

    let normalized = handler.trim().replace(/^@/, '');
    const telegramUrlMatch = normalized.match(/(?:https?:\/\/)?(?:www\.)?(?:telegram\.org|t\.me)\/([a-zA-Z0-9_]+)/);
    if (telegramUrlMatch) {
      normalized = telegramUrlMatch[1];
    }

    return normalized || undefined;
  }

  async provisionInvestorFromBulkRow(
    tx: TransactionClient,
    participantData: InvestorBulkParticipantInput,
    existingMember: ExistingMemberForBulk | undefined,
    caches: {
      teamCache: Map<string, Team>;
      telegramOwnerCache: Map<string, string | null>;
    },
    options: InvestorBulkProvisionOptions = {}
  ): Promise<InvestorBulkProvisionResult> {
    const normalizedTwitter = this.normalizeTwitterHandler(participantData.twitterHandler);
    const normalizedLinkedin = this.normalizeLinkedinHandler(participantData.linkedinHandler);
    const normalizedTelegram = this.normalizeTelegramHandler(participantData.telegramHandler);

    let telegramOwnerUid: string | null = null;
    if (normalizedTelegram) {
      if (caches.telegramOwnerCache.has(normalizedTelegram)) {
        telegramOwnerUid = caches.telegramOwnerCache.get(normalizedTelegram) || null;
      } else {
        const owner = await tx.member.findFirst({
          where: { telegramHandler: normalizedTelegram },
          select: { uid: true },
        });
        telegramOwnerUid = owner?.uid || null;
        caches.telegramOwnerCache.set(normalizedTelegram, telegramOwnerUid);
      }
    }

    const isTeamInvestorProfile =
      (participantData.investmentType === 'FUND' || participantData.investmentType === 'ANGEL_AND_FUND') &&
      participantData.organization;

    const willBeTeamLead = participantData.organization
      ? typeof participantData.makeTeamLead === 'boolean'
        ? participantData.makeTeamLead
        : true
      : false;

    const summaryDelta = {
      createdUsers: 0,
      updatedUsers: 0,
      createdTeams: 0,
      updatedMemberships: 0,
      promotedToLead: 0,
    };

    let memberUid: string;
    let isNewUser = false;

    if (existingMember) {
      memberUid = existingMember.uid;

      const updateData: Prisma.MemberUpdateInput = {
        name: participantData.name,
        twitterHandler: normalizedTwitter,
        linkedinHandler: normalizedLinkedin,
      };

      if (normalizedTelegram && (!telegramOwnerUid || telegramOwnerUid === existingMember.uid)) {
        updateData.telegramHandler = normalizedTelegram;
      }

      if (existingMember.investorProfile) {
        const updatedInvestorType = participantData.investmentType || existingMember.investorProfile.type;
        const profileUpdate = isTeamInvestorProfile
          ? {
              type: updatedInvestorType ?? undefined,
              secRulesAccepted:
                participantData.secRulesAccepted !== undefined
                  ? participantData.secRulesAccepted ?? undefined
                  : existingMember.investorProfile.secRulesAccepted ?? undefined,
            }
          : {
              type: updatedInvestorType ?? undefined,
              typicalCheckSize:
                participantData.typicalCheckSize !== undefined
                  ? participantData.typicalCheckSize ?? undefined
                  : existingMember.investorProfile.typicalCheckSize ?? undefined,
              investInStartupStages:
                participantData.investInStartupStages !== undefined
                  ? participantData.investInStartupStages ?? undefined
                  : existingMember.investorProfile.investInStartupStages ?? undefined,
              secRulesAccepted:
                participantData.secRulesAccepted !== undefined
                  ? participantData.secRulesAccepted ?? undefined
                  : existingMember.investorProfile.secRulesAccepted ?? undefined,
            };

        updateData.investorProfile = {
          update: profileUpdate,
        };
      }

      await tx.member.update({
        where: { uid: memberUid },
        data: updateData,
      });
      summaryDelta.updatedUsers++;
    } else {
      let investorType = participantData.investmentType;
      if (!investorType && participantData.secRulesAccepted) {
        investorType = 'ANGEL';
      }

      const createData: Prisma.MemberCreateInput = {
        name: participantData.name,
        email: participantData.email,
        twitterHandler: normalizedTwitter,
        linkedinHandler: normalizedLinkedin,
        ...(options.useApproveOnLogin ? { approveOnLogin: true } : {}),
        memberApproval: {
          create: {
            state: 'PENDING',
            reason: options.memberCreationReason || 'Auto-created on investor bulk upload',
          },
        },
        investorProfile: isTeamInvestorProfile
          ? {
              create: {
                type: investorType || undefined,
                secRulesAccepted: participantData.secRulesAccepted || false,
              },
            }
          : {
              create: {
                type: investorType || undefined,
                typicalCheckSize: participantData.typicalCheckSize || undefined,
                investInStartupStages: participantData.investInStartupStages || undefined,
                secRulesAccepted: participantData.secRulesAccepted || false,
              },
            },
      };

      if (normalizedTelegram && !telegramOwnerUid) {
        createData.telegramHandler = normalizedTelegram;
      }

      const newMember = await tx.member.create({ data: createData });
      memberUid = newMember.uid;
      isNewUser = true;
      summaryDelta.createdUsers++;
    }

    let orgTeamUid: string | undefined;
    if (participantData.organization) {
      const orgName = participantData.organization.trim();
      let team = caches.teamCache.get(orgName.toLowerCase());

      if (!team) {
        team =
          (await tx.team.findFirst({
            where: {
              name: {
                equals: orgName,
                mode: 'insensitive',
              },
            },
          })) ?? undefined;

        if (!team) {
          const isFund =
            participantData.investmentType === 'FUND' || participantData.investmentType === 'ANGEL_AND_FUND';

          team = await tx.team.create({
            data: {
              name: orgName,
              contactMethod: participantData.organizationEmail || undefined,
              isFund,
              accessLevel: 'L0',
              accessLevelUpdatedAt: new Date(),
              tier: -1,
              priority: 99,
            },
          });
          summaryDelta.createdTeams++;
        } else if (participantData.organizationEmail && (!team.contactMethod || team.contactMethod.trim() === '')) {
          team = await tx.team.update({
            where: { uid: team.uid },
            data: {
              name: orgName,
              contactMethod: participantData.organizationEmail,
            },
          });
        }

        caches.teamCache.set(orgName.toLowerCase(), team);
      }

      if (isTeamInvestorProfile) {
        const teamInvestorProfile = await tx.investorProfile.findUnique({
          where: { teamUid: team.uid },
        });

        if (teamInvestorProfile) {
          await tx.investorProfile.update({
            where: { uid: teamInvestorProfile.uid },
            data: {
              typicalCheckSize: participantData.typicalCheckSize || undefined,
              investInStartupStages: participantData.investInStartupStages || undefined,
            },
          });
        } else {
          const newInvestorProfile = await tx.investorProfile.create({
            data: {
              teamUid: team.uid,
              typicalCheckSize: participantData.typicalCheckSize || undefined,
              investInStartupStages: participantData.investInStartupStages || undefined,
            },
          });
          await tx.team.update({
            where: { uid: team.uid },
            data: { investorProfileId: newInvestorProfile.uid, name: team.name },
          });
        }
      }

      orgTeamUid = team.uid;

      const existingRole = await tx.teamMemberRole.findUnique({
        where: {
          memberUid_teamUid: { memberUid, teamUid: orgTeamUid },
        },
      });

      if (existingRole) {
        const shouldBeTeamLead = willBeTeamLead || participantData.role === 'Lead';
        const shouldUpdateRole =
          participantData.role && participantData.role !== (existingRole.teamLead ? 'Lead' : 'Contributor');

        if ((shouldBeTeamLead && !existingRole.teamLead) || shouldUpdateRole) {
          const newRole = participantData.role || (shouldBeTeamLead ? 'Lead' : 'Contributor');
          const newTeamLead = shouldBeTeamLead || participantData.role === 'Lead';

          await tx.teamMemberRole.update({
            where: {
              memberUid_teamUid: { memberUid, teamUid: orgTeamUid },
            },
            data: {
              teamLead: newTeamLead,
              role: newRole,
              investmentTeam:
                !!isTeamInvestorProfile && !existingMember?.teamMemberRoles?.find((r) => r.investmentTeam),
            },
          });

          if (!existingRole.teamLead && newTeamLead) {
            summaryDelta.promotedToLead++;
          }
        }
      } else {
        const isTeamLead = willBeTeamLead || participantData.role === 'Lead';

        await tx.teamMemberRole.create({
          data: {
            memberUid,
            teamUid: orgTeamUid,
            teamLead: isTeamLead,
            role: participantData.role || (willBeTeamLead ? 'Lead' : 'Contributor'),
            mainTeam: !existingMember?.teamMemberRoles?.find((r) => r.mainTeam),
            investmentTeam: !!isTeamInvestorProfile && !existingMember?.teamMemberRoles?.find((r) => r.investmentTeam),
          },
        });
        summaryDelta.updatedMemberships++;

        if (isTeamLead) {
          summaryDelta.promotedToLead++;
        }
      }
    }

    return {
      memberUid,
      orgTeamUid,
      isNewUser,
      willBeTeamLead,
      normalizedTwitter,
      normalizedLinkedin,
      normalizedTelegram,
      summaryDelta,
    };
  }
}
