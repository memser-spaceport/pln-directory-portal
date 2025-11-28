import {
  BadRequestException,
  Injectable,
  Inject,
  forwardRef,
  ConflictException,
  NotFoundException
} from '@nestjs/common';
import { MembersService } from '../members/members.service';
import { LogService } from '../shared/log.service';
import {TeamsService} from "../teams/teams.service";
import {Prisma} from "@prisma/client";

@Injectable()
export class ParticipantsRequestService {
  constructor(
    @Inject(forwardRef(() => MembersService))
    private readonly membersService: MembersService,
    @Inject(forwardRef(() => TeamsService))
    private readonly teamsService: TeamsService,
    private readonly logger: LogService,
  ) {}

  /**
   * Validate and normalize body for /v1/participants-request/member
   */
  private validateMemberRequestBody(body: any): void {
    if (!body) {
      throw new BadRequestException('Request body is required');
    }

    const newData = body.newData || {};

    const email =
      newData.email ||
      body.email ||
      null;

    if (!email) {
      throw new BadRequestException('newData.email (or email) is required for member request');
    }

    if (body.isTeamNew) {
      const team = body.team || {};
      const teamName =
        team.name ||
        newData.teamTitle ||
        null;

      if (!teamName) {
        throw new BadRequestException(
          'team.name (or newData.teamTitle) is required when isTeamNew = true',
        );
      }
    }
  }

  /**
   * Handle member participant request in the NEW model:
   *  - no "participants_request" table
   *  - no statuses
   *  - directly create/reuse Member and Team, then attach relation
   */
  async handleMemberRequest(body: any): Promise<any> {
    this.logger.info(
      '[ParticipantsRequestService.handleMemberRequest] Incoming body=' + JSON.stringify(body),
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

  /**
   * Check if any entry exists in the participants-request table and the members/teams table
   * for the given identifier.
   *
   * @param type - The participant type (either TEAM or MEMBER)
   * @param identifier - The unique identifier (team name or member email)
   * @returns A promise that resolves with an object containing flags indicating whether a request is pending and whether the identifier exists
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
