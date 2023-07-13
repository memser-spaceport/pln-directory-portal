/* eslint-disable prettier/prettier */
import { Body, Controller, Post } from '@nestjs/common';
import { ParticipantsRequestService } from '../participants-request.service';

@Controller('v1/participants-request/unique-identifier')
export class UniqueIdentifier {
  constructor(
    private readonly participantsRequestService: ParticipantsRequestService
  ) {}

  @Post()
  async findDuplicates(@Body() body) {
    const result = await this.participantsRequestService.findDuplicates(
      body.uniqueIdentifier,
      body.participantType,
      body.uid,
      body.requestId
    );
    return result;
  }
}
