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
  UnauthorizedException,
  BadRequestException,
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
import { UserTokenValidation } from '../guards/user-token-validation.guard';
@Controller('v1/participants-request')
export class ParticipantsRequestController {
  constructor(
    private readonly participantsRequestService: ParticipantsRequestService
  ) {}

  @Get()
  @NoCache()
  async findAll(@Query() query) {
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
  @UseGuards(UserTokenValidation)
  async addRequest(@Body() body, @Req() req) {
    const postData = body;
    const participantType = body.participantType;
    const referenceUid = body.referenceUid;ParticipantProcessRequestSchema

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

    if(referenceUid) {
      const requestorDetails = await this.participantsRequestService.findMemberByEmail(req.userEmail);
      if(!requestorDetails) {
        throw new UnauthorizedException()
      }
      if(!requestorDetails.isDirectoryAdmin && (referenceUid !== requestorDetails.uid)) {
        console.log(requestorDetails, 'in edit exception')
        throw new ForbiddenException()
      }
    }
    const checkDuplicate = await this.participantsRequestService.findDuplicates(
      postData?.uniqueIdentifier,
      participantType,
      referenceUid,
      ''
    );
    if (
      checkDuplicate &&
      (checkDuplicate.isUniqueIdentifierExist ||
        checkDuplicate.isRequestPending)
    ) {
      const text =
        participantType === ParticipantType.MEMBER
          ? 'Member email'
          : 'Team name';
      throw new BadRequestException(`${text} already exists`);
    }

    const result = await this.participantsRequestService.addRequest(postData);
    return result;
  }
}
