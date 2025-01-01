import { Body, Controller, Post, Res, UseGuards } from '@nestjs/common';
import { HuskyService } from './husky.service';
import { HuskyChatDto, HuskyFeedbackDto } from '../../../../libs/contracts/src/schema/husky-chat';
import { Response } from 'express';
import { UserAccessTokenValidateGuard } from '../guards/user-access-token-validate.guard';
@Controller()
export class HuskyController {
  constructor(private huskyService: HuskyService) {}

  @UseGuards(UserAccessTokenValidateGuard)
  @Post('v1/husky/chat/assistant')
  async huskyChatAssistant(@Body() body: HuskyChatDto, @Res() res: Response) {
    const { question, uid, source } = body;
    const rephrasedQuestion = await this.huskyService.getRephrasedQuesBasedOnHistory(uid, question);
    const quesEmbedding = await this.huskyService.getEmbeddingForText(rephrasedQuestion);
    const [matchingDocs, actionDocs] = await Promise.all([
      this.huskyService.getMatchingEmbeddingsBySource(source, quesEmbedding),
      this.huskyService.getActionDocs(quesEmbedding),
    ]);

    const context = this.huskyService.createContextForMatchingDocs(matchingDocs);
    if (context === '') {
      this.huskyService.streamHuskyResponse(uid, question, rephrasedQuestion, res, null);
      return;
    }
    const chatHistory = await this.huskyService.getChatHistory(`${uid}:summary`);

    const prompt = this.huskyService.createPromptForHuskyChat(question, context, chatHistory || '', actionDocs);
    this.huskyService.streamHuskyResponse(uid, question, rephrasedQuestion, res, prompt);
  }

  @UseGuards(UserAccessTokenValidateGuard)
  @Post('v1/husky/chat/feedback') 
  async huskyChatFeedback(@Body() body: HuskyFeedbackDto) {
    await this.huskyService.updateFeedback({ ...body });
  }
}
