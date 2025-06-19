import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { ApprovalStatus, Member, Prisma, RecommendationRunStatus } from '@prisma/client';
import sanitizeHtml from 'sanitize-html';
import { PrismaService } from '../shared/prisma.service';
import { LogService } from '../shared/log.service';
import { RecommendationsEngine, MemberWithRelations, RecommendationFactors } from './recommendations.engine';
import { AwsService } from '../utils/aws/aws.service';
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
  private supportEmail: string | undefined;

  constructor(private prisma: PrismaService, private logger: LogService, private awsService: AwsService) {
    this.supportEmail = this.getSupportEmail();
  }

  async createRecommendationRun(createDto: CreateRecommendationRunRequest) {
    const targetMember = await this.prisma.member.findUnique({
      where: { uid: createDto.targetMemberUid },
    });

    if (!targetMember) {
      throw new NotFoundException('Target member not found');
    }

    const recommendations = await this.generateRecommendations(targetMember.uid, 5);

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
    const count = 5 - activeRecommendations.length;

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

    const emailData = await this.prepareEmailTemplateData(run.targetMember, approvedRecommendations);

    const toEmail = sendDto.email || run.targetMember.email;
    if (!toEmail) {
      throw new BadRequestException('No email address available to send recommendations');
    }

    await this.sendRecommendationEmail(emailData, toEmail, sendDto.emailSubject);

    await this.prisma.recommendationNotification.create({
      data: {
        recommendationRunUid: uid,
        targetMemberUid: run.targetMemberUid,
        email: toEmail,
        subject: sendDto.emailSubject,
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
    >
  ): Promise<{
    name: string;
    user_email_frequency_preference: string;
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
  }> {
    const recommendations = approvedRecommendations.map((rec) => {
      const member = rec.recommendedMember;
      const primaryRole = member.teamMemberRoles[0];
      const team = primaryRole?.team;
      const sanitizedTeamDescription = sanitizeHtml(team?.shortDescription || '', {
        allowedTags: [],
        allowedAttributes: [],
      });

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
        }?utm_source=recommendations&utm_medium=email&utm_code=${getRandomId()}&target_uid=${
          targetMember.uid
        }&target_email=${encodeURIComponent(targetMember.email || '')}`,
        reason: this.generateRecommendationReason(rec.factors),
      };
    });

    return {
      name: targetMember.name,
      user_email_frequency_preference: '',
      recommendations: recommendations,
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
      this.supportEmail,
      true
    );

    this.logger.info(`Recommendations email sent to ${toEmail} ref: ${result?.MessageId}`);
  }

  private async generateRecommendations(
    targetMemberUid: string,
    count: number,
    existingRecommendationUids: string[] = []
  ): Promise<{ memberUid: string; score: number; factors: RecommendationFactors }[]> {
    const engine = new RecommendationsEngine();
    const chunkSize = 500;

    this.logger.info('Loading members in chunks...');
    const allMembers = await this.loadMembersInChunks(chunkSize);
    this.logger.info(`Loaded ${allMembers.length} members`);

    const targetMemberWithRelations = allMembers.find((member) => member.uid === targetMemberUid);
    if (!targetMemberWithRelations) {
      throw new NotFoundException('Target member not found with relations');
    }

    const recommendations = engine.getRecommendations(targetMemberWithRelations, allMembers, {
      skipMemberIds: existingRecommendationUids,
      skipTeamNames: ['Protocol Labs', 'Polaris Labs'],
      skipIndustryTags: ['Discontinued'],
      includeFocusAreas: true,
      includeRoles: true,
      includeFundingStages: true,
    });

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

  private async loadMembersInChunks(
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
      },
    });

    while (hasMore) {
      const members = await this.prisma.member.findMany({
        where,
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

  private generateRecommendationReason(factors): string {
    const reasons: string[] = [];

    // Build focus area reason with examples
    if (factors.teamFocusArea) {
      const focusAreaReason = factors.matchedFocusAreas?.length
        ? `focused on similar problem areas such as: ${factors.matchedFocusAreas.join(', ')}`
        : 'focused on similar problem areas';
      reasons.push(focusAreaReason);
    }

    // Build funding stage reason
    if (factors.teamFundingStage) {
      reasons.push('at similar funding stages');
    }

    // Build technology reason with examples
    if (factors.teamTechnology) {
      const techReason = factors.matchedTechnologies?.length
        ? `working with similar technologies like: ${factors.matchedTechnologies.join(', ')}`
        : 'working with similar technologies';
      reasons.push(techReason);
    }

    if (reasons.length === 0) {
      return 'Based on your profile and activity in the network';
    }

    // Join all reasons with appropriate conjunctions
    const lastReason = reasons.pop();
    return reasons.length > 0 ? `You are both ${reasons.join(', ')} and ${lastReason}` : `You are both ${lastReason}`;
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
        notificationSetting: {
          recommendationsEnabled: true,
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

  private getSupportEmail(): string | undefined {
    const supportEmails = process.env.SUPPORT_EMAILS?.split(',') ?? [];
    if (isEmails(supportEmails)) {
      return supportEmails[0];
    }
  }
}
