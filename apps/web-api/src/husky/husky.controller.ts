import { Body, Controller, Post, Res, UseGuards } from '@nestjs/common';
import { HuskyService } from './husky.service';
import { HuskyChatDto, HuskyFeedbackDto } from '../../../../libs/contracts/src/schema/husky-chat';
import { Response } from 'express';
import { UserAccessTokenValidateGuard } from '../guards/user-access-token-validate.guard';
import { HuskyAiService } from './husky-ai.service';
@Controller()
export class HuskyController {
  constructor(private huskyService: HuskyService, private huskyAiService: HuskyAiService) {}

  @UseGuards(UserAccessTokenValidateGuard)
  @Post('v1/husky/chat/assistant')
  async huskyChatAssistant(@Body() body: HuskyChatDto, @Res() res: Response) {
    const { question, source, uid, chatSummary } = body;
    const aiStreamingResponse = await this.huskyAiService.createStreamingChatResponse(
      question,
      uid,
      chatSummary,
      source
    );
    aiStreamingResponse.pipeTextStreamToResponse(res);
    return;
  }

  @UseGuards(UserAccessTokenValidateGuard)
  @Post('v1/husky/chat/feedback')
  async huskyChatFeedback(@Body() body: HuskyFeedbackDto) {
    await this.huskyService.addHuskyFeedback({ ...body });
  }
}
