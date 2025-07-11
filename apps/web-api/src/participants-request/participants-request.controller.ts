import { Body, Controller, Get, Post, Query, UseGuards, UsePipes } from '@nestjs/common';
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
    private readonly memberService: MembersService
  ) {}

  /**
   * Add a new entry to the Participants request table.
   * @param body - The request data to be added to the participants request table.
   * @returns A promise with the participants request entry that was added.
   */
  @Post('/')
  @UsePipes(new ParticipantsReqValidationPipe())
  @UseGuards(UserAuthValidateGuard, AccessLevelsGuard)
  @AccessLevels(AccessLevel.L2, AccessLevel.L3, AccessLevel.L4)
  async addRequest(@Body() body) {
    const uniqueIdentifier = this.participantsRequestService.getUniqueIdentifier(body);
    // Validate unique identifier existence
    await this.participantsRequestService.validateUniqueIdentifier(body.participantType, uniqueIdentifier);
    await this.participantsRequestService.validateParticipantRequest(body);
    return await this.participantsRequestService.addRequest(body);
  }

  /**
   * Add a new entry to the Participants request table.
   * @param body - The request data to be added to the participants request table.
   * @returns A promise with the participants request entry that was added.
   */
  @Post('/member')
  @UsePipes(new ParticipantsReqValidationPipe())
  async addMemberRequest(@Body() body) {
    const uniqueIdentifier = this.participantsRequestService.getUniqueIdentifier(body);
    // Validate unique identifier existence
    await this.participantsRequestService.validateUniqueIdentifier(body.participantType, uniqueIdentifier);
    await this.participantsRequestService.validateParticipantRequest(body);

    // adding a member with L0 access level into the Member table
    // the addRequest method that adds data into the ParticipantsRequests table should be removed
    // when we are sure new RBAC system with L0, L1, L2, L3, L4 access levels is working
    // and there are no dependencies on ParticipantRequest table
    const member = await this.memberService.createMemberFromSignUpData(body.newData);

    return {
      uid: member.uid,
    };
  }

  /**
   * Check if the given identifier already exists in participants-request, members, or teams tables.
   * @param queryParams - The query parameters containing the identifier and its type.
   * @returns A promise indicating whether the identifier already exists.
   */
  @Get('/unique-identifier')
  async findMatchingIdentifier(@Query() queryParams: FindUniqueIdentiferDto) {
    return await this.participantsRequestService.checkIfIdentifierAlreadyExist(
      queryParams.type,
      queryParams.identifier
    );
  }
}
