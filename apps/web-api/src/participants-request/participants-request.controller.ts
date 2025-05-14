import { Body, Controller, Get, Post, Query, UsePipes } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ParticipantsRequestService } from './participants-request.service';
import { NoCache } from '../decorators/no-cache.decorator';
import { ParticipantsReqValidationPipe } from '../pipes/participant-request-validation.pipe';
import { FindUniqueIdentiferDto } from 'libs/contracts/src/schema/participants-request';

@ApiTags('Participants Request')
@Controller('v1/participants-request')
@NoCache()
export class ParticipantsRequestController {
  constructor(
    private readonly participantsRequestService: ParticipantsRequestService
  ) {}

  /**
   * Add a new entry to the Participants request table.
   * @param body - The request data to be added to the participants request table.
   * @returns A promise with the participants request entry that was added.
   */
  @Post("/")
  @UsePipes(new ParticipantsReqValidationPipe())
  async addRequest(@Body() body) {
    const uniqueIdentifier = this.participantsRequestService.getUniqueIdentifier(body);
    // Validate unique identifier existence
    await this.participantsRequestService.validateUniqueIdentifier(body.participantType, uniqueIdentifier);
    await this.participantsRequestService.validateParticipantRequest(body);
    return await this.participantsRequestService.addRequest(body);
  }

  /**
   * Check if the given identifier already exists in participants-request, members, or teams tables.
   * @param queryParams - The query parameters containing the identifier and its type.
   * @returns A promise indicating whether the identifier already exists.
   */
  @Get("/unique-identifier")
  async findMatchingIdentifier(
    @Query() queryParams: FindUniqueIdentiferDto
  ) {
    return await this.participantsRequestService.checkIfIdentifierAlreadyExist(
      queryParams.type,
      queryParams.identifier
    );
  }
}
