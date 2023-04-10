/* eslint-disable prettier/prettier */
import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
} from '@nestjs/common';
import { ApprovalStatus } from '@prisma/client';
import { query } from 'express';
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
      body.participantType
    );
    return result;
  }
}
