import {
  BadRequestException,
  Injectable,
  forwardRef,
  Inject,
} from '@nestjs/common';

import { LogService } from '../shared/log.service';
import { PrismaService } from '../shared/prisma.service';
import { MembersService } from '../members/members.service';
import { TeamsService } from '../teams/teams.service';
import { NotificationService } from '../utils/notification/notification.service';
import { LocationTransferService } from '../utils/location-transfer/location-transfer.service';
import { CacheService } from '../utils/cache/cache.service';

type ParticipantKind = 'MEMBER' | 'TEAM';

@Injectable()
export class ParticipantsRequestService {
  constructor(
    private prisma: PrismaService,
    private logger: LogService,
    private locationTransferService: LocationTransferService,
    private notificationService: NotificationService,
    private cacheService: CacheService,

    @Inject(forwardRef(() => MembersService))
    private membersService: MembersService,

    @Inject(forwardRef(() => TeamsService))
    private teamsService: TeamsService,
  ) {}

  /**
   * Extracts a unique identifier:
   * - TEAM → team name
   * - MEMBER → email (lowercased)
   */
  getUniqueIdentifier(requestData: any): string {
    return requestData.participantType === 'TEAM'
      ? requestData.newData.name
      : requestData.newData.email?.toLowerCase().trim();
  }

  /**
   * Validates uniqueness based on Members or Teams.
   * There is no pending state or request table anymore.
   */
  async validateUniqueIdentifier(
    participantType: ParticipantKind,
    uniqueIdentifier: string
  ): Promise<void> {
    if (participantType === 'TEAM') {
      const existing = await this.teamsService.findTeamByName(uniqueIdentifier);
      if (existing) throw new BadRequestException('Team name already exists.');
      return;
    }

    if (participantType === 'MEMBER') {
      const existing = await this.membersService.findMemberByEmail(uniqueIdentifier);
      if (existing) throw new BadRequestException('Member email already exists.');
      return;
    }

    throw new BadRequestException('Invalid participantType.');
  }

  /**
   * Used by frontend legacy endpoint `/unique-identifier`.
   * Always returns isRequestPending=false since we no longer support PENDING workflows.
   */
  async checkIfIdentifierAlreadyExist(
    participantType: ParticipantKind,
    identifier: string
  ): Promise<{ isRequestPending: boolean; isUniqueIdentifierExist: boolean }> {
    let exists = false;

    if (participantType === 'TEAM') {
      exists = !!(await this.teamsService.findTeamByName(identifier));
    } else {
      exists = !!(await this.membersService.findMemberByEmail(identifier));
    }

    return { isRequestPending: false, isUniqueIdentifierExist: exists };
  }

  /**
   * Validates optional location for MEMBERS only.
   */
  async validateLocation(data: any): Promise<void> {
    const { city, country, region } = data;
    if (city || country || region) {
      const result = await this.locationTransferService.fetchLocation(
        city, country, null, region, null
      );

      if (!result?.location) {
        throw new BadRequestException('Invalid location data.');
      }
    }
  }

  /**
   * Validates input payload before creation.
   */
  async validateParticipantRequest(requestData: any): Promise<void> {
    if (requestData.participantType === 'MEMBER') {
      await this.validateLocation(requestData.newData);
    }

    if (requestData.participantType === 'TEAM' && !requestData.requesterEmailId && !requestData.newData?.requestorEmail) {
      throw new BadRequestException(
        'Requester email is required when creating a Team.'
      );
    }
  }

  /**
   * Main handler.
   * Old behavior: saved request → waited for approval → created entity.
   * New behavior: request directly creates MEMBER or TEAM instantly.
   */
  async addRequest(
    requestData: any,
    requesterUser?: any,
    disableNotification = false
  ): Promise<any> {
    const participantType: ParticipantKind = requestData.participantType;

    // MEMBER FLOW
    if (participantType === 'MEMBER') {
      const result = await this.membersService.createMemberAndAttach(requestData.newData, {
        role: requestData.role,
        team: requestData.team,
        isTeamNew: requestData.isTeamNew,
        website:
          typeof requestData.team === 'object' && requestData.team?.website
            ? requestData.team.website
            : requestData.website,
        requestorEmail: requestData?.newData?.email,
      });

      if (!disableNotification) {
        const memberName = requestData.newData?.name || requesterUser?.name || requesterUser?.email;
        await this.notificationService.notifyForCreateMember(memberName, result.uid);
        this.logger.info(`MEMBER created: ${result.uid}`);
      }

      await this.resetCache();
      return result;
    }

    // TEAM FLOW
    if (participantType === 'TEAM') {
      const requesterEmail =
        requestData.requesterEmailId ||
        requestData.newData?.requestorEmail ||
        requesterUser?.email;

      if (!requesterEmail) {
        throw new BadRequestException('Requester email missing.');
      }

      const role = requestData.newData?.role || requestData.role || 'Lead';
      const investmentTeam = requestData.newData?.investmentTeam || false;

      const createdTeam = await this.prisma.$transaction(async (tx) => {
        const team = await this.teamsService.createTeamFromParticipantsRequest({
          ...requestData,
          requesterEmailId: requesterEmail,
        }, tx);

        if (requesterUser?.uid) {
          await tx.teamMemberRole.create({
            data: {
              teamUid: team.uid,
              memberUid: requesterUser.uid,
              role,
              teamLead: true,
              investmentTeam,
            },
          });
        }

        return team;
      });

      if (!disableNotification) {
        await this.notificationService.notifyForCreateTeam(createdTeam.name, createdTeam.uid);
        this.logger.info(`TEAM created: ${createdTeam.uid}`);
      }

      await this.resetCache();
      return createdTeam;
    }

    throw new BadRequestException('Unsupported participantType.');
  }

  private async resetCache() {
    try {
      await this.cacheService.reset({ service: 'participants-requests' });
      this.logger.info('Cache reset: participants-requests.');
    } catch (err) {
      this.logger.error('Cache reset failed:', err);
    }
  }
}
