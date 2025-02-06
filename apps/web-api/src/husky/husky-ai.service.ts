import { Injectable } from '@nestjs/common';
import { QdrantVectorDbService } from './db/qdrant-vector-db.service';
import { RedisCacheDbService } from './db/redis-cache-db.service';
import { MongoPersistantDbService } from './db/mongo-persistant-db.service';
import { LogService } from '../shared/log.service';
import { embed, generateObject, generateText, streamObject } from 'ai';
import { openai } from '@ai-sdk/openai';
import {
  HuskyResponseSchema,
  HuskyChatInterface,
  HuskyNonDirectorySearchSchema,
} from 'libs/contracts/src/schema/husky-chat';
import {
  aiPromptTemplate,
  aiPromptTemplateForNonDirectory,
  chatSummaryTemplate,
  chatSummaryWithHistoryTemplate,
  HUSKY_ACTION_TYPES,
  HUSKY_NO_INFO_PROMPT,
  HUSKY_SOURCES,
  promptForTextToSql,
  rephraseQuestionTemplate,
} from '../utils/constants';
import { Response } from 'express';
import Handlebars from 'handlebars';
import { z } from 'zod';
import axios from 'axios';

@Injectable()
export class HuskyAiService {
  constructor(
    private logger: LogService,
    private huskyVectorDbService: QdrantVectorDbService,
    private huskyCacheDbService: RedisCacheDbService,
    private huskyPersistentDbService: MongoPersistantDbService
  ) {}

  async handleEmptyContext(question: string, rephrasedQuestion: string, uid: string, userInfo: any) {
    return streamObject({
      model: openai(process.env.OPENAI_LLM_MODEL || ''),
      schema: HuskyResponseSchema,
      temperature: 0.1,
      prompt: HUSKY_NO_INFO_PROMPT,
      onFinish: async (response) => {
        await this.persistChatHistory(uid, question, rephrasedQuestion, response?.object?.content, userInfo);
      },
    });
  }

  async processDirectoryNonContextualSearch(chatInfo: HuskyChatInterface) {
    const { question, uid, chatSummary, directoryId, email, name } = chatInfo;
    // User info
    let userInfo;
    if (directoryId && email && name) {
      userInfo = {
        directoryId,
        email,
        name,
      };
    }

    // Update the chat summary if it is provided
    if (chatSummary) {
      await this.updateChatSummary(uid, chatSummary);
    }

    // Rephrase the question and get the matching documents to create context
    const rephrasedQuestion = await this.getRephrasedQuestionBasedOnHistory(uid, question.toLowerCase());
    const { object } = await generateObject({
      model: openai(process.env.OPENAI_LLM_MODEL || ''),
      system: promptForTextToSql,
      prompt: rephrasedQuestion,
      schema: z.object({
        sql: z.array(z.string()),
      }),
    });
    console.log(object.sql);
    try {
      const results = await this.processSqlQueries(object.sql);
      console.log(results);
      return results;
    } catch (error) {
      console.log(error);
      return {};
    }
  }

  async processSqlQueries(sqls: string[]) {
    const promises: any[] = [];
    sqls.forEach((sql) => {
      promises.push(axios.post(``, { query: sql }));
    });
    const allResults = await Promise.all(promises);
    const results: any = {};
    allResults.forEach((result, index) => {
      results[`query_${index + 1}`] = result.data;
    });
    return results;
  }

  async processDirectoryContextualSearch(chatInfo: HuskyChatInterface) {
    const { question, uid, chatSummary, source, directoryId, email, name } = chatInfo;
    // User info
    let userInfo;
    if (directoryId && email && name) {
      userInfo = {
        directoryId,
        email,
        name,
      };
    }

    // Update the chat summary if it is provided
    if (chatSummary) {
      await this.updateChatSummary(uid, chatSummary);
    }

    // Rephrase the question and get the matching documents to create context
    const rephrasedQuestion = await this.getRephrasedQuestionBasedOnHistory(uid, question.toLowerCase());
    const questionEmbedding = await this.getEmbeddingForText(rephrasedQuestion);
    const [nonDirectoryDocs, directoryDocs] = await Promise.all([
      this.getEmbeddingsBySource(source, questionEmbedding),
      this.getDirectoryEmbeddings(questionEmbedding),
    ]);
    const context = this.createContextWithMatchedDocs(nonDirectoryDocs, directoryDocs);
    if (context === '') {
      return this.handleEmptyContext(question, rephrasedQuestion, uid, userInfo);
    }

    // If Context is valid, then create prompt and stream the response
    const chatSummaryFromDb = await this.huskyCacheDbService.get(`${uid}:summary`);
    const prompt = this.createPromptForHuskyChat(question, context, chatSummaryFromDb || '', directoryDocs);
    return streamObject({
      model: openai(process.env.OPENAI_LLM_MODEL || ''),
      schema: HuskyNonDirectorySearchSchema,
      prompt: prompt,
      temperature: 0.1,
      onFinish: async (response) => {
        if (prompt) {
          await this.updateChatSummary(uid, { user: question, system: response?.object?.content });
        }
        await this.persistChatHistory(uid, question, rephrasedQuestion, response?.object?.content, userInfo);
      },
    });
  }

  async createStreamingChatResponse(chatInfo: HuskyChatInterface) {
    const { question, uid, chatSummary, source, directoryId, email, name } = chatInfo;
    // User info
    let userInfo;
    if (directoryId && email && name) {
      userInfo = {
        directoryId,
        email,
        name,
      };
    }

    // Update the chat summary if it is provided
    if (chatSummary) {
      await this.updateChatSummary(uid, chatSummary);
    }

    // Rephrase the question and get the matching documents to create context
    const rephrasedQuestion = await this.getRephrasedQuestionBasedOnHistory(uid, question.toLowerCase());
    const questionEmbedding = await this.getEmbeddingForText(rephrasedQuestion);
    const [nonDirectoryDocs, directoryDocs] = await Promise.all([
      this.getEmbeddingsBySource(source, questionEmbedding),
      this.getDirectoryEmbeddings(questionEmbedding),
    ]);

    const context = this.createContextWithMatchedDocs(nonDirectoryDocs, directoryDocs);

    // Handle the case when there is no context
    if (context === '') {
      return streamObject({
        model: openai(process.env.OPENAI_LLM_MODEL || ''),
        schema: HuskyResponseSchema,
        temperature: 0.1,
        prompt: HUSKY_NO_INFO_PROMPT,
        onFinish: async (response) => {
          await this.persistChatHistory(uid, question, rephrasedQuestion, response?.object?.content, userInfo);
        },
      });
    }

    // If Context is valid, then create prompt and stream the response
    const chatSummaryFromDb = await this.huskyCacheDbService.get(`${uid}:summary`);
    const prompt = this.createPromptForHuskyChat(question, context, chatSummaryFromDb || '', directoryDocs);
    return streamObject({
      model: openai(process.env.OPENAI_LLM_MODEL || ''),
      schema: HuskyResponseSchema,
      prompt: prompt || HUSKY_NO_INFO_PROMPT,
      temperature: 0.1,
      onFinish: async (response) => {
        if (prompt) {
          await this.updateChatSummary(uid, { user: question, system: response?.object?.content });
        }
        await this.persistChatHistory(uid, question, rephrasedQuestion, response?.object?.content, userInfo);
      },
    });
  }

  async persistChatHistory(uid: string, prompt: string, rephrasedPrompt: string, response: any, userInfo?: any) {
    await this.huskyPersistentDbService.create(process.env.MONGO_CONVERSATION_COLLECTION || '', {
      chatThreadId: uid,
      prompt,
      rephrasedPrompt,
      response: response || '',
      ...(userInfo && { ...userInfo }),
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

  async getDirectoryEmbeddings(embedding: any) {
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

  async getEmbeddingsBySource(source: string, embedding: any, limit = 25) {
    const collection =
      source === HUSKY_SOURCES.TWITTER
        ? process.env.QDRANT_TWITTER_COLLECTION || ''
        : process.env.QDRANT_ALL_DOCS_COLLECTION || '';

    return this.huskyVectorDbService.searchEmbeddings(collection, embedding, limit, true);
  }

  createContextForNonDirectoryDocs(nonDirectoryDocs: any[]) {
    return nonDirectoryDocs
      .map((doc: any) => {
        return {
          score: doc.score,
          text: doc?.payload?.page_content ?? '',
          source: doc?.payload?.metadata?.url ?? '',
        };
      })
      .sort((a, b) => b?.score - a?.score)
      .filter((v) => v.score > 0.45 && v?.text?.length > 5)
      .slice(0, 10)
      .map((result) => `${result?.text}${result?.source ? ` (Source:${result?.source})` : ''}`)
      .join('\n');
  }

  createContextWithMatchedDocs(nonDirectoryDocs: any[], directoryDocs: any) {
    let allDocs: any[] = [];
    const actionDocKeys = ['memberDocs', 'teamDocs', 'projectDocs'];

    actionDocKeys.forEach((key: string) => {
      const docs = [...directoryDocs[key]].map((doc: any) => {
        return {
          text: doc?.info,
          score: doc?.score,
          source: doc?.directoryLink,
        };
      });
      allDocs = [...allDocs, ...docs];
    });

    const formattedNonDictoryDocs = [...nonDirectoryDocs].map((doc: any) => {
      return {
        score: doc.score,
        text: doc?.payload?.page_content ?? '',
        source: doc?.payload?.metadata?.url ?? '',
      };
    });

    allDocs = [...allDocs, ...formattedNonDictoryDocs];

    return allDocs
      .sort((a, b) => b?.score - a?.score)
      .filter((v) => v.score > 0.45 && v?.text?.length > 5)
      .slice(0, 10)
      .map((result) => `${result?.text}${result?.source ? ` (Source:${result?.source})` : ''}`)
      .join('\n');
  }

  createPromptForNonDirectorySearch(question: string, context: string, chatSummary: string) {
    const contextLength = Math.min(context.split(' ').length / 2.5, 500);
    const aiPrompt = Handlebars.compile(aiPromptTemplateForNonDirectory)({
      context,
      contextLength,
      question,
      chatSummary,
    });
    return aiPrompt;
  }

  createPromptForHuskyChat(question: string, context: string, chatSummary: string, allDocs: any) {
    const contextLength = Math.min(context.split(' ').length / 2.5, 500);
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
