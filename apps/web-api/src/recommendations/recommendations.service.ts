import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { ApprovalStatus, Member, Prisma, RecommendationRunStatus } from '@prisma/client';
import sanitizeHtml from 'sanitize-html';
import { PrismaService } from '../shared/prisma.service';
import { LogService } from '../shared/log.service';
import { RecommendationsEngine, MemberWithRelations, RecommendationFactors } from './recommendations.engine';
import { AwsService } from '../utils/aws/aws.service';
import { HuskyGenerationService } from '../husky/husky-generation.service';
import * as path from 'path';
import {
  CreateRecommendationRunRequest,
  GenerateMoreRecommendationsRequest,
  UpdateRecommendationRunStatusRequest,
  SendRecommendationsRequest,
} from 'libs/contracts/src/schema/recommendations';
import { getRandomId, isEmails } from '../utils/helper/helper';

@Injectable()
export class RecommendationsService {
  private readonly recommendationsPerRun = 1;
  private supportEmail: string | undefined;
  private readonly isRecommendationsEnabled: boolean;

  constructor(
    private prisma: PrismaService,
    private logger: LogService,
    private awsService: AwsService,
    private huskyGenerationService: HuskyGenerationService
  ) {
    this.supportEmail = this.getSupportEmail();
    this.isRecommendationsEnabled = process.env.IS_RECOMMENDATIONS_ENABLED?.toLowerCase() === 'true';
  }

  async createRecommendationRun(
    createDto: CreateRecommendationRunRequest,
    allMembers?: MemberWithRelations[],
    isExample = false
  ) {
    const targetMember = await this.prisma.member.findUnique({
      where: { uid: createDto.targetMemberUid },
    });

    if (!targetMember) {
      throw new NotFoundException('Target member not found');
    }

    const recommendations = await this.generateRecommendations(
      targetMember.uid,
      this.recommendationsPerRun,
      [],
      allMembers,
      isExample
    );

    return this.prisma.recommendationRun.create({
      data: {
        targetMemberUid: createDto.targetMemberUid,
        status: RecommendationRunStatus.OPEN,
        recommendations: {
          create: recommendations.map((rec) => ({
            recommendedMember: { connect: { uid: rec.memberUid } },
            score: rec.score,
            factors: rec.factors as any,
            status: ApprovalStatus.PENDING,
          })),
        },
      },
      include: {
        recommendations: {
          include: {
            recommendedMember: true,
          },
        },
      },
    });
  }

  async generateMoreRecommendations(uid: string, generateDto: GenerateMoreRecommendationsRequest) {
    const recommendationRun = await this.prisma.recommendationRun.findUnique({
      where: { uid },
      include: {
        targetMember: true,
        recommendations: true,
      },
    });

    if (!recommendationRun) {
      throw new NotFoundException('Recommendation run not found');
    }

    await this.prisma.recommendation.updateMany({
      where: {
        recommendationRunUid: uid,
        uid: { in: generateDto.approvedRecommendationUids },
      },
      data: { status: ApprovalStatus.APPROVED },
    });

    await this.prisma.recommendation.updateMany({
      where: {
        recommendationRunUid: uid,
        uid: { in: generateDto.rejectedRecommendationUids },
      },
      data: { status: ApprovalStatus.REJECTED },
    });

    const activeRecommendations = await this.prisma.recommendation.findMany({
      where: {
        recommendationRunUid: uid,
        status: { in: [ApprovalStatus.APPROVED, ApprovalStatus.PENDING] },
      },
    });
    const count = this.recommendationsPerRun - activeRecommendations.length;

    if (count > 0) {
      const existingRecommendedMemberUids = recommendationRun.recommendations.map((rec) => rec.recommendedMemberUid);

      const newRecommendations = await this.generateRecommendations(
        recommendationRun.targetMemberUid,
        count,
        existingRecommendedMemberUids
      );

      await this.prisma.recommendation.createMany({
        data: newRecommendations.map((rec) => ({
          recommendationRunUid: uid,
          recommendedMemberUid: rec.memberUid,
          score: rec.score,
          factors: rec.factors as any,
          status: ApprovalStatus.PENDING,
        })),
      });
    }

    return this.prisma.recommendationRun.findUnique({
      where: { uid },
      include: {
        recommendations: {
          include: {
            recommendedMember: true,
          },
        },
      },
    });
  }

  async getRecommendationRuns(targetMemberUid?: string, status?: string, unique?: boolean) {
    return this.prisma.recommendationRun.findMany({
      where: {
        ...(targetMemberUid && { targetMemberUid }),
        ...(status && { status: status as RecommendationRunStatus }),
      },
      distinct: unique ? 'targetMemberUid' : undefined,
      include: {
        targetMember: true,
        recommendations: {
          include: {
            recommendedMember: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: 100,
    });
  }

  async getRecommendationRun(uid: string) {
    const run = await this.prisma.recommendationRun.findUnique({
      where: { uid },
      include: {
        targetMember: true,
        recommendations: {
          include: {
            recommendedMember: true,
          },
        },
      },
    });

    if (!run) {
      throw new NotFoundException('Recommendation run not found');
    }

    return run;
  }

  async updateRecommendationRunStatus(uid: string, updateDto: UpdateRecommendationRunStatusRequest) {
    const run = await this.prisma.recommendationRun.findUnique({
      where: { uid },
    });

    if (!run) {
      throw new NotFoundException('Recommendation run not found');
    }

    return this.prisma.recommendationRun.update({
      where: { uid },
      data: { status: updateDto.status },
      include: {
        recommendations: {
          include: {
            recommendedMember: true,
          },
        },
      },
    });
  }

  async sendRecommendations(uid: string, sendDto: SendRecommendationsRequest) {
    const run = await this.prisma.recommendationRun.findUnique({
      where: { uid },
      include: {
        targetMember: true,
        recommendations: true,
      },
    });

    if (!run) {
      throw new NotFoundException('Recommendation run not found');
    }

    // Update the status of approved recommendations
    if (sendDto.approvedRecommendationUids?.length > 0) {
      await this.prisma.recommendation.updateMany({
        where: {
          recommendationRunUid: uid,
          uid: { in: sendDto.approvedRecommendationUids },
        },
        data: { status: ApprovalStatus.APPROVED },
      });
    }

    const approvedRecommendations = await this.prisma.recommendation.findMany({
      where: {
        recommendationRunUid: uid,
        status: ApprovalStatus.APPROVED,
      },
      include: {
        recommendedMember: {
          include: {
            image: true,
            teamMemberRoles: {
              include: {
                team: {
                  include: {
                    logo: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (approvedRecommendations.length === 0) {
      return run;
    }

    const emailData = await this.prepareEmailTemplateData(run.targetMember, approvedRecommendations, sendDto.isExample);

    const toEmail = sendDto.email || run.targetMember.email;
    if (!toEmail) {
      throw new BadRequestException('No email address available to send recommendations');
    }

    if (sendDto.isExample) {
      await this.sendExampleRecommendationEmail(emailData, toEmail, sendDto.emailSubject);
    } else {
      await this.sendRecommendationEmail(emailData, toEmail, sendDto.emailSubject);
    }

    await this.prisma.recommendationNotification.create({
      data: {
        recommendationRunUid: uid,
        targetMemberUid: run.targetMemberUid,
        email: toEmail,
        subject: sendDto.emailSubject,
        isExample: sendDto.isExample,
        recommendations: {
          connect: approvedRecommendations.map((rec) => ({ uid: rec.uid })),
        },
      },
    });

    return this.prisma.recommendationRun.update({
      where: { uid },
      data: { status: RecommendationRunStatus.SENT },
    });
  }

  private async prepareEmailTemplateData(
    targetMember: Member,
    approvedRecommendations: Array<
      Prisma.RecommendationGetPayload<{
        include: {
          recommendedMember: {
            include: {
              image: true;
              teamMemberRoles: {
                include: {
                  team: {
                    include: {
                      logo: true;
                    };
                  };
                };
              };
            };
          };
        };
      }>
    >,
    isExample = false
  ): Promise<{
    name: string;
    user_email_frequency_preference: string;
    link: string;
    feedback_link: string;
    recommendations: Array<{
      name: string;
      image: string;
      team_description: string | null;
      team_name: string;
      team_logo: string;
      position: string;
      link: string;
      reason: string;
    }>;
    footer_text: string;
  }> {
    const utmSource = isExample ? 'recommendations_example' : 'recommendations';
    const recommendations = await Promise.all(
      approvedRecommendations.map(async (rec) => {
        const member = rec.recommendedMember;
        const primaryRole = member.teamMemberRoles[0];
        const team = primaryRole?.team;
        const sanitizedTeamDescription = sanitizeHtml(team?.shortDescription || '', {
          allowedTags: [],
          allowedAttributes: [],
        });

        // Get target member with full relations for LLM generation
        const targetMemberWithRelations = await this.prisma.member.findUnique({
          where: { uid: targetMember.uid },
          include: {
            teamMemberRoles: {
              include: {
                team: {
                  include: {
                    teamFocusAreas: {
                      include: {
                        focusArea: true,
                      },
                    },
                    fundingStage: true,
                    technologies: true,
                    industryTags: true,
                    asks: true,
                  },
                },
              },
            },
            interactions: true,
            targetInteractions: true,
            eventGuests: true,
            experiences: true,
          },
        });

        // Get recommended member with full relations for LLM generation
        const recommendedMemberWithRelations = await this.prisma.member.findUnique({
          where: { uid: member.uid },
          include: {
            teamMemberRoles: {
              include: {
                team: {
                  include: {
                    teamFocusAreas: {
                      include: {
                        focusArea: true,
                      },
                    },
                    fundingStage: true,
                    technologies: true,
                    industryTags: true,
                    asks: true,
                  },
                },
              },
            },
            interactions: true,
            targetInteractions: true,
            eventGuests: true,
            experiences: true,
          },
        });

        // Generate LLM-based recommendation reason
        let reason = 'Based on your profile and activity in the network';
        if (targetMemberWithRelations && recommendedMemberWithRelations) {
          reason = await this.huskyGenerationService.generateRecommendationReason(
            targetMemberWithRelations as MemberWithRelations,
            recommendedMemberWithRelations as MemberWithRelations,
            rec.factors as unknown as RecommendationFactors
          );
        }

        return {
          name: member.name,
          image: member.image?.url || '',
          team_description:
            sanitizedTeamDescription.length > 500
              ? sanitizedTeamDescription.substring(0, 500) + '...'
              : sanitizedTeamDescription,
          team_name: team?.name || '',
          team_logo: team?.logo?.url || '',
          position: primaryRole?.role || '',
          link: `${process.env.WEB_UI_BASE_URL}/members/${
            member.uid
          }?utm_source=${utmSource}&utm_medium=email&utm_code=${getRandomId()}&target_uid=${
            targetMember.uid
          }&target_email=${encodeURIComponent(targetMember.email || '')}`,
          reason: reason,
        };
      })
    );

    return {
      name: targetMember.name,
      link: `${
        process.env.WEB_UI_BASE_URL
      }/settings/recommendations?utm_source=${utmSource}&utm_medium=email&utm_code=${getRandomId()}&target_uid=${
        targetMember.uid
      }&target_email=${encodeURIComponent(targetMember.email || '')}`,
      user_email_frequency_preference: 'twice per month',
      feedback_link: `${
        process.env.WEB_UI_BASE_URL
      }/feedback?utm_source=${utmSource}&utm_medium=email&utm_code=${getRandomId()}&target_uid=${
        targetMember.uid
      }&target_email=${encodeURIComponent(targetMember.email || '')}`,
      recommendations: recommendations,
      footer_text:
        new Date(targetMember.createdAt) < new Date('2025-07-17T00:00:00Z')
          ? 'You received this email because you are a member of the PL network'
          : 'You received this email because you opted in for Recommendations when signing up on LabOS',
    };
  }

  private async sendRecommendationEmail(emailData: any, toEmail: string, subject: string): Promise<void> {
    const result = await this.awsService.sendEmailWithTemplate(
      path.join(__dirname, '/shared/recommendedMembers.hbs'),
      emailData,
      '',
      subject,
      process.env.SES_SOURCE_EMAIL || '',
      [toEmail],
      [],
      this.supportEmail
    );

    this.logger.info(`Recommendations email sent to ${toEmail} ref: ${result?.MessageId}`);
  }

  private async sendExampleRecommendationEmail(emailData: any, toEmail: string, subject: string): Promise<void> {
    const result = await this.awsService.sendEmailWithTemplate(
      path.join(__dirname, '/shared/recommendedMembersExample.hbs'),
      emailData,
      '',
      subject,
      process.env.SES_SOURCE_EMAIL || '',
      [toEmail],
      [],
      this.supportEmail
    );

    this.logger.info(`Example recommendations email sent to ${toEmail} ref: ${result?.MessageId}`);
  }

  private async generateRecommendations(
    targetMemberUid: string,
    count: number,
    existingRecommendationUids: string[] = [],
    allMembers?: MemberWithRelations[],
    isExample = false
  ): Promise<{ memberUid: string; score: number; factors: RecommendationFactors }[]> {
    const engine = new RecommendationsEngine();

    if (!allMembers) {
      const chunkSize = 500;

      this.logger.info('Loading members in chunks...');
      allMembers = await this.loadRecommendationMembersInChunks(chunkSize);
      this.logger.info(`Loaded ${allMembers.length} members`);
    }

    const targetMemberWithRelations = allMembers.find((member) => member.uid === targetMemberUid);
    if (!targetMemberWithRelations) {
      throw new NotFoundException('Target member not found with relations');
    }

    // Find members that were already sent in recommendation notifications
    const [existingNotificationMembers, notificationSetting] = await Promise.all([
      this.prisma.recommendationNotification.findMany({
        where: {
          targetMemberUid: targetMemberUid,
        },
        include: {
          recommendations: {
            include: {
              recommendedMember: true,
            },
          },
        },
      }),
      this.prisma.notificationSetting.findUnique({
        where: {
          memberUid: targetMemberUid,
        },
      }),
    ]);

    const alreadyRecommendedMemberUids = existingNotificationMembers
      .flatMap((notification) => notification.recommendations)
      .map((recommendation) => recommendation.recommendedMemberUid);

    const recommendations = engine.getRecommendations(
      targetMemberWithRelations,
      allMembers,
      {
        skipMemberIds: [...existingRecommendationUids, ...alreadyRecommendedMemberUids],
        skipTeamNames: ['Protocol Labs', 'Polaris Labs'],
        skipIndustryTags: ['Discontinued'],
        includeFocusAreas: false,
        includeRoles: true,
        includeFundingStages: true,
        includeIndustryTags: false,
        includeTechnologies: true,
        includeKeywords: true,
        minScore: isExample ? 0 : 15,
      },
      notificationSetting ?? undefined
    );

    const selectedRecommendations = recommendations
      .sort((a, b) => {
        if (a.score === b.score) {
          return Math.random() - 0.5;
        }
        return b.score - a.score;
      })
      .slice(0, count);

    return selectedRecommendations.map((rec) => ({
      memberUid: rec.member.uid,
      score: rec.score,
      factors: rec.factors,
    }));
  }

  public async loadRecommendationMembersInChunks(
    chunkSize: number,
    where?: Prisma.MemberWhereInput
  ): Promise<MemberWithRelations[]> {
    const allMembers: MemberWithRelations[] = [];
    let skip = 0;
    let hasMore = true;

    const allTeams = await this.prisma.team.findMany({
      include: {
        teamFocusAreas: {
          include: {
            focusArea: true,
          },
        },
        fundingStage: true,
        technologies: true,
        industryTags: true,
        asks: true,
      },
    });

    while (hasMore) {
      const members = await this.prisma.member.findMany({
        where: {
          ...where,
          accessLevel: {
            notIn: ['L0', 'L1', 'Rejected'],
          },
        },
        skip,
        take: chunkSize,
        include: {
          teamMemberRoles: true,
          experiences: true,
          interactions: true,
          targetInteractions: true,
          eventGuests: true,
        },
      });

      if (members.length === 0) {
        hasMore = false;
      } else {
        allMembers.push(...(members as unknown as MemberWithRelations[]));
        skip += chunkSize;
      }
    }

    return allMembers.map((member) => ({
      ...member,
      teamMemberRoles: member.teamMemberRoles.map((role) => ({
        ...role,
        team: allTeams.find((team) => team.uid === role.teamUid),
      })),
    })) as MemberWithRelations[];
  }

  async getRecommendationNotifications(targetMemberUid?: string) {
    return this.prisma.recommendationNotification.findMany({
      where: {
        ...(targetMemberUid && { targetMemberUid }),
      },
      include: {
        targetMember: true,
        recommendations: {
          include: {
            recommendedMember: true,
          },
        },
        recommendationRun: true,
      },
      orderBy: {
        sentAt: 'desc',
      },
      take: 100,
    });
  }

  async getMembersWithEnabledRecommendations() {
    return this.prisma.member.findMany({
      where: {
        accessLevel: {
          notIn: ['L0', 'L1', 'Rejected'],
        },
        notificationSetting: {
          subscribed: true,
        },
      },
      include: {
        notificationSetting: true,
        image: true,
        teamMemberRoles: {
          include: {
            team: {
              include: {
                logo: true,
              },
            },
          },
        },
        recommendationRunsAsTarget: {
          include: {
            emailNotifications: true,
            recommendations: {
              include: {
                recommendedMember: true,
              },
            },
          },
          orderBy: {
            createdAt: 'desc',
          },
        },
      },
    });
  }

  async getUniqueRoles(): Promise<string[]> {
    const result = await this.prisma.$queryRaw<Array<{ role: string }>>`
      SELECT DISTINCT role
      FROM "TeamMemberRole"
      WHERE role IS NOT NULL AND role != ''
      ORDER BY role
    `;

    const roles = result.map((row) => row.role);
    const normalizedMap = new Map<string, string>();

    // Group roles by their normalized version, keeping the shortest original
    for (const role of roles) {
      const normalized = this.normalizeRole(role);
      // Skip roles that don't have actual words (like "--")
      if (normalized && normalized.replace(/[^a-zA-Z0-9]/g, '').length > 0) {
        if (!normalizedMap.has(normalized) || role.length < normalizedMap.get(normalized)!.length) {
          normalizedMap.set(normalized, role);
        }
      }
    }

    return Array.from(normalizedMap.values()).sort();
  }

  /**
   * Generate and send recommendations for a specific member
   */
  async generateAndSendRecommendationsForMember(
    memberUid: string,
    allMembers: MemberWithRelations[],
    emailSubject = 'Your Recommendations from PL Network',
    isExample = false
  ) {
    const member = await this.prisma.member.findUnique({
      where: { uid: memberUid },
      include: {
        notificationSetting: true,
      },
    });

    if (!member) {
      return;
    }

    // Check if member has recommendations enabled
    if (!member.notificationSetting?.subscribed) {
      return;
    }

    // For non-example recommendations, check if member has notification settings configured
    if (!isExample && !this.hasNotificationSettings(member)) {
      return;
    }

    const createDto: CreateRecommendationRunRequest = {
      targetMemberUid: member.uid,
    };

    const recommendationRun = await this.createRecommendationRun(createDto, allMembers, isExample);

    if (recommendationRun.recommendations.length > 0) {
      await this.sendRecommendations(recommendationRun.uid, {
        approvedRecommendationUids: recommendationRun.recommendations.map((r) => r.uid),
        email: member.email ?? undefined,
        emailSubject,
        isExample,
      });
    }

    return recommendationRun;
  }

  /**
   * Check if a member has notification settings configured
   */
  hasNotificationSettings(member: any): boolean {
    return !!(
      member.notificationSetting?.focusAreaList?.length > 0 ||
      member.notificationSetting?.fundingStageList?.length > 0 ||
      member.notificationSetting?.roleList?.length > 0 ||
      member.notificationSetting?.technologyList?.length > 0 ||
      member.notificationSetting?.industryTagList?.length > 0 ||
      member.notificationSetting?.keywordList?.length > 0
    );
  }

  /**
   * Check if a member has ever received real (non-example) recommendations
   */
  async hasReceivedRealRecommendations(memberUid: string): Promise<boolean> {
    const existingRecommendation = await this.prisma.recommendationNotification.findFirst({
      where: {
        targetMemberUid: memberUid,
        isExample: false,
      },
    });

    return !!existingRecommendation;
  }

  /**
   * Triggers recommendations for a specific member by UID
   */
  async triggerRecommendationForMember(memberUid: string) {
    if (!this.isRecommendationsEnabled) {
      this.logger.info('Skipping recommendation generation as it is disabled');
      return;
    }

    this.logger.info(`Triggering recommendation for member ${memberUid}`);

    try {
      const allMembers = await this.loadRecommendationMembersInChunks(500);
      const recommendationRun = await this.generateAndSendRecommendationsForMember(memberUid, allMembers);

      if (recommendationRun) {
        this.logger.info(`Successfully sent recommendation for member ${memberUid}`);
      } else {
        this.logger.info(`No recommendations sent for member ${memberUid}`);
      }
    } catch (error) {
      this.logger.error(`Failed to send recommendation for member ${memberUid}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Checks if a member has never received real (not example) recommendations and triggers them if needed
   */
  async triggerRecommendationForMemberIfNeverReceived(memberUid: string) {
    if (!this.isRecommendationsEnabled) {
      this.logger.info('Skipping recommendation generation as it is disabled');
      return;
    }

    this.logger.info(`Checking if member ${memberUid} has never received real recommendations`);

    try {
      const hasReceived = await this.hasReceivedRealRecommendations(memberUid);

      if (hasReceived) {
        this.logger.info(`Member ${memberUid} has already received real recommendations`);
        return;
      }

      this.logger.info(`Member ${memberUid} has never received real recommendations, triggering now`);
      await this.triggerRecommendationForMember(memberUid);
    } catch (error) {
      this.logger.error(`Failed to check/trigger recommendation for member ${memberUid}: ${error.message}`);
      throw error;
    }
  }

  private getSupportEmail(): string | undefined {
    const supportEmails = process.env.SUPPORT_EMAILS?.split(',') ?? [];
    if (isEmails(supportEmails)) {
      return supportEmails[0];
    }
  }

  private normalizeRole(role: string): string {
    return (
      role
        .toLowerCase()
        .trim()
        // Replace multiple spaces with single space
        .replace(/\s+/g, ' ')
        // Replace common separators with comma
        .replace(/[&,]/g, ',')
        // Replace dashes with comma
        .replace(/\s*-\s*/g, ',')
        // Replace "and" with comma
        .replace(/\s+and\s+/g, ',')
        // Remove extra commas and spaces
        .replace(/,\s*,/g, ',')
        .replace(/^,|,$/g, '')
        .trim()
    );
  }
}
