/* eslint-disable prettier/prettier */
import { Body, Controller, Query, } from '@nestjs/common';
import { ApprovalStatus } from '@prisma/client';
import { Api, ApiDecorator, initNestServer } from '@ts-rest/nest';
import { ParticipantsRequestService } from './participants-request.service';
import { apiParticipantRequests } from '../../../../libs/contracts/src/lib/contract-participant-request';
import { ApiParam } from '@nestjs/swagger';

const server = initNestServer(apiParticipantRequests);
@Controller()
export class ParticipantsRequestController {
  constructor(
    private readonly participantsRequestService: ParticipantsRequestService
  ) {}

  @Api(server.route.getParticipantRequests)
  async findAll(@Query() query) {
    const result = await this.participantsRequestService.getAll(query);
    return result;
  }

  @Api(server.route.getParticipantRequest)
  @ApiParam({ name: 'uid', type: 'string' })
  async findOne(@ApiDecorator() { params: { uid } }) {
    const result = await this.participantsRequestService.getByUid(uid);
    return result;
  }

  @Api(server.route.addParticipantRequest)
  async addRequest(@Body() body) {
    const postData = body;
    const result = await this.participantsRequestService.addRequest(postData);
    return result;
  }

  @Api(server.route.updateParticipantRequest)
  @ApiParam({ name: 'uid', type: 'string' })
  async updateRequest(@Body() body, @ApiDecorator() { params: { uid } }) {
    const postData = body;
    const result = await this.participantsRequestService.updateRequest(
      postData,
      uid
    );
    return result;
  }

  @Api(server.route.processParticipantRequest)
  @ApiParam({ name: 'uid', type: 'string' })
  async processRequest(@Body() body, @ApiDecorator() { params: { uid } }): Promise<any> {
    const participantType = body.participantType;
    const referenceUid = body.referenceUid;
    const statusToProcess = body.status;
    let result;

    // Process reject
    if (statusToProcess === ApprovalStatus.REJECTED.toString()) {
      result = await this.participantsRequestService.processRejectRequest(uid);
    }
    // Process approval for create team
    else if (participantType === 'TEAM' && statusToProcess === ApprovalStatus.APPROVED.toString() && !referenceUid) {
      result = await this.participantsRequestService.processTeamCreateRequest(uid);
    }
    // Process approval for create Member
    else if (participantType === 'MEMBER' && statusToProcess === ApprovalStatus.APPROVED.toString() && !referenceUid) {
       console.log("in create member")
       result = await this.participantsRequestService.processMemberCreateRequest(uid);
    }
    // Process approval for Edit Team
    else if (participantType === 'TEAM' && statusToProcess === ApprovalStatus.APPROVED.toString() &&referenceUid) {
       result = await this.participantsRequestService.processTeamEditRequest(uid);
    }
    // Process approval for Edit Member
    else if (participantType === 'MEMBER' && statusToProcess === ApprovalStatus.APPROVED.toString() && referenceUid) {
      result = await this.participantsRequestService.processMemberEditRequest(uid);
    }
    return result;
  }
}