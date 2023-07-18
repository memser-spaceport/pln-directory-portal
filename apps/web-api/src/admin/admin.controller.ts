/* eslint-disable prettier/prettier */
import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApprovalStatus, ParticipantType } from '@prisma/client';

import { NoCache } from '../decorators/no-cache.decorator';
import { ParticipantsRequestService } from '../participants-request/participants-request.service';
import {
  ParticipantProcessRequestSchema,
  ParticipantRequestMemberSchema,
  ParticipantRequestTeamSchema,
} from 'libs/contracts/src/schema/participants-request';
import { AdminAuthGuard } from '../guards/admin-auth.guard';
import { AdminService } from './admin.service';
@Controller('v1/admin')
export class AdminController {
  constructor(
    private readonly participantsRequestService: ParticipantsRequestService,
    private readonly adminService: AdminService
  ) {}

  @Post('signin')
  async signIn(@Body() body) {
    return await this.adminService.signIn(body.username, body.password);
  }

  @Get('participants')
  @NoCache()
  @UseGuards(AdminAuthGuard)
  async findAll(@Query() query) {
    const result = await this.participantsRequestService.getAll(query);
    return result;
  }

  @Get('participants/:uid')
  @NoCache()
  @UseGuards(AdminAuthGuard)
  async findOne(@Param() params) {
    const result = await this.participantsRequestService.getByUid(params.uid);
    return result;
  }

  @Post('participants')
  @UseGuards(AdminAuthGuard)
  // @UseGuards(GoogleRecaptchaGuard)
  async addRequest(@Body() body) {
    const postData = body;
    const participantType = body.participantType;
    // delete postData.captchaToken;

    if (
      participantType === ParticipantType.MEMBER.toString() &&
      !ParticipantRequestMemberSchema.safeParse(postData).success
    ) {
      throw new ForbiddenException();
    } else if (
      participantType === ParticipantType.TEAM.toString() &&
      !ParticipantRequestTeamSchema.safeParse(postData).success
    ) {
      throw new ForbiddenException();
    } else if (
      participantType !== ParticipantType.TEAM.toString() &&
      participantType !== ParticipantType.MEMBER.toString()
    ) {
      throw new ForbiddenException();
    }

    const result = await this.participantsRequestService.addRequest(postData);
    return result;
  }

  @Put('participants/:uid')
  @UseGuards(AdminAuthGuard)
  //@UseGuards(GoogleRecaptchaGuard)
  async updateRequest(@Body() body, @Param() params) {
    const postData = body;
    const participantType = body.participantType;

    if (
      participantType === ParticipantType.MEMBER.toString() &&
      !ParticipantRequestMemberSchema.safeParse(postData).success
    ) {
      throw new ForbiddenException();
    } else if (
      participantType === ParticipantType.TEAM.toString() &&
      !ParticipantRequestTeamSchema.safeParse(postData).success
    ) {
      throw new ForbiddenException();
    } else if (
      participantType !== ParticipantType.TEAM.toString() &&
      participantType !== ParticipantType.MEMBER.toString()
    ) {
      throw new ForbiddenException();
    }
    const result = await this.participantsRequestService.updateRequest(
      postData,
      params.uid
    );
    return result;
  }

  @Patch('participants/:uid')
  // @UseGuards(GoogleRecaptchaGuard)
  @UseGuards(AdminAuthGuard)
  async processRequest(@Body() body, @Param() params) {
    const validation = ParticipantProcessRequestSchema.safeParse(body);
    if (!validation.success) {
      throw new ForbiddenException();
    }
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
    else if (
      participantType === 'TEAM' &&
      statusToProcess === ApprovalStatus.APPROVED.toString() &&
      !referenceUid
    ) {
      result = await this.participantsRequestService.processTeamCreateRequest(
        uid
      );
    }
    // Process approval for create Member
    else if (
      participantType === 'MEMBER' &&
      statusToProcess === ApprovalStatus.APPROVED.toString() &&
      !referenceUid
    ) {
      result = await this.participantsRequestService.processMemberCreateRequest(
        uid
      );
    }
    // Process approval for Edit Team
    else if (
      participantType === 'TEAM' &&
      statusToProcess === ApprovalStatus.APPROVED.toString() &&
      referenceUid
    ) {
      result = await this.participantsRequestService.processTeamEditRequest(
        uid
      );
    }
    // Process approval for Edit Member
    else if (
      participantType === 'MEMBER' &&
      statusToProcess === ApprovalStatus.APPROVED.toString() &&
      referenceUid
    ) {
      result = await this.participantsRequestService.processMemberEditRequest(
        uid
      );
    }
    return result;
  }
}
