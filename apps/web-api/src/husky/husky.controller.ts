import { Body, Controller, Get, Param, Post, Res, UseGuards } from '@nestjs/common';
import { HuskyService } from './husky.service';
import { HuskyChatDto, HuskyFeedbackDto } from '../../../../libs/contracts/src/schema/husky-chat';
import { Response } from 'express';
import { HuskyAiService } from './husky-ai.service';
import { NoCache } from '../decorators/no-cache.decorator';

@Controller()
export class HuskyController {
  constructor(private huskyService: HuskyService, private huskyAiService: HuskyAiService) { }

  @Post('v1/husky/chat/assistant')
  async huskyChatAssistant(@Body() body: HuskyChatDto, @Res() res: Response) {
    const aiStreamingResponse = await this.huskyAiService.createStreamingChatResponse({ ...body });
    aiStreamingResponse.pipeTextStreamToResponse(res);
    return;
  }


  @Post('v1/husky/chat/contextual')
  async huskyChatAnswer(@Body() body: HuskyChatDto, @Res() res: Response) {
    const response = await this.huskyAiService.createContextualResponse({ ...body });
    response.pipeTextStreamToResponse(res);
    return;
  }

  @NoCache()
  @Get('v1/husky/chat/:uid/additional-info')
  async huskyChatAdditionalInfo(@Param('uid') uid) {
    return await this.huskyAiService.getChatAdditionalInfo(uid);
  }

  @Post('v1/husky/chat/analytical')
  async huskyChatAnalytical(@Body() body: HuskyChatDto) {
    return await this.huskyAiService.createAnalyticalResponse({ ...body });
  }
  
  @Post('v1/husky/chat/feedback')
  async huskyChatFeedback(@Body() body: HuskyFeedbackDto) {
    await this.huskyService.addHuskyFeedback({ ...body });
  }
}
