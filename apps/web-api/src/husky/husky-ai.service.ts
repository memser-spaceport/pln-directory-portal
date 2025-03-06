import { Injectable, NotFoundException } from '@nestjs/common';
import { QdrantVectorDbService } from './db/qdrant-vector-db.service';
import { RedisCacheDbService } from './db/redis-cache-db.service';
import { MongoPersistantDbService } from './db/mongo-persistant-db.service';
import { LogService } from '../shared/log.service';
import {
  createDataStream,
  createDataStreamResponse,
  embed,
  generateObject,
  generateText,
  streamObject,
  streamText,
} from 'ai';
import { openai } from '@ai-sdk/openai';
import { HuskyResponseSchema, HuskyChatInterface } from 'libs/contracts/src/schema/husky-chat';
import {
  aiPromptTemplate,
  chatSummaryTemplate,
  chatSummaryWithHistoryTemplate,
  HUSKY_ACTION_TYPES,
  HUSKY_NO_INFO_PROMPT,
  HUSKY_CONTEXTUAL_SUMMARY_PROMPT,
  HUSKY_SOURCES,
  promptForTextToSql,
  rephraseQuestionTemplate,
  HUSKY_RELATED_INFO_PROMPT,
  HUSKY_RELATED_INFO_SUMMARY_PROMPT,
  PROMPT_FOR_GENERATE_TITLE,
} from '../utils/constants';
import { Response } from 'express';
import Handlebars from 'handlebars';
import { z } from 'zod';
import { PostgresSqlDb } from './db/postgress-sql-db.service';
import { pipeDataStreamToResponse } from 'ai';

@Injectable()
export class HuskyAiService {
  constructor(
    private logger: LogService,
    private huskyVectorDbService: QdrantVectorDbService,
    private huskyCacheDbService: RedisCacheDbService,
    private huskyPersistentDbService: MongoPersistantDbService,
    private postgresSqlDBService: PostgresSqlDb
  ) {}

  async getChatAdditionalInfo(threadUid: string, chatUid: string) {
    const lastQuestion = await this.huskyCacheDbService.get(`${threadUid}:last-question`);
    const lastResponse = await this.huskyCacheDbService.get(`${threadUid}:last-response`);
    const previousChatSummary = await this.huskyCacheDbService.get(`${threadUid}:summary`);
    const chatSummary = await generateText({
      model: openai(process.env.OPENAI_LLM_MODEL || ''),
      prompt: Handlebars.compile(HUSKY_RELATED_INFO_SUMMARY_PROMPT)({
        question: lastQuestion,
        response: lastResponse,
        previousChatSummary: previousChatSummary,
      }),
    });

    const questionEmbedding = await this.getEmbeddingForText(chatSummary.text);
    const [nonDirectoryDocs, directoryDocs] = await Promise.all([
      this.getEmbeddingsBySource(questionEmbedding, 30),
      this.getDirectoryEmbeddings(questionEmbedding, 10),
    ]);

    const filteredNonDirectoryDocs = [...nonDirectoryDocs].filter((doc) => doc.score > 0.45);
    const filteredDirectoryDocs = {
      memberDocs: { ...directoryDocs }?.memberDocs?.filter((doc) => doc.score > 0.35),
      teamDocs: { ...directoryDocs }?.teamDocs?.filter((doc) => doc.score > 0.35),
      projectDocs: { ...directoryDocs }?.projectDocs?.filter((doc) => doc.score > 0.35),
    };

    const actionsDocs = {
      memberDocs: { ...directoryDocs }?.memberDocs?.filter((doc) => doc.score > 0.45),
      teamDocs: { ...directoryDocs }?.teamDocs?.filter((doc) => doc.score > 0.45),
      projectDocs: { ...directoryDocs }?.projectDocs?.filter((doc) => doc.score > 0.45),
    };

    const context = await this.createContextWithMatchedDocs(filteredNonDirectoryDocs, filteredDirectoryDocs, chatUid);

    const result = await generateObject({
      model: openai(process.env.OPENAI_LLM_MODEL || ''),
      schema: z.object({
        followUpQuestions: z.array(z.string()),
        actions: z.array(
          z.object({
            name: z.string(),
            type: z.string(),
            directoryLink: z.string(),
          })
        ),
      }),
      prompt: Handlebars.compile(HUSKY_RELATED_INFO_PROMPT)({
        context,
        actionDocs: JSON.stringify(actionsDocs),
        question: lastQuestion,
        response: lastResponse,
      }),
    });

    return result?.object;
  }

  async createAnalyticalResponse(chatInfo: HuskyChatInterface) {
    const { question, threadUid, chatUid } = chatInfo;
    const rephrasedQuestion = await this.getRephrasedQuestionBasedOnHistory(threadUid, question.toLowerCase());
    const { object } = await generateObject({
      model: openai(process.env.OPENAI_LLM_MODEL || ''),
      system: promptForTextToSql,
      prompt: rephrasedQuestion,
      schema: z.object({
        sql: z.array(z.string()),
      }),
    });

    const sqlQueries = object?.sql;
    const results = await this.processSqlQueries(sqlQueries);
    await this.persistAnalyticalHistory(threadUid, chatUid, results);
    return results;
  }

  async persistAnalyticalHistory(threadId: string, chatId: string, data: any) {
    await this.huskyPersistentDbService.patch(process.env.MONGO_THREADS_COLLECTION || '', 'threadId', threadId, {
      updatedAt: Date.now(),
      analytical: [
        {
          ...data,
          chatId,
        },
      ],
    });
  }

  async processSqlQueries(sqls: string[]) {
    const promises: any[] = [];
    sqls.forEach((sql) => {
      promises.push(this.postgresSqlDBService.runRawQuery(sql));
    });
    const allResults = await Promise.all(promises);
    let results: any = [];
    allResults.forEach((result, index) => {
      results = [...results, ...result];
    });
    return results;
  }

  async createContextualResponse(chatInfo: HuskyChatInterface) {
    const { threadUid, chatUid, question, chatSummary, source, directoryId, email, name } = chatInfo;

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
      // this.updateChatSummaryInMongo(threadUid, chatSummary).then(() => {});
      await this.updateAndGetChatSummary(threadUid, chatSummary);
    }

    // Rephrase the question and get the matching documents to create context
    const rephrasedQuestion = await this.getRephrasedQuestionBasedOnHistory(threadUid, question.toLowerCase());
    const questionEmbedding = await this.getEmbeddingForText(rephrasedQuestion);
    const [nonDirectoryDocs, directoryDocs] = await Promise.all([
      this.getEmbeddingsBySource(questionEmbedding),
      this.getDirectoryEmbeddings(questionEmbedding),
    ]);

    const context = await this.createContextWithMatchedDocs(nonDirectoryDocs, directoryDocs, threadUid);
    const prompt = this.createPromptForContextualDocs(question, context);
    return streamObject({
      model: openai(process.env.OPENAI_LLM_MODEL || ''),
      schema: z.object({
        content: z.string(),
        sources: z.array(z.string()),
      }),
      prompt: prompt || HUSKY_NO_INFO_PROMPT,
      temperature: 0.1,
      onFinish: async (response) => {
        if (prompt) {
          // this.updateLastMessage(threadUid, question, response?.object?.content as string).then(() => {});
          // this.updateChatSummaryInMongo(threadUid, { user: question, system: response?.object?.content });
          await this.updateAndGetChatSummary(threadUid, { user: question, system: response?.object?.content });
          this.persistContextualHistory(
            threadUid,
            chatUid,
            question,
            rephrasedQuestion,
            response?.object?.content || '',
            response?.object?.sources || [],
            [],
            []
          ).then(() => {});
        }
      },
    });
  }

  async createStreamingChatResponse(chatInfo: HuskyChatInterface) {
    const { question, chatSummary, source, directoryId, email, name, threadUid, chatUid } = chatInfo;

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
      await this.updateAndGetChatSummary(threadUid, chatSummary);
    }

    // Rephrase the question and get the matching documents to create context
    const rephrasedQuestion = await this.getRephrasedQuestionBasedOnHistory(threadUid, question.toLowerCase());
    console.log('rephrasedQuestion', rephrasedQuestion);
    const questionEmbedding = await this.getEmbeddingForText(rephrasedQuestion);
    const [nonDirectoryDocs, directoryDocs] = await Promise.all([
      this.getEmbeddingsBySource(questionEmbedding),
      this.getDirectoryEmbeddings(questionEmbedding),
    ]);

    const context = await this.createContextWithMatchedDocs(nonDirectoryDocs, directoryDocs);

    // Handle the case when there is no context
    if (context === '') {
      return streamObject({
        model: openai(process.env.OPENAI_LLM_MODEL || ''),
        schema: HuskyResponseSchema,
        temperature: 0.1,
        prompt: HUSKY_NO_INFO_PROMPT,
        onFinish: async (response) => {
          this.persistContextualHistory(
            threadUid,
            chatUid,
            question,
            rephrasedQuestion,
            response?.object?.content || '',
            response?.object?.sources || [],
            response?.object?.followUpQuestions || [],
            response?.object?.actions || []
          ).then(() => {});
        },
      });
    }

    // If Context is valid, then create prompt and stream the response
    const chatSummaryFromDb = await this.huskyCacheDbService.get(`${threadUid}:summary`);
    const prompt = this.createPromptForHuskyChat(question, context, chatSummaryFromDb || '', directoryDocs);
    return streamObject({
      model: openai(process.env.OPENAI_LLM_MODEL || ''),
      schema: HuskyResponseSchema,
      prompt: prompt || HUSKY_NO_INFO_PROMPT,
      temperature: 0.1,
      onFinish: async (response) => {
        if (prompt) {
          await this.updateAndGetChatSummary(threadUid, {
            user: question,
            system: response?.object?.content,
          });
          //this.updateChatSummaryInMongo(threadUid, { user: question, system: chatSummary }).then(() => {});
        }
        this.persistContextualHistory(
          threadUid,
          chatUid,
          question,
          rephrasedQuestion,
          response?.object?.content || '',
          response?.object?.sources || [],
          response?.object?.followUpQuestions || [],
          response?.object?.actions || []
        ).then(() => {});
      },
    });
  }

  async updateAndGetChatSummary(chatId: string, rawChatHistory: any) {
    const formattedChat = `user: ${rawChatHistory.user}\n system: ${rawChatHistory.system}`;
    const previousSummary = await this.huskyCacheDbService.get(`${chatId}:summary`);

    // Define a maximum length for the summary
    const maxLength = 500; // Adjust this value as needed

    const aiPrompt = previousSummary
      ? Handlebars.compile(chatSummaryWithHistoryTemplate)({
          previousSummary,
          currentConversation: formattedChat,
          maxLength,
        })
      : Handlebars.compile(chatSummaryTemplate)({ currentConversation: formattedChat, maxLength });

    const { text } = await generateText({
      model: openai(process.env.OPENAI_LLM_MODEL || ''),
      prompt: aiPrompt,
    });
    await this.huskyCacheDbService.set(`${chatId}:summary`, text);
  }

  async persistContextualHistory(
    threadUid: string,
    chatId: string,
    question: string,
    rephrasedPrompt: string,
    response: string | null,
    sources: any[] = [],
    followUpQuestions: any[] = [],
    actions: any[] = []
  ) {
    await this.huskyPersistentDbService.patch(process.env.MONGO_THREADS_COLLECTION || '', 'threadId', threadUid, {
      updatedAt: Date.now(),
      rephrasedPrompt,
      contextual: [
        {
          chatId,
          question,
          response,
          sources,
          followUpQuestions,
          actions,
        },
      ],
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
    //const chatHistory = await this.huskyCacheDbService.get(`${chatId}:summary`);
    const result = await this.huskyPersistentDbService.findOneById(
      process.env.MONGO_SUMMARY_COLLECTION || '',
      'threadId',
      chatId
    );
    if (result?.chatSummary) {
      const aiPrompt = Handlebars.compile(rephraseQuestionTemplate)({ chatHistory: result?.chatSummary, question });
      const { text } = await generateText({
        model: openai(process.env.OPENAI_LLM_MODEL || ''),
        prompt: aiPrompt,
      });
      return text;
    }
    return question;
  }

  async updateLastMessage(chatId: string, question: string, response: string) {
    await this.huskyCacheDbService.set(`${chatId}:last-question`, question);
    await this.huskyCacheDbService.set(`${chatId}:last-response`, response);
  }

  async updateChatSummaryInMongo(chatId: string, rawChatHistory: any) {
    const formattedChat = `user: ${rawChatHistory.user}\n system: ${rawChatHistory.system}`;
    let previousSummary = '';
    // previousSummary = await this.huskyCacheDbService.get(`${chatId}:summary`);

    const result = await this.huskyPersistentDbService.findOneById(
      process.env.MONGO_SUMMARY_COLLECTION || '',
      'threadId',
      chatId
    );
    previousSummary = result?.chatSummary ?? '';

    // Define a maximum length for the summary
    const maxLength = 500; // Adjust this value as needed

    const aiPrompt = previousSummary
      ? Handlebars.compile(chatSummaryWithHistoryTemplate)({
          previousSummary: previousSummary,
          currentConversation: formattedChat,
          maxLength,
        })
      : Handlebars.compile(chatSummaryTemplate)({ currentConversation: formattedChat, maxLength });

    const { text } = await generateText({
      model: openai(process.env.OPENAI_LLM_MODEL || ''),
      prompt: aiPrompt,
    });

    await this.huskyPersistentDbService.updateById(process.env.MONGO_SUMMARY_COLLECTION || '', 'threadId', chatId, {
      chatSummary: text,
    });
  }

  // streamHuskyResponse(
  //   chatId: string,
  //   question: string,
  //   rephrasedQuestion: string,
  //   res: Response,
  //   prompt: string | null
  // ) {
  //   const aiStreamingResponse = streamObject({
  //     model: openai(process.env.OPENAI_LLM_MODEL || ''),
  //     schema: HuskyResponseSchema,
  //     prompt: prompt || HUSKY_NO_INFO_PROMPT,
  //     onFinish: async (response) => {
  //       if (prompt) {
  //         await this.updateChatSummary(chatId, { user: question, system: response?.object?.content });
  //       }
  //       await this.persistChatHistory(chatId, question, rephrasedQuestion, response?.object?.content, null, 'context');
  //     },
  //   });
  //   aiStreamingResponse.pipeTextStreamToResponse(res);
  // }

  private async fetchAndFormatActionDocs(type: string, collectionName: string, embedding: any, limit = 5) {
    const actionDocs = await this.huskyVectorDbService.searchEmbeddings(collectionName, embedding, limit, true);
    return actionDocs.map((doc) => {
      const metadata: any = doc?.payload?.metadata;
      return {
        name: metadata?.name ?? '',
        directoryLink: metadata?.source ?? '',
        id: doc?.id,
        info: doc?.payload?.content ?? '',
        type: type,
        score: doc.score,
      };
    });
  }

  async getDirectoryEmbeddings(embedding: any, limit = 5) {
    const [memberDocs, teamDocs, projectDocs, focusAreaDocs, irlEventDocs] = await Promise.all([
      this.fetchAndFormatActionDocs(
        HUSKY_ACTION_TYPES.MEMBER,
        process.env.QDRANT_MEMBERS_COLLECTION || '',
        embedding,
        limit
      ),
      this.fetchAndFormatActionDocs(
        HUSKY_ACTION_TYPES.TEAM,
        process.env.QDRANT_TEAMS_COLLECTION || '',
        embedding,
        limit
      ),
      this.fetchAndFormatActionDocs(
        HUSKY_ACTION_TYPES.PROJECT,
        process.env.QDRANT_PROJECTS_COLLECTION || '',
        embedding,
        limit
      ),
      this.fetchAndFormatActionDocs(
        HUSKY_ACTION_TYPES.FOCUS_AREA,
        process.env.QDRANT_FOCUS_AREAS_COLLECTION || '',
        embedding
      ),
      this.fetchAndFormatActionDocs(
        HUSKY_ACTION_TYPES.IRL_EVENT,
        process.env.QDRANT_IRL_EVENTS_COLLECTION || '',
        embedding
      ),
    ]);

    return {
      memberDocs,
      teamDocs,
      projectDocs,
      focusAreaDocs,
      irlEventDocs,
    };
  }

  async getEmbeddingsBySource(embedding: any, limit = 25) {
    // Get results from both collections
    const [allDocsResults, teamsWebsearchResults] = await Promise.all([
      this.huskyVectorDbService.searchEmbeddings(process.env.QDRANT_ALL_DOCS_COLLECTION || '', embedding, limit, true),
      this.huskyVectorDbService.searchEmbeddings(
        process.env.QDRANT_TEAMS_WEBSEARCH_COLLECTION || '',
        embedding,
        limit,
        true
      ),
    ]);

    const formattedTeamsWebsearchResults = teamsWebsearchResults.map((doc) => {
      return {
        id: doc.id,
        version: doc.version,
        score: doc.score,
        payload: {
          metadata: {
            source: (doc.payload?.metadata as any)?.source ?? '',
            name: (doc.payload?.metadata as any)?.name ?? '',
          },
          page_content: doc.payload?.content,
        },
        groupType: (doc.payload as any)?.type ?? '',
      };
    });

    // Combine and sort results by score
    return [...allDocsResults, ...formattedTeamsWebsearchResults].sort((a, b) => b.score - a.score).slice(0, limit);
  }

  async createContextWithMatchedDocs(nonDirectoryDocs: any[], directoryDocs: any, chatId?: string) {
    let allDocs: any[] = [];
    const actionDocKeys = ['memberDocs', 'teamDocs', 'projectDocs', 'focusAreaDocs', 'irlEventDocs'];

    actionDocKeys.forEach((key: string) => {
      const docs = [...directoryDocs[key]].map((doc: any) => {
        return {
          id: doc?.id,
          text: doc?.info,
          score: doc?.score,
          source: doc?.directoryLink,
        };
      });
      allDocs = [...allDocs, ...docs];
    });

    const formattedNonDictoryDocs = [...nonDirectoryDocs].map((doc: any) => {
      return {
        id: doc?.id,
        score: doc.score,
        text: doc?.payload?.page_content ?? '',
        source: doc?.payload?.metadata?.source ?? '',
      };
    });

    const nonDirectory = formattedNonDictoryDocs
      .filter((v) => v.score > 0.35 && v?.text?.length > 5)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
    const directory = allDocs
      .filter((v) => v.score > 0.35 && v?.text?.length > 5)
      .sort((a, b) => b.score - a.score)
      .slice(0, 6);

    const all = [...directory, ...nonDirectory];

    if (chatId) {
      const selectedIds = all.map((result) => result?.id);
      await this.huskyCacheDbService.set(`${chatId}:last-selected-docs`, selectedIds);
    }

    return all.map((result) => `${result?.text}${result?.source ? ` (Source:${result?.source})` : ''}`).join('\n');
  }

  createPromptForContextualDocs(question: string, context: string) {
    const aiPrompt = Handlebars.compile(HUSKY_CONTEXTUAL_SUMMARY_PROMPT)({
      context,
      question,
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
      currentDate: new Date().toISOString().split('T')[0],
      allDocs: JSON.stringify(allDocs),
    });
    return aiPrompt;
  }

  async createThreadTitle(threadId: string, email: string, question: string) {
    const thread = await this.huskyPersistentDbService.findOneById(
      process.env.MONGO_THREADS_COLLECTION || '',
      'threadUid',
      threadId
    );

    if (thread) {
      return {
        threadId,
        title: thread?.title,
      };
    }

    const prompt = Handlebars.compile(PROMPT_FOR_GENERATE_TITLE)({
      question: question,
    });
    const { object } = await generateObject({
      model: openai(process.env.OPENAI_LLM_MODEL || ''),
      prompt: prompt,
      schema: z.object({
        title: z.string(),
      }),
    });
    const title = object?.title || '--';
    await this.huskyPersistentDbService.updateById(process.env.MONGO_THREADS_COLLECTION || '', 'threadId', threadId, {
      title,
    });
    return {
      title,
      threadId,
    };
  }

  async getThreadsByEmail(email: string) {
    try {
      const threads = await this.huskyPersistentDbService.findAllById(
        process.env.MONGO_THREAD_COLLECTION || '',
        'email',
        email
      );
      return threads;
    } catch (error) {
      this.logger.error(`Failed to get threads for email ${email}:`, error);
      throw new Error(`Failed to retrieve threads: ${error.message}`);
    }
  }

  async getThreadById(uid: string) {
    const threads = await this.huskyPersistentDbService.findAllById(
      process.env.MONGO_CONVERSATION_COLLECTION || '',
      'chatThreadId',
      uid
    );
    const allThreads: any = [];
    threads.map((thread: any) => {
      if (thread?.type === 'context') {
        const filteredSql = threads.filter(
          (sqlThread: any) => sqlThread.type === 'sql' && sqlThread.chatUid === thread.chatUid
        );
        allThreads.push({
          ...thread,
          sqlData: filteredSql[0]?.data,
        });
      }
    });
    return allThreads;
  }
}
