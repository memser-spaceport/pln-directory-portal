import { Body, Controller, Post, Res, UsePipes } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ZodValidationPipe } from '@abitia/zod-dto';
import { HuskyService } from './husky.service';
import {
  HuskyChatDto,
  HuskyChatSchema,
  HuskyFeedbackDto,
  HuskyFeedbackSchema,
} from '../../../../libs/contracts/src/schema/husky-chat';
import { Response } from 'express';
import { HuskyAiService } from './husky-ai.service';
import { ApiBodyFromZod } from '../decorators/api-body-from-zod';

@ApiTags('Husky')
@Controller()
export class HuskyChatsController {
  constructor(private huskyService: HuskyService, private huskyAiService: HuskyAiService) {}

  @ApiBodyFromZod(HuskyChatSchema)
  @Post('v1/husky/chat/contextual')
  @UsePipes(ZodValidationPipe)
  async huskyChatAssistant(@Body() body: HuskyChatDto, @Res() res: Response) {
    const aiStreamingResponse = await this.huskyAiService.createContextualResponse({ ...body });
    aiStreamingResponse.pipeTextStreamToResponse(res);
    return;
  }

  @ApiBodyFromZod(HuskyFeedbackSchema)
  @UsePipes(ZodValidationPipe)
  @Post('v1/husky/chat/feedback')
  async huskyChatFeedback(@Body() body: HuskyFeedbackDto) {
    await this.huskyService.addHuskyFeedback({ ...body });
  }
}
