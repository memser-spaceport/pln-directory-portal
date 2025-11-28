import {
  BadRequestException,
  Injectable,
  Inject,
  forwardRef,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { MembersService } from '../members/members.service';
import { LogService } from '../shared/log.service';
import { TeamsService } from '../teams/teams.service';
import { Prisma } from '@prisma/client';
import { LocationTransferService } from '../utils/location-transfer/location-transfer.service';

type ParticipantTypeString = 'MEMBER' | 'TEAM';

@Injectable()
export class ParticipantsRequestService {
  constructor(
    @Inject(forwardRef(() => MembersService))
    private readonly membersService: MembersService,
    @Inject(forwardRef(() => TeamsService))
    private readonly teamsService: TeamsService,
    private readonly logger: LogService,
    private readonly locationTransferService: LocationTransferService,
  ) {}

  /**
   * Basic validation and normalization for /v1/participants-request/member payload.
   */
  private validateMemberRequestBody(body: any): void {
    if (!body) {
      throw new BadRequestException('Request body is required');
    }

    const newData = body.newData || {};
    const email = newData.email || body.email || null;

    if (!email) {
      throw new BadRequestException(
        'newData.email (or email) is required for member request',
      );
    }

    if (body.isTeamNew) {
      const team = body.team || {};
      const teamName = team.name || newData.teamTitle || null;

      if (!teamName) {
        throw new BadRequestException(
          'team.name (or newData.teamTitle) is required when isTeamNew = true',
        );
      }
    }
  }

  /**
   * New simplified flow for /v1/participants-request/member:
   *  - validate body
   *  - create/reuse Member
   *  - create/reuse Team (if isTeamNew = true)
   *  - attach member to team
   */
  async handleMemberRequest(body: any): Promise<any> {
    this.logger.info(
      '[ParticipantsRequestService.handleMemberRequest] Incoming body=' +
      JSON.stringify(body),
    );

    this.validateMemberRequestBody(body);

    const newData = body.newData || {};
    const opts: any = {
      role: body.role || null,
      isTeamNew: body.isTeamNew === true,
      requestorEmail: (newData && newData.email) || body.email || null,
      team: null,
      website: null,
    };

    if (body.team) {
      opts.team = {
        uid: body.team.uid,
        name: body.team.name,
        website: body.team.website,
      };
    }

    if (!opts.team && body.website) {
      opts.website = body.website;
    }

    const result = await this.membersService.createMemberAndAttach(newData, opts);

    this.logger.info(
      '[ParticipantsRequestService.handleMemberRequest] Created/updated member uid=' +
      result.uid,
    );

    return result;
  }

  // ---------------------------------------------------------------------------
  // Legacy /v1/participants-request endpoint in the NEW model (no participants_request table)
  // ---------------------------------------------------------------------------

  /**
   * Extract unique identifier based on participant type.
   * For TEAM -> newData.name, for MEMBER -> newData.email (lowercased and trimmed).
   */
  getUniqueIdentifier(requestData: any): string {
    if (requestData.participantType === 'TEAM') {
      return requestData.newData.name;
    }
    return requestData.newData.email?.toLowerCase().trim();
  }

  /**
   * Validate that the unique identifier does not already exist in Member / Team tables.
   * The participants_request table is no longer used here.
   */
  async validateUniqueIdentifier(
    participantType: ParticipantTypeString,
    uniqueIdentifier: string,
  ): Promise<void> {
    const { isRequestPending, isUniqueIdentifierExist } =
      await this.checkIfIdentifierAlreadyExist(participantType, uniqueIdentifier);

    // isRequestPending is always false in the new model,
    // because we do not store pending requests anymore.
    if (isRequestPending || isUniqueIdentifierExist) {
      const typeLabel = participantType === 'TEAM' ? 'Team name' : 'Member email';
      throw new BadRequestException(`${typeLabel} already exists`);
    }
  }

  /**
   * Validate location (for MEMBER) and requesterEmailId (for TEAM).
   */
  async validateParticipantRequest(requestData: any): Promise<void> {
    if (requestData.participantType === 'MEMBER') {
      await this.validateLocation(requestData.newData);
    }

    if (requestData.participantType === 'TEAM' && !requestData.requesterEmailId) {
      throw new BadRequestException(
        'Requester email is required for team participation requests. Please provide a valid email address.',
      );
    }
  }

  /**
   * Validate location data using LocationTransferService (if city/country/region is provided).
   */
  async validateLocation(data: any): Promise<void> {
    const { city, country, region } = data;
    if (city || country || region) {
      const result: any = await this.locationTransferService.fetchLocation(
        city,
        country,
        null,
        region,
        null,
      );
      if (!result || !result?.location) {
        throw new BadRequestException('Invalid location information');
      }
    }
  }

  /**
   * Process "legacy" participants request:
   *  - we do NOT create a row in participants_request
   *  - if status = PENDING → we directly create Member/Team with accessLevel = L0
   */
  async processImmediateRequest(
    requestData: any,
    requesterUser?: any,
  ): Promise<any> {
    this.logger.info(
      '[ParticipantsRequestService.processImmediateRequest] Incoming body=' +
      JSON.stringify(requestData),
    );

    if (requestData.status && requestData.status !== 'PENDING') {
      throw new BadRequestException(
        'Only PENDING status is supported in the new model',
      );
    }

    const participantType = requestData.participantType as ParticipantTypeString;

    if (participantType === 'MEMBER') {
      // This mirrors the old /member flow:
      // create a Member with L0 access level from sign-up data.
      const member = await this.membersService.createMemberFromSignUpData(
        requestData.newData,
      );

      this.logger.info(
        `[ParticipantsRequestService.processImmediateRequest] Created member uid=${member.uid} from legacy request`,
      );

      return {
        type: 'MEMBER',
        uid: member.uid,
      };
    }

    if (participantType === 'TEAM') {
      // New flow for TEAM:
      // we create a Team with accessLevel = L0 and optionally attach the requester as a team member.
      const createdTeam = await this.teamsService.createTeamFromLegacyRequest(
        {
          newData: requestData.newData,
          requesterEmailId: requestData.requesterEmailId,
        },
        requesterUser,
      );

      this.logger.info(
        `[ParticipantsRequestService.processImmediateRequest] Created team uid=${createdTeam.uid} from legacy request`,
      );

      return {
        type: 'TEAM',
        uid: createdTeam.uid,
      };
    }

    throw new BadRequestException(
      `Unsupported participantType: ${participantType}`,
    );
  }

  /**
   * Check if identifier already exists in Members / Teams.
   * In the new model we do NOT look at participants_request anymore.
   */
  async checkIfIdentifierAlreadyExist(
    type:   "MEMBER" | "TEAM",
    identifier: string
  ): Promise<{
    isRequestPending: boolean;
    isUniqueIdentifierExist: boolean;
  }> {
    try {
      const existingEntry =
        type === 'TEAM'
          ? await this.teamsService.findTeamByName(identifier)
          : await this.membersService.findMemberByEmail(identifier);
      if (existingEntry) {
        return {isRequestPending: false, isUniqueIdentifierExist: true};
      }
      return {isRequestPending: false, isUniqueIdentifierExist: false};
    } catch (err) {
      if (err instanceof Prisma.NotFoundError) {
        return {isRequestPending: false, isUniqueIdentifierExist: false};
      }
      return this.handleErrors(err);
    }
  }

  /**
   * Handles database-related errors specifically for the Participant entity.
   * Logs the error and throws an appropriate HTTP exception based on the error type.
   *
   * @param {any} error - The error object thrown by Prisma or other services.
   * @param {string} [message] - An optional message to provide additional context,
   *                             such as the participant UID when an entity is not found.
   * @throws {ConflictException} - If there's a unique key constraint violation.
   * @throws {BadRequestException} - If there's a foreign key constraint violation or validation error.
   * @throws {NotFoundException} - If a participant is not found with the provided UID.
   * Handle member participant request in the NEW model:
   *  - no "participants_request" table
   *  - no statuses
   *  - directly create/reuse Member and Team, then attach relation
   */
  private handleErrors(error, message?: string) {
    this.logger.error(error);
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      switch (error?.code) {
        case 'P2002':
          throw new ConflictException('Unique key constraint error on Participant:', error.message);
        case 'P2003':
          throw new BadRequestException('Foreign key constraint error on Participant', error.message);
        case 'P2025':
          throw new NotFoundException('Participant not found with uid: ' + message);
        default:
          throw error;
      }
    } else if (error instanceof Prisma.PrismaClientValidationError) {
      throw new BadRequestException('Database field validation error on Participant', error.message);
    } else {
      throw error;
    }
    // TODO: Remove this return statement if future versions allow all error-returning functions to be inferred correctly.
    return error;
  }
}
