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

    // Update the chat summary if it is provided
    const { question, uid, source, chatSummary } = body;
    if (chatSummary) {
      await this.huskyService.updateChatSummary(uid, chatSummary);
    }

    // Rephrase the question and get the matching documents to create context
    const rephrasedQuestion = await this.huskyService.getRephrasedQuesBasedOnHistory(uid, question);
    const quesEmbedding = await this.huskyService.getEmbeddingForText(rephrasedQuestion);
    const [matchingDocs, actionDocs] = await Promise.all([
      this.huskyService.getMatchingEmbeddingsBySource(source, quesEmbedding),
      this.huskyService.getActionDocs(quesEmbedding),
    ]);
    const context = this.huskyService.createContextForMatchingDocs(matchingDocs);

    // Handle the case when there is no context
    if (context === '') {
      this.huskyService.streamHuskyResponse(uid, question, rephrasedQuestion, res, null);
      return;
    }

    // Create prompt and stream the response
    const chatSummaryFromDb = await this.huskyService.getChatSummary(uid);
    const prompt = this.huskyService.createPromptForHuskyChat(question, context, chatSummaryFromDb || '', actionDocs);
    this.huskyService.streamHuskyResponse(uid, question, rephrasedQuestion, res, prompt);
  }

  @UseGuards(UserAccessTokenValidateGuard)
  @Post('v1/husky/chat/feedback')
  async huskyChatFeedback(@Body() body: HuskyFeedbackDto) {
    await this.huskyService.updateFeedback({ ...body });
  }
}
