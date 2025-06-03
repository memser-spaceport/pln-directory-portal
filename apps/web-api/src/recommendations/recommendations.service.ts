import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { ApprovalStatus, Prisma, RecommendationRunStatus, Team, TeamFocusArea } from '@prisma/client';
import { PrismaService } from '../shared/prisma.service';
import { LogService } from '../shared/log.service';
import { RecommendationsEngine, MemberWithRelations, RecommendationFactors } from './recommendations.engine';
import {
  CreateRecommendationRunRequest,
  GenerateMoreRecommendationsRequest,
  UpdateRecommendationRunStatusRequest,
  SendRecommendationsRequest,
} from 'libs/contracts/src/schema/recommendations';

@Injectable()
export class RecommendationsService {
  constructor(private prisma: PrismaService, private logger: LogService) {}

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

    if (recommendationRun.status !== RecommendationRunStatus.OPEN) {
      throw new BadRequestException('Can only generate more recommendations for OPEN runs');
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

  async getRecommendationRuns(targetMemberUid?: string, status?: string) {
    return this.prisma.recommendationRun.findMany({
      where: {
        ...(targetMemberUid && { targetMemberUid }),
        ...(status && { status: status as RecommendationRunStatus }),
      },
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

  async deleteRecommendationRun(uid: string) {
    const run = await this.prisma.recommendationRun.findUnique({
      where: { uid },
    });

    if (!run) {
      throw new NotFoundException('Recommendation run not found');
    }

    await this.prisma.recommendationRun.delete({
      where: { uid },
    });

    return { success: true };
  }

  async sendRecommendations(uid: string, sendDto: SendRecommendationsRequest) {
    const run = await this.prisma.recommendationRun.findUnique({
      where: { uid },
      include: {
        recommendations: true,
      },
    });

    if (!run) {
      throw new NotFoundException('Recommendation run not found');
    }

    if (run.status !== RecommendationRunStatus.OPEN) {
      throw new BadRequestException('Can only send recommendations for OPEN runs');
    }

    // Update the status of approved recommendations
    if (sendDto.approvedRecommendationUids) {
      await this.prisma.recommendation.updateMany({
        where: {
          recommendationRunUid: uid,
          uid: { in: sendDto.approvedRecommendationUids },
        },
        data: { status: ApprovalStatus.APPROVED },
      });
    }

    // Update the run status to SENT
    return this.prisma.recommendationRun.update({
      where: { uid },
      data: { status: RecommendationRunStatus.SENT },
      include: {
        recommendations: {
          include: {
            recommendedMember: true,
          },
        },
      },
    });
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
}
