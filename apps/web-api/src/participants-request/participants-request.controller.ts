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
import { ParticipantsRequestService } from './participants-request.service';
import { GoogleRecaptchaGuard } from '../guards/google-recaptcha.guard';
import {
  ParticipantProcessRequestSchema,
  ParticipantRequestTeamSchema,
  ParticipantRequestMemberSchema,
} from '../../../../libs/contracts/src/schema/participants-request';
import { NoCache } from '../decorators/no-cache.decorator';
import { UserAuthValidateGuard } from '../guards/user-auth-validate.guard';
@Controller('v1/participants-request')
export class ParticipantsRequestController {
  constructor(
    private readonly participantsRequestService: ParticipantsRequestService
  ) {}

  @Get()
  @NoCache()
  async findAll(@Query() query) {
    console.log(query);
    const result = await this.participantsRequestService.getAll(query);
    return result;
  }

  @Get(':uid')
  @NoCache()
  async findOne(@Param() params) {
    const result = await this.participantsRequestService.getByUid(params.uid);
    return result;
  }

  @Post()
  // @UseGuards(GoogleRecaptchaGuard)
  //@UseGuards(GoogleRecaptchaGuard)
  @UseGuards(UserAuthValidateGuard)
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

  @Put(':uid')
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

  @Patch(':uid')
  // @UseGuards(GoogleRecaptchaGuard)
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
