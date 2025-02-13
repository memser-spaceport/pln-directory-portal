import { Injectable } from '@nestjs/common';
import { QdrantVectorDbService } from './db/qdrant-vector-db.service';
import { RedisCacheDbService } from './db/redis-cache-db.service';
import { MongoPersistantDbService } from './db/mongo-persistant-db.service';
import { LogService } from '../shared/log.service';
import { embed, generateText, streamObject } from 'ai';
import { openai } from '@ai-sdk/openai';
import { HuskyResponseSchema, HuskyChatInterface } from 'libs/contracts/src/schema/husky-chat';
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
      const metadata: any = doc?.payload?.metadata;
      return {
        name: metadata?.name ?? '',
        directoryLink: metadata?.source ?? '',
        info: doc?.payload?.content ?? '',
        type: type,
        score: doc.score,
      };
    });
  }

  async getDirectoryEmbeddings(embedding: any) {
    const [memberDocs, teamDocs, projectDocs, focusAreaDocs] = await Promise.all([
      this.fetchAndFormatActionDocs(HUSKY_ACTION_TYPES.MEMBER, process.env.QDRANT_MEMBERS_COLLECTION || '', embedding),
      this.fetchAndFormatActionDocs(HUSKY_ACTION_TYPES.TEAM, process.env.QDRANT_TEAMS_COLLECTION || '', embedding),
      this.fetchAndFormatActionDocs(
        HUSKY_ACTION_TYPES.PROJECT,
        process.env.QDRANT_PROJECTS_COLLECTION || '',
        embedding
      ),
      this.fetchAndFormatActionDocs(HUSKY_ACTION_TYPES.FOCUS_AREA, process.env.QDRANT_FOCUS_AREAS_COLLECTION || '', embedding)
    ]);

    return {
      memberDocs,
      teamDocs,
      projectDocs,
      focusAreaDocs
    };
  }

  async getEmbeddingsBySource(source: string, embedding: any, limit = 25) {
    if (source === HUSKY_SOURCES.TWITTER) {
      const collection = process.env.QDRANT_TWITTER_COLLECTION || '';
      return this.huskyVectorDbService.searchEmbeddings(collection, embedding, limit, true);
    } else {
      // Get results from both collections
      const [allDocsResults, teamsWebsearchResults] = await Promise.all([
        this.huskyVectorDbService.searchEmbeddings(process.env.QDRANT_ALL_DOCS_COLLECTION || '', embedding, limit, true),
        this.huskyVectorDbService.searchEmbeddings(process.env.QDRANT_TEAMS_WEBSEARCH_COLLECTION || '', embedding, limit, true)
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
      return [...allDocsResults, ...formattedTeamsWebsearchResults]
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);
    }
  }

  createContextWithMatchedDocs(nonDirectoryDocs: any[], directoryDocs: any) {
    let allDocs: any[] = [];
    const actionDocKeys = ['memberDocs', 'teamDocs', 'projectDocs', 'focusAreaDocs'];

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
