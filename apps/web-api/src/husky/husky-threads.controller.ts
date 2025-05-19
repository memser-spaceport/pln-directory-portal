import { Controller, Get, Post, Param, Req, UseGuards, Body, Delete, UsePipes } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ZodValidationPipe } from '@abitia/zod-dto';
import { HuskyAiService } from './husky-ai.service';
import { NoCache } from '../decorators/no-cache.decorator';
import { UserAccessTokenValidateGuard } from '../guards/user-access-token-validate.guard';
import { UserTokenCheckGuard } from '../guards/user-token-check.guard';
import { ApiBodyFromZod } from '../decorators/api-body-from-zod';
import {
  CreateHuskyThreadDto,
  CreateHuskyThreadSchema,
  DuplicateThreadDto,
  DuplicateThreadSchema,
  UpdateThreadBasicInfoDto,
  UpdateThreadBasicInfoSchema,
} from '../../../../libs/contracts/src/schema/husky-threads';

@ApiTags('Husky')
@Controller('v1/husky/threads')
export class HuskyThreadsController {
  constructor(private huskyAiService: HuskyAiService) {}

  @UseGuards(UserAccessTokenValidateGuard)
  @ApiBearerAuth()
  @ApiBodyFromZod(CreateHuskyThreadSchema)
  @UsePipes(ZodValidationPipe)
  @Post()
  async createNewThread(@Body() body: CreateHuskyThreadDto, @Req() req) {
    return await this.huskyAiService.createThread(body.threadId, req?.userEmail);
  }

  @NoCache()
  @Get()
  @UseGuards(UserAccessTokenValidateGuard)
  @ApiBearerAuth()
  async getThreads(@Req() req) {
    return await this.huskyAiService.getThreadsByEmail(req?.userEmail);
  }

  @UseGuards(UserTokenCheckGuard)
  @NoCache()
  @Get(':threadId')
  @ApiBearerAuth()
  async getThreadById(@Param('threadId') threadId: string, @Req() req) {
    return await this.huskyAiService.getThreadById(threadId, req?.userEmail);
  }

  @UseGuards(UserTokenCheckGuard)
  @Post(':threadId')
  @ApiBearerAuth()
  @ApiBodyFromZod(DuplicateThreadSchema)
  @UsePipes(ZodValidationPipe)
  async duplicateThread(@Param('threadId') threadId: string, @Req() req, @Body() body: DuplicateThreadDto) {
    return await this.huskyAiService.duplicateThread(threadId, req?.userEmail, body?.guestUserId);
  }

  @UseGuards(UserAccessTokenValidateGuard)
  @Delete(':threadId')
  @ApiBearerAuth()
  async deleteThread(@Param('threadId') threadId: string, @Req() req) {
    return await this.huskyAiService.deleteThreadEmail(threadId, req?.userEmail);
  }

  @UseGuards(UserAccessTokenValidateGuard)
  @Post(':threadId/basic-info')
  @ApiBearerAuth()
  @ApiBodyFromZod(UpdateThreadBasicInfoSchema)
  @UsePipes(ZodValidationPipe)
  async updateThreadBasicInfo(@Body() body: UpdateThreadBasicInfoDto, @Param('threadId') threadId: string, @Req() req) {
    return await this.huskyAiService.createThreadBasicInfo(threadId, body.question, req?.userEmail);
  }
}
