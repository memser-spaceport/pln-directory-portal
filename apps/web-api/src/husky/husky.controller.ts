import { Body, Controller, Get, Param, Post, Res, UseGuards } from '@nestjs/common';
import { HuskyService } from './husky.service';
import { HuskyChatDto, HuskyFeedbackDto } from '../../../../libs/contracts/src/schema/husky-chat';
import { Response } from 'express';
import { HuskyAiService } from './husky-ai.service';
import { NoCache } from '../decorators/no-cache.decorator';


@Controller()
export class HuskyController {
  constructor(private huskyService: HuskyService, private huskyAiService: HuskyAiService) { }

  @Post('v1/husky/threads/:uid/chats/:chatUid/assistant')
  async huskyChatAssistant(
    @Param('uid') threadUid: string,
    @Param('chatUid') chatUid: string,
    @Body() body: HuskyChatDto,
    @Res() res: Response
  ) {
    const aiStreamingResponse = await this.huskyAiService.createStreamingChatResponse({ ...body, threadUid, chatUid });
    aiStreamingResponse.pipeTextStreamToResponse(res);
    return;
  }


  @Post('v1/husky/threads/:uid/chats/:chatUid/contextual')
  async huskyChatAnswer(
    @Param('uid') threadUid: string,
    @Param('chatUid') chatUid: string,
    @Body() body: HuskyChatDto,
    @Res() res: Response
  ) {
    const response = await this.huskyAiService.createContextualResponse({ ...body, threadUid, chatUid })
    response.pipeTextStreamToResponse(res);
    return;
  }

  @NoCache()
  @Get('v1/husky/threads/:uid/chats/:chatUid/additional-info')
  async huskyChatAdditionalInfo(@Param('uid') threadId: string, @Param('chatUid') chatUid: string) {
    return await this.huskyAiService.getChatAdditionalInfo(threadId, chatUid);
  }

  @Post('v1/husky/threads/:uid/chats/:chatUid/analytical')
  async huskyChatAnalytical(
    @Param('uid') threadUid: string,
    @Param('chatUid') chatUid: string,
    @Body() body: HuskyChatDto
  ) {
    return await this.huskyAiService.createAnalyticalResponse({ ...body, threadUid, chatUid });
  }
  
  @Post('v1/husky/chat/feedback')
  async huskyChatFeedback(@Body() body: HuskyFeedbackDto) {
    await this.huskyService.addHuskyFeedback({ ...body });
  }

  @Post('v1/husky/threads/:uid')
  async huskyCreateThread(@Param('uid') threadUid: string) {
    return await this.huskyAiService.createThread(threadUid);
  }
}
