import { Injectable } from '@nestjs/common';
import { QdrantVectorDbService } from './db/qdrant-vector-db.service';
import { RedisCacheDbService } from './db/redis-cache-db.service';
import { MongoPersistantDbService } from './db/mongo-persistant-db.service';
import { LogService } from '../shared/log.service';
import { embed, generateText, streamObject } from 'ai';
import { openai } from '@ai-sdk/openai';
import { HuskyResponseSchema } from 'libs/contracts/src/schema/husky-chat';
import {
  aiPromptTemplate,
  chatSummaryTemplate,
  chatSummaryWithHistoryTemplate,
  HUSKY_ACTION_TYPES,
  HUSKY_NO_INFO_PROMPT,
  HUSKY_SOURCES,
  rephraseQuestionTemplate,
} from '../utils/constants';
import { Response } from 'express';
import Handlebars from 'handlebars';

@Injectable()
export class HuskyAiService {
  constructor(
    private logger: LogService,
    private huskyVectorDbService: QdrantVectorDbService,
    private huskyCacheDbService: RedisCacheDbService,
    private huskyPersistentDbService: MongoPersistantDbService
  ) {}

  async createStreamingChatResponse(question: string, uid: string, chatSummary: any, source: string) {
    // Update the chat summary if it is provided
    if (chatSummary) {
      await this.updateChatSummary(uid, chatSummary);
    }

    // Rephrase the question and get the matching documents to create context
    const rephrasedQuestion = await this.getRephrasedQuestionBasedOnHistory(uid, question);
    const questionEmbedding = await this.getEmbeddingForText(rephrasedQuestion);
    const [matchingDocs, actionDocs] = await Promise.all([
      this.getMatchingEmbeddingsBySource(source, questionEmbedding),
      this.getActionDocs(questionEmbedding),
    ]);
    const context = this.createContextForMatchingDocs(matchingDocs);

    // Handle the case when there is no context
    if (context === '') {
      return streamObject({
        model: openai(process.env.OPENAI_LLM_MODEL || ''),
        schema: HuskyResponseSchema,
        prompt: HUSKY_NO_INFO_PROMPT,
        onFinish: async (response) => {
          await this.persistChatHistory(uid, question, rephrasedQuestion, response?.object?.content);
        },
      });
    }

    // If Context is valid, then create prompt and stream the response
    const chatSummaryFromDb = await this.huskyCacheDbService.get(`${uid}:summary`);
    const prompt = this.createPromptForHuskyChat(question, context, chatSummaryFromDb || '', actionDocs);
    return streamObject({
      model: openai(process.env.OPENAI_LLM_MODEL || ''),
      schema: HuskyResponseSchema,
      prompt: prompt || HUSKY_NO_INFO_PROMPT,
      onFinish: async (response) => {
        if (prompt) {
          await this.updateChatSummary(uid, { user: question, system: response?.object?.content });
        }
        await this.persistChatHistory(uid, question, rephrasedQuestion, response?.object?.content);
      },
    });
  }

  async persistChatHistory(uid: string, prompt: string, rephrasedPrompt: string, response: any) {
    await this.huskyPersistentDbService.create(process.env.MONGO_CONVERSATION_COLLECTION || '', {
      chatThreadId: uid,
      prompt,
      rephrasedPrompt,
      response: response || '',
      createdAt: Date.now(),
    });
  }

  async getEmbeddingForText(text: string) {
    const embeddingModel = openai.embedding(process.env.OPENAI_EMBEDDING_MODEL || '');
    const { embedding } = await embed({
      model: embeddingModel,
      value: text,
    });
    return embedding;
  }

  async getRephrasedQuestionBasedOnHistory(chatId: string, question: string) {
    const chatHistory = await this.huskyCacheDbService.get(`${chatId}:summary`);

    if (chatHistory) {
      const aiPrompt = Handlebars.compile(rephraseQuestionTemplate)({ chatHistory, question });
      const { text } = await generateText({
        model: openai(process.env.OPENAI_LLM_MODEL || ''),
        prompt: aiPrompt,
      });
      return text;
    }
    return question;
  }

  async updateChatSummary(chatId: string, rawChatHistory: any) {
    const formattedChat = `user: ${rawChatHistory.user}\n system: ${rawChatHistory.system}`;
    const previousSummary = await this.huskyCacheDbService.get(`${chatId}:summary`);
    const aiPrompt = previousSummary
      ? Handlebars.compile(chatSummaryWithHistoryTemplate)({ previousSummary, currentConversation: formattedChat })
      : Handlebars.compile(chatSummaryTemplate)({ currentConversation: formattedChat });
    const { text } = await generateText({
      model: openai(process.env.OPENAI_LLM_MODEL || ''),
      prompt: aiPrompt,
    });
    await this.huskyCacheDbService.set(`${chatId}:summary`, text);
  }

  streamHuskyResponse(
    chatId: string,
    question: string,
    rephrasedQuestion: string,
    res: Response,
    prompt: string | null
  ) {
    const aiStreamingResponse = streamObject({
      model: openai(process.env.OPENAI_LLM_MODEL || ''),
      schema: HuskyResponseSchema,
      prompt: prompt || HUSKY_NO_INFO_PROMPT,
      onFinish: async (response) => {
        if (prompt) {
          await this.updateChatSummary(chatId, { user: question, system: response?.object?.content });
        }
        await this.persistChatHistory(chatId, question, rephrasedQuestion, response?.object?.content);
      },
    });
    aiStreamingResponse.pipeTextStreamToResponse(res);
  }

  private async fetchAndFormatActionDocs(type: string, collectionName: string, embedding: any) {
    const actionDocs = await this.huskyVectorDbService.searchEmbeddings(collectionName, embedding, 5, true);
    return actionDocs.map((doc) => {
      return {
        name: doc?.payload?.name ?? '',
        directoryLink: doc?.payload?.directoryLink ?? '',
        info: doc?.payload?.content ?? '',
        type: type,
        score: doc.score,
      };
    });
  }

  async getActionDocs(embedding: any) {
    const [memberDocs, teamDocs, projectDocs] = await Promise.all([
      this.fetchAndFormatActionDocs(HUSKY_ACTION_TYPES.MEMBER, process.env.QDRANT_MEMBERS_COLLECTION || '', embedding),
      this.fetchAndFormatActionDocs(HUSKY_ACTION_TYPES.TEAM, process.env.QDRANT_TEAMS_COLLECTION || '', embedding),
      this.fetchAndFormatActionDocs(
        HUSKY_ACTION_TYPES.PROJECT,
        process.env.QDRANT_PROJECTS_COLLECTION || '',
        embedding
      ),
    ]);

    return {
      memberDocs,
      teamDocs,
      projectDocs,
    };
  }

  async getMatchingEmbeddingsBySource(source: string, embedding: any, limit = 25) {
    const collection =
      source === HUSKY_SOURCES.TWITTER
        ? process.env.QDRANT_TWITTER_COLLECTION || ''
        : process.env.QDRANT_ALL_DOCS_COLLECTION || '';

    return this.huskyVectorDbService.searchEmbeddings(collection, embedding, limit, true);
  }

  createContextForMatchingDocs(matchingDocs: any[]) {
    const formattedResults: any[] = [];
    for (const result of matchingDocs) {
      formattedResults.push({
        score: result.score,
        text: result?.payload?.page_content ?? '',
        source: result?.payload?.metadata?.url ?? '',
      });
    }

    const sortedResults = formattedResults
      .sort((a, b) => b?.score - a?.score)
      .filter((v) => v.score > 0.4)
      .slice(0, 10);

    const context = sortedResults
      .filter((result) => result?.text?.length > 5)
      .map((result) => `${result?.text}${result?.source ? ` (Source:${result?.source})` : ''}`)
      .join('\n');
    return context;
  }

  createPromptForHuskyChat(question: string, context: string, chatSummary: string, allDocs: any) {
    const contextLength = Math.min(Math.max(60, context.split(' ').length / 1.5), 600);
    const aiPrompt = Handlebars.compile(aiPromptTemplate)({
      context,
      contextLength,
      question,
      chatSummary,
      allDocs: JSON.stringify(allDocs),
    });
    return aiPrompt;
  }
}
