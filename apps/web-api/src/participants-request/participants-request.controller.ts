/* eslint-disable prettier/prettier */
import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  InternalServerErrorException,
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
  @UseGuards(UserTokenValidation)
  async addRequest(@Body() body, @Req() req) {
    const postData = body;
    const participantType = body.participantType;
    const referenceUid = body.referenceUid;

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
      const requestorDetails = await this.participantsRequestService.findMemberByExternalId(req.userExternaId);
      if(!requestorDetails) {
        throw new UnauthorizedException()
      }
      if(!requestorDetails.isDirectoryAdmin && (referenceUid !== requestorDetails.uid)) {
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
    let result;
    if(referenceUid && participantType === ParticipantType.MEMBER.toString()){
      result = await this.participantsRequestService.addRequest(postData, true);
      if (result?.uid) {
        result = await this.participantsRequestService.processMemberEditRequest(
          result.uid,
          true,  // disable the notification 
          true // enable the auto approval
        );
      } else {
        throw new InternalServerErrorException();
      }
    }
    else{
      result = await this.participantsRequestService.addRequest(postData);
    }
    return result;
  }
}
