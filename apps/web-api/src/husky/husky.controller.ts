import { Body, Controller, ForbiddenException, Get, Param, Post, Req, Res, UseGuards } from '@nestjs/common';
import { HuskyService } from './husky.service';
import { HuskyChatDto, HuskyFeedbackDto } from '../../../../libs/contracts/src/schema/husky-chat';
import { Response } from 'express';
import { HuskyAiService } from './husky-ai.service';
import { NoCache } from '../decorators/no-cache.decorator';
import { UserAccessTokenValidateGuard } from '../guards/user-access-token-validate.guard';


@Controller()
export class HuskyController {
  constructor(private huskyService: HuskyService, private huskyAiService: HuskyAiService) { }

  @Post('v1/husky/chat/contextual')
  async huskyChatAssistant(@Body() body: HuskyChatDto, @Res() res: Response) {
    const aiStreamingResponse = await this.huskyAiService.createContextualResponse({ ...body});
    aiStreamingResponse.pipeTextStreamToResponse(res);
    return;
  }
  
  @Post('v1/husky/chat/feedback')
  async huskyChatFeedback(@Body() body: HuskyFeedbackDto) {
    await this.huskyService.addHuskyFeedback({ ...body });
  }

  @UseGuards(UserAccessTokenValidateGuard)
  @Post('v1/husky/threads')
  async createNewThread(@Body() body: { threadId: string}, @Req() req) {
    return await this.huskyAiService.createThread(body.threadId, req?.userEmail, req?.userUid);
  }

  @UseGuards(UserAccessTokenValidateGuard)
  @Post('v1/husky/threads/:threadId/title')
  async updateThreadTitle(@Body() body: { question: string}, @Param('threadId') threadId: string, @Req() req) {
    return await this.huskyAiService.createThreadTitle(threadId, body.question);
  }

  @NoCache()
  @Get('v1/husky/threads')
  @UseGuards(UserAccessTokenValidateGuard)
  async getThreadsByEmail(@Req() req) {
    return await this.huskyAiService.getThreadsByUserId(req?.userUid);
  }

  @NoCache()
  @Get('v1/husky/threads/:threadId/chats')
  async getChatsByThreadId(@Param('threadId') threadId: string) {
    return await this.huskyAiService.getChatsByThreadId(threadId);
  }
}
