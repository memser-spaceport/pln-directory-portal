import { ForbiddenException, forwardRef, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Ask, AskStatus, Prisma } from '@prisma/client';
import DOMPurify from 'isomorphic-dompurify';
import { CreateAskDto, ResponseAskDto, ResponseAskWithRelationsDto } from 'libs/contracts/src/schema/ask';
import { PrismaService } from '../shared/prisma.service';
import { CacheService } from '../utils/cache/cache.service';
import { ForestAdminService } from '../utils/forest-admin/forest-admin.service';
import { ParticipantsRequestService } from '../participants-request/participants-request.service';
import { LogService } from '../shared/log.service';
import { TeamsService } from '../teams/teams.service';

@Injectable()
export class AskService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cacheService: CacheService,
    private readonly forestadminService: ForestAdminService,
    @Inject(forwardRef(() => TeamsService))
    private readonly teamsService: TeamsService,
    @Inject(forwardRef(() => ParticipantsRequestService))
    private readonly participantsRequestService: ParticipantsRequestService,
    private readonly logger: LogService
  ) {}

  formatAskFilterResponse(askTags: { tags: string[] }[]): { tag: string; count: number }[] {
    // Flatten the tags and calculate counts
    const tagCounts = askTags
      .flatMap((item) => item.tags) // Flatten the tags array
      .reduce((acc, tag) => {
        acc[tag] = (acc[tag] || 0) + 1; // Count occurrences
        return acc;
      }, {} as Record<string, number>);
    return Object.entries(tagCounts).map(([tag, count]) => ({ tag, count }));
  }

  async findOne(uid: string): Promise<ResponseAskWithRelationsDto> {
    try {
      const result = await this.prisma.ask.findUnique({
        where: { uid },
        include: {
          team: true,
          project: true,
          closedBy: true,
        },
      });

      if (!result) {
        throw new NotFoundException(`Ask with uid ${uid} not found`);
      }

      return result as unknown as ResponseAskWithRelationsDto;
    } catch (error) {
      this.logger.error(`Error fetching ask with uid ${uid}`, error);
      throw error;
    }
  }

  // Create a new ask for a team
  async createForTeam(teamUid: string, requesterEmailId: string, askData: CreateAskDto): Promise<ResponseAskDto> {
    await this.teamsService.isTeamMemberOrAdmin(requesterEmailId, teamUid);

    const team = await this.teamsService.findTeamByUid(teamUid);

    if (!team) {
      throw new NotFoundException('Team not found');
    }

    try {
      // Get existing asks related to teamuid for logging
      const teamAsks = await this.prisma.ask.findMany({
        where: { teamUid },
      });

      let createdAsk;

      await this.prisma.$transaction(async (tx) => {
        createdAsk = await tx.ask.create({
          data: {
            title: askData.title,
            description: DOMPurify.sanitize(askData.description),
            tags: askData.tags || [],
            teamUid: teamUid,
            status: AskStatus.OPEN,
          },
        });

        await this.logIntoParticipantRequest(tx, createdAsk, teamAsks, team.name, requesterEmailId);
      });

      await this.cacheService.reset({ service: 'teams' });

      await this.forestadminService.triggerAirtableSync();

      return createdAsk;
    } catch (error) {
      this.logger.error(`Error creating ask for team ${teamUid}`, error);
      throw error;
    }
  }

  async update(
    uid: string,
    requesterEmailId: string,
    askData: {
      title?: string;
      description?: string;
      tags?: string[];
      status?: AskStatus;
      closedReason?: string;
      closedComment?: string;
      closedByUid?: string;
    }
  ): Promise<ResponseAskDto> {
    try {
      const ask = await this.prisma.ask.findUnique({
        where: { uid },
      });

      if (!ask) {
        throw new NotFoundException(`Ask with uid ${uid} not found`);
      }

      if (ask.teamUid) {
        await this.teamsService.isTeamMemberOrAdmin(requesterEmailId, ask.teamUid);
      }

      if (ask.status === AskStatus.CLOSED) {
        throw new ForbiddenException('Cannot update a closed ask');
      }

      const updateData: Prisma.AskUpdateInput = {
        title: askData.title,
        description: askData.description ? DOMPurify.sanitize(askData.description) : undefined,
        tags: askData.tags,
        status: askData.status,
        closedReason: askData.closedReason,
        closedComment: askData.closedComment,
        closedBy: askData.closedByUid ? { connect: { uid: askData.closedByUid } } : undefined,
      };

      // Check if the ask is being closed
      if (askData.status === AskStatus.CLOSED) {
        updateData.closedAt = new Date();
      }

      let updatedAsk;

      // If this is a team ask, we need to handle team-specific logic
      if (ask.teamUid && requesterEmailId) {
        const team = await this.teamsService.findTeamByUid(ask.teamUid);
        // Get existing asks related to teamuid for logging
        const teamAsks = await this.prisma.ask.findMany({
          where: { teamUid: ask.teamUid },
        });

        await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
          updatedAsk = await tx.ask.update({
            where: { uid: ask.uid },
            data: updateData,
          });

          await this.logIntoParticipantRequest(tx, updatedAsk, teamAsks, team.name, requesterEmailId);
        });

        await this.cacheService.reset({ service: 'teams' });

        await this.forestadminService.triggerAirtableSync();
      } else {
        updatedAsk = await this.prisma.ask.update({
          where: { uid: ask.uid },
          data: updateData,
        });
      }

      return updatedAsk;
    } catch (error) {
      this.logger.error(`Error updating ask with uid ${uid}`, error);
      throw error;
    }
  }

  async delete(uid: string, requesterEmailId: string): Promise<void> {
    try {
      const ask = await this.prisma.ask.findUnique({
        where: { uid },
      });

      if (!ask) {
        throw new NotFoundException(`Ask with uid ${uid} not found`);
      }

      // If this is a team ask, we need to handle team-specific logic
      if (ask.teamUid) {
        await this.teamsService.isTeamMemberOrAdmin(requesterEmailId, ask.teamUid);

        const team = await this.teamsService.findTeamByUid(ask.teamUid);

        // Get existing asks related to teamuid for logging
        const teamAsks = await this.prisma.ask.findMany({
          where: { teamUid: ask.teamUid },
        });

        await this.prisma.$transaction(async (tx) => {
          await tx.ask.delete({
            where: { uid },
          });

          await this.logIntoParticipantRequest(tx, ask, teamAsks, team.name, requesterEmailId);
        });

        await this.cacheService.reset({ service: 'teams' });

        await this.forestadminService.triggerAirtableSync();
      } else {
        // For simpler deletions
        await this.prisma.ask.delete({
          where: { uid },
        });
      }
    } catch (error) {
      this.logger.error(`Error deleting ask with uid ${uid}`, error);
      throw error;
    }
  }

  async logIntoParticipantRequest(
    tx: Prisma.TransactionClient,
    ask: Ask,
    teamAsks: Ask[],
    teamName: string,
    requesterEmailId: string
  ) {
    const teamAsksAfter = await tx.ask.findMany({
      where: { teamUid: ask.teamUid },
    });

    await this.participantsRequestService.add(
      {
        status: 'AUTOAPPROVED',
        requesterEmailId,
        referenceUid: ask.teamUid,
        uniqueIdentifier: teamName,
        participantType: 'TEAM',
        newData: teamAsksAfter as any,
        oldData: teamAsks as any,
      },
      tx
    );
  }
}
