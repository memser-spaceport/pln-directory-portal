import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Put,
  Query,
  UseGuards,
  UsePipes,
  BadRequestException,
  NotFoundException,
  Post
} from '@nestjs/common';
import { NoCache } from '../decorators/no-cache.decorator';
import { ParticipantsRequestService } from '../participants-request/participants-request.service';
import { AdminAuthGuard } from '../guards/admin-auth.guard';
import { ParticipantsReqValidationPipe } from '../pipes/participant-request-validation.pipe';
import { ProcessBulkParticipantRequest, ProcessParticipantReqDto } from 'libs/contracts/src/schema';
import { ApprovalStatus, ParticipantsRequest, ParticipantType } from '@prisma/client';

@Controller('v1/admin/participants-request')
@UseGuards(AdminAuthGuard)
export class AdminParticipantsRequestController {
  constructor(
    private readonly participantsRequestService: ParticipantsRequestService
  ) { }

  /**
   * Process (approve/reject) multiple pending participants requests.
   * @param body - The request body containing array of uids and status of participants to be processed;
   * @returns The result of processing the participants request
   */
  @Post('/')
  async processBulkRequest(
    @Body() body: ProcessBulkParticipantRequest[]
  ): Promise<any> {
    const participationRequests = body;
    return await this.participantsRequestService.processBulkRequest(participationRequests);
  }

  /**
   * Retrieve all participants requests based on query parameters.
   * @param query - Filter parameters for participants requests
   * @returns A list of participants requests
   */
  @Get("/")
  @NoCache()
  async findAll(@Query() query) {
    return this.participantsRequestService.getAll(query);
  }

  /**
   * Retrieve a single participants request by its UID.
   * @param uid - The unique identifier of the participants request
   * @returns The participants request entry matching the UID
   */
  @Get("/:uid")
  @NoCache()
  async findOne(@Param('uid') uid: string) {
    return await this.participantsRequestService.findOneByUid(uid);
  }

  /**
   * Update an existing participants request by its UID.
   * @param body - The updated data for the participants request
   * @param uid - The unique identifier of the participants request
   * @returns The updated participants request entry
   */
  @Put('/:uid')
  @UsePipes(new ParticipantsReqValidationPipe())
  async updateRequest(
    @Body() body: any,
    @Param('uid') uid: string
  ) {
    return await this.participantsRequestService.updateByUid(uid, body);
  }

  /**
   * Process (approve/reject) a pending participants request.
   * @param body - The request body containing the status for processing (e.g., approve/reject)
   * @param uid - The unique identifier of the participants request
   * @returns The result of processing the participants request
   */
  @Patch('/:uid')
  async processRequest(
    @Param('uid') uid: string,
    @Body() body: ProcessParticipantReqDto
  ): Promise<any> {
    const participantRequest: ParticipantsRequest | null = await this.participantsRequestService.findOneByUid(uid);
    if (!participantRequest) {
      throw new NotFoundException('Request not found');
    }
    if (participantRequest.status !== ApprovalStatus.PENDING) {
      throw new BadRequestException(
        `Request cannot be processed. It has already been ${participantRequest.status.toLowerCase()}.`
      );
    }
    if (participantRequest.participantType === ParticipantType.TEAM && !participantRequest.requesterEmailId) {
      throw new BadRequestException(
        'Requester email is required for team participation requests. Please provide a valid email address.'
      );
    }
    return await this.participantsRequestService.processRequestByUid(uid, participantRequest, body.status, body.isVerified);
  }

}
