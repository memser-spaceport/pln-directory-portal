import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
  UseGuards,
  UsePipes,
  BadRequestException,
} from '@nestjs/common';
import { Request } from 'express';
import { ParticipantsRequestService } from './participants-request.service';
import { NoCache } from '../decorators/no-cache.decorator';
import { ParticipantsReqValidationPipe } from '../pipes/participant-request-validation.pipe';
import { FindUniqueIdentiferDto } from 'libs/contracts/src/schema/participants-request';
import { MembersService } from '../members/members.service';
import { UserAuthValidateGuard } from '../guards/user-auth-validate.guard';
import { AccessLevelsGuard } from '../guards/access-levels.guard';
import { AccessLevels } from '../decorators/access-levels.decorator';
import { AccessLevel } from '../../../../libs/contracts/src/schema/admin-member';

@Controller('v1/participants-request')
@NoCache()
export class ParticipantsRequestController {
  constructor(
    private readonly participantsRequestService: ParticipantsRequestService,
    private readonly membersService: MembersService,
  ) {}

  /**
   * Legacy endpoint used by the frontend to "create a participant request".
   * Old behavior:
   *   - saved a pending record into participantsRequest table
   *   - waited for manual approval/rejection
   *
   * New behavior:
   *   - immediately creates MEMBER or TEAM entity (no PENDING state)
   *   - keeps the same request payload contract for backward compatibility
   */
  @Post('/')
  @UsePipes(new ParticipantsReqValidationPipe())
  @UseGuards(UserAuthValidateGuard, AccessLevelsGuard)
  @AccessLevels(
    AccessLevel.L2,
    AccessLevel.L3,
    AccessLevel.L4,
    AccessLevel.L5,
    AccessLevel.L6,
  )
  async addRequest(@Body() body: any, @Req() request: Request) {
    // 1. Derive unique identifier (team name or member email)
    const uniqueIdentifier =
      this.participantsRequestService.getUniqueIdentifier(body);

    // 2. Validate that such team/member does not already exist
    await this.participantsRequestService.validateUniqueIdentifier(
      body.participantType,
      uniqueIdentifier,
    );

    // 3. Validate payload-specific rules (location, requester email, etc.)
    await this.participantsRequestService.validateParticipantRequest(body);

    // 4. Resolve requester email (from body or from authenticated user)
    const requesterEmail =
      body.requesterEmailId ||
      body.newData?.requestorEmail ||
      (request as any)['userEmail'];

    if (!requesterEmail) {
      throw new BadRequestException('Requester email is missing.');
    }

    // 5. Load requester user (needed to attach them to the Team as a member)
    const requesterUser = await this.membersService.findMemberByEmail(
      requesterEmail,
    );

    // 6. Delegate into service, which now directly creates MEMBER or TEAM
    return this.participantsRequestService.addRequest(body, requesterUser);
  }

  /**
   * Endpoint for creating a MEMBER directly.
   * This was already bypassing the participantsRequest table
   * and can be kept mostly as-is.
   */
  @Post('/member')
  @UsePipes(new ParticipantsReqValidationPipe())
  async addMemberRequest(@Body() body: any) {
    const uniqueIdentifier =
      this.participantsRequestService.getUniqueIdentifier(body);

    // Validate uniqueness for member email
    await this.participantsRequestService.validateUniqueIdentifier(
      body.participantType,
      uniqueIdentifier,
    );

    // Validate payload (location, etc.)
    await this.participantsRequestService.validateParticipantRequest(body);

    // Create member and attach to team if provided
    const result = await this.membersService.createMemberAndAttach(
      body.newData,
      {
        role: body.role,
        team: body.team,
        isTeamNew: body.isTeamNew,
        website:
          typeof body.team === 'object' && body.team?.website
            ? body.team.website
            : body.website,
        requestorEmail: body?.newData?.email || body?.email || undefined,
      },
    );

    return result;
  }

  /**
   * Legacy endpoint used by frontend to check whether an identifier already exists.
   * Now:
   *   - checks only live Members/Teams
   *   - isRequestPending is always false (no pending requests anymore)
   */
  @Get('/unique-identifier')
  async findMatchingIdentifier(@Query() queryParams: FindUniqueIdentiferDto) {
    const type =
      queryParams.type === 'TEAM'
        ? ('TEAM' as const)
        : ('MEMBER' as const);

    return this.participantsRequestService.checkIfIdentifierAlreadyExist(
      type,
      queryParams.identifier,
    );
  }
}
