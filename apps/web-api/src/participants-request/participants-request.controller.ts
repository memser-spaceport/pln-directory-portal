/* eslint-disable prettier/prettier */
import {Body, Controller, Get, Param, Patch, Post,Put,Query, Req} from '@nestjs/common';
import { ApprovalStatus } from '@prisma/client';
import { query } from 'express';
import { ParticipantsRequestService } from './participants-request.service';
@Controller('participants-request')
export class ParticipantsRequestController {
  constructor(
    private readonly participantsRequestService: ParticipantsRequestService
  ) {}

  @Get()
  async findAll(@Query() query) {
    console.log(query);
    const result = await this.participantsRequestService.getAll(query);
    return result;
  }

  @Get(':uid')
  async findOne(@Param() params) {
    const result = await this.participantsRequestService.getByUid(params.uid);
    return result;
  }

  @Post()
  async addRequest(@Body() body) {
    const validationCheck = body.validationCheck;
    if(validationCheck) {
       const result = await this.participantsRequestService.findDuplicates(body.uniqueIdentifier, body.participantType)
       return result
      } else {
      const postData = body;
      const result = await this.participantsRequestService.addRequest(postData);
      return result;
    }

  }

  @Put(':uid')
  async updateRequest(@Body() body, @Param() params) {
    const postData = body;
    const result = await this.participantsRequestService.updateRequest(postData, params.uid);
    return result;
  }

  @Patch(':uid')
  async processRequest(@Body() body, @Param() params) {
    const uid = params.uid;
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
    else if (participantType === 'MEMBER'  && statusToProcess === ApprovalStatus.APPROVED.toString() && !referenceUid) {
      result = await this.participantsRequestService.processMemberCreateRequest(uid);
    }
    // Process approval for Edit Team
    else if (participantType === 'TEAM'  && statusToProcess === ApprovalStatus.APPROVED.toString() && referenceUid) {
      result = await this.participantsRequestService.processTeamEditRequest(uid);
    }
    // Process approval for Edit Member
    else if (participantType === 'MEMBER'  && statusToProcess === ApprovalStatus.APPROVED.toString() && referenceUid) {
      result = await this.participantsRequestService.processMemberEditRequest(uid);
    }
    return result;
  }
}
