import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
  UseGuards,
  UsePipes,
} from '@nestjs/common';
import { ParticipantsRequestService } from './participants-request.service';
import { NoCache } from '../decorators/no-cache.decorator';
import { ParticipantsReqValidationPipe } from '../pipes/participant-request-validation.pipe';
import { FindUniqueIdentiferDto } from '@protocol-labs-network/contracts';
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
   * Legacy participants-request endpoint in the NEW model.
   *
   * Behaviour:
   *  - validates the payload (pipe + service-level validation);
   *  - checks that the unique identifier (email / team name) is not already used
   *    in Member / Team tables;
   *  - does NOT create a record in the participants_request table anymore;
   *  - for status=PENDING, directly creates the underlying Member / Team
   *    (with L0 access level) using the new model;
   *  - returns a minimal result describing what was created.
   */
  @Post('/')
  @UsePipes(new ParticipantsReqValidationPipe())
  @UseGuards(UserAuthValidateGuard, AccessLevelsGuard)
  @AccessLevels(
    AccessLevel.L0,
    AccessLevel.L1,
    AccessLevel.L2,
    AccessLevel.L3,
    AccessLevel.L4,
    AccessLevel.L5,
    AccessLevel.L6,
  )
  async addRequest(@Body() body: any, @Req() request: Request) {
    // Derive unique identifier (team name or member email) from the payload
    const uniqueIdentifier =
      this.participantsRequestService.getUniqueIdentifier(body);

    // Ensure there is no existing entity with the same identifier
    await this.participantsRequestService.validateUniqueIdentifier(
      body.participantType,
      uniqueIdentifier,
    );

    // Perform additional semantic validation (location, requester email, etc.)
    await this.participantsRequestService.validateParticipantRequest(body);

    // Load the requester Member based on the authenticated user email
    const requesterUser = await this.membersService.findMemberByEmail(
      (request as any)['userEmail'],
    );

    // New flow: immediately create the underlying Member / Team
    // without storing anything in participants_request
    return this.participantsRequestService.processImmediateRequest(
      body,
      requesterUser,
    );
  }

  /**
   * New simplified entry point used by the sign-up flow:
   *  - validates and normalises the body;
   *  - reuses or creates a Member;
   *  - optionally reuses or creates a Team and attaches the Member to it.
   */
  @Post('/member')
  async createMemberParticipantRequest(@Body() body: any): Promise<any> {
    return this.participantsRequestService.handleMemberRequest(body);
  }

  /**
   * Check whether the given identifier already exists in Member / Team tables.
   * The participants_request table is no longer consulted here.
   */
  @Get('/unique-identifier')
  async findMatchingIdentifier(@Query() queryParams: FindUniqueIdentiferDto) {
    return this.participantsRequestService.checkIfIdentifierAlreadyExist(
      queryParams.type,
      queryParams.identifier,
    );
  }
}
