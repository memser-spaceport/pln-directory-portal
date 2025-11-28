import { Body, Controller, Post } from '@nestjs/common';
import { ParticipantsRequestService } from './participants-request.service';

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
}
