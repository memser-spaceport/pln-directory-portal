import {Body, Controller, Get, Post, Query} from '@nestjs/common';
import { ParticipantsRequestService } from './participants-request.service';
import {FindUniqueIdentiferDto} from "@protocol-labs-network/contracts";

@Controller('v1/participants-request')
export class ParticipantsRequestController {
  constructor(private readonly participantsRequestService: ParticipantsRequestService) {}

  /**
   * New simplified flow:
   *  - validate body
   *  - create/reuse Member
   *  - create/reuse Team (if isTeamNew = true → new team with L0/L1)
   *  - attach member to team
   *
   * Old "participants_request" table and statuses are removed.
   */
  @Post('member')
  async createMemberParticipantRequest(@Body() body: any): Promise<any> {
    return this.participantsRequestService.handleMemberRequest(body);
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
