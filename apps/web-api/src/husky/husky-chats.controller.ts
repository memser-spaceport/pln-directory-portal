import { Body, Controller, Post, Req, Res, UseGuards } from '@nestjs/common';
import { HuskyService } from './husky.service';
import { HuskyChatDto, HuskyFeedbackDto } from '../../../../libs/contracts/src/schema/husky-chat';
import { Response } from 'express';
import { HuskyAiService } from './husky-ai.service';
import { UserTokenCheckGuard } from '../guards/user-token-check.guard';

@Controller()
export class HuskyChatsController {
  constructor(private huskyService: HuskyService, private huskyAiService: HuskyAiService) {}

  @UseGuards(UserTokenCheckGuard)
  @Post('v1/husky/chat/contextual-tools')
  async huskyChatAssistantTools(@Body() body: HuskyChatDto, @Res() res: Response, @Req() req) {
    const stream = await this.huskyAiService.createContextualToolsResponse({ ...body }, !!req.userEmail);
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Transfer-Encoding', 'chunked');
    try {
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
    } catch (error) {
      // Headers (and possibly part of the answer) are already on the wire, so an
      // error response is impossible; aborting the connection lets the client
      // detect the failure instead of receiving a truncated JSON body.
      res.destroy(error);
    }
  }

  @Post('v1/husky/chat/feedback')
  async huskyChatFeedback(@Body() body: HuskyFeedbackDto) {
    await this.huskyService.addHuskyFeedback({ ...body });
  }
}
