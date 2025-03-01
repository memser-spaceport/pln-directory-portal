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

  @Post('v1/husky/chat/assistant')
  async huskyChatAssistant(@Body() body: HuskyChatDto, @Res() res: Response) {
    const aiStreamingResponse = await this.huskyAiService.createStreamingChatResponse({ ...body});
    aiStreamingResponse.pipeTextStreamToResponse(res);
    return;
  }


  @Post('v1/husky/chat/contextual')
  async huskyChatAnswer(@Body() body: HuskyChatDto, @Res() res: Response) {
    const response = await this.huskyAiService.createContextualResponse({ ...body})
    response.pipeTextStreamToResponse(res);
    return;
  }

  @NoCache()
  @Get('v1/husky/additional-info')
  async huskyChatAdditionalInfo(@Param('uid') threadId: string, @Param('chatUid') chatUid: string) {
    return await this.huskyAiService.getChatAdditionalInfo(threadId, chatUid);
  }

  @Post('v1/husky/chat/analytical')
  async huskyChatAnalytical(@Body() body: HuskyChatDto) {
    return await this.huskyAiService.createAnalyticalResponse({ ...body});
  }
  
  @Post('v1/husky/chat/feedback')
  async huskyChatFeedback(@Body() body: HuskyFeedbackDto) {
    await this.huskyService.addHuskyFeedback({ ...body });
  }

  @Post('v1/husky/threads/')
  async huskyCreateThreadTitle(@Body() body: { email: string; threadUid: string }) {
    return await this.huskyAiService.createThread(body.threadUid, body.email);
  }

  @Get('v1/husky/threads')
  @UseGuards(UserAccessTokenValidateGuard)
  async getThreadsByEmail(@Req() req, @Body() body: { email: string }) {
    const email = req.userEmail;
    if (email !== body.email) {
      throw new ForbiddenException('You are not authorized to access this thread');
    }
    return await this.huskyAiService.getThreadsByEmail(email);
  }

  @Get('v1/husky/threads/:uid')
  async getThreadById(@Param('uid') uid: string) {
    return await this.huskyAiService.getThreadById(uid);
  }
}
