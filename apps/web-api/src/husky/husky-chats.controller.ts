import { Body, Controller, ForbiddenException, Get, Param, Post, Req, Res, UseGuards } from '@nestjs/common';
import { HuskyService } from './husky.service';
import { HuskyChatDto, HuskyFeedbackDto } from '../../../../libs/contracts/src/schema/husky-chat';
import { Response } from 'express';
import { HuskyAiService } from './husky-ai.service';


@Controller()
export class HuskyChatsController {
  constructor(private huskyService: HuskyService, private huskyAiService: HuskyAiService) {}

  @Post('v1/husky/chat/contextual-tools')
  async huskyChatAssistantTools(@Body() body: HuskyChatDto, @Res() res: Response) {
    const stream = await this.huskyAiService.createContextualToolsResponse({ ...body });
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Transfer-Encoding', 'chunked');
    await stream.pipeTo(
      new WritableStream({
        write(chunk) {
          res.write(chunk);
        },
        close() {
          res.end();
        },
      })
    );
  }

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
}
