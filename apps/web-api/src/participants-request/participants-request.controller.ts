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
}
