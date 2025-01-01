import { Injectable, ConflictException, BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { LogService } from '../shared/log.service';
import { PrismaService } from '../shared/prisma.service';
import { openai } from '@ai-sdk/openai';
import { embed, generateText, streamObject } from 'ai';
import { Response } from 'express';
import { HuskyResponseSchema } from 'libs/contracts/src/schema/husky-chat';
import { QdrantVectorDbService } from './db/qdrant-vector-db.service';
import { RedisCacheDbService } from './db/redis-cache-db.service';
import { Neo4jGraphDbService } from './db/neo4j-graph-db.service';
import { MongoPersistantDbService } from './db/mongo-persistant-db.service';
import { HUSKY_ACTION_TYPES, HUSKY_NO_INFO_PROMPT, HUSKY_SOURCES } from '../utils/constants';
@Injectable()
export class HuskyService {
  constructor(
    private logger: LogService,
    private prisma: PrismaService,
    private huskyVectorDbService: QdrantVectorDbService,
    private huskyCacheDbService: RedisCacheDbService,
    private huskyGraphDbService: Neo4jGraphDbService,
    private huskyPersistentDbService: MongoPersistantDbService
  ) {}

  async fetchDiscoverQuestions(query: Prisma.DiscoveryQuestionFindManyArgs) {
    try {
      query.include = {
        ...query.include,
        team: {
          select: {
            uid: true,
            logo: true,
            name: true,
          },
        },
        project: {
          select: {
            uid: true,
            logo: true,
            name: true,
          },
        },
        plevent: {
          select: {
            uid: true,
            name: true,
            logo: true,
          },
        },
      };
      return await this.prisma.discoveryQuestion.findMany(query);
    } catch (error) {
      this.handleErrors(error);
    }
  }

  async fetchDiscoverQuestionBySlug(slug: string) {
    try {
      return await this.prisma.discoveryQuestion.findUnique({
        where: { slug },
      });
    } catch (error) {
      this.handleErrors(error);
    }
  }

  async createDiscoverQuestion(discoveryQuestion: Prisma.DiscoveryQuestionUncheckedCreateInput, loggedInMember) {
    try {
      return await this.prisma.discoveryQuestion.create({
        data: {
          ...{
            createdBy: loggedInMember.uid,
            modifiedBy: loggedInMember.uid,
            slug: Math.random().toString(36).substring(2, 8),
          },
          ...discoveryQuestion,
        },
      });
    } catch (error) {
      this.handleErrors(error);
    }
  }

  async updateDiscoveryQuestionBySlug(
    slug: string,
    discoveryQuestion: Prisma.DiscoveryQuestionUncheckedCreateInput,
    loggedInMember
  ) {
    try {
      return this.prisma.discoveryQuestion.update({
        where: { slug },
        data: {
          ...{
            modifiedBy: loggedInMember.uid,
          },
          ...discoveryQuestion,
        },
      });
    } catch (error) {
      this.handleErrors(error);
    }
  }

  async updateDiscoveryQuestionShareCount(slug: string) {
    try {
      return await this.prisma.discoveryQuestion.update({
        where: { slug },
        data: {
          shareCount: { increment: 1 },
        },
      });
    } catch (error) {
      this.handleErrors(error);
    }
  }

  async updateDiscoveryQuestionViewCount(slug: string) {
    try {
      return await this.prisma.discoveryQuestion.update({
        where: { slug },
        data: {
          viewCount: { increment: 1 },
        },
      });
    } catch (error) {
      this.handleErrors(error);
    }
  }

  private handleErrors(error, message?) {
    this.logger.error(error);
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      switch (error?.code) {
        case 'P2002':
          throw new ConflictException('Unique key constraint error on discovery question:', error.message);
        case 'P2003':
          throw new BadRequestException('Foreign key constraint error on discovery question', error.message);
        case 'P2025':
          throw new NotFoundException('Discovery question is not found with slug:' + message);
        default:
          throw error;
      }
    } else if (error instanceof Prisma.PrismaClientValidationError) {
      throw new BadRequestException('Database field validation error on discovery question', error.message);
    }
    throw error;
  }

  /***************  HUSKY   *****************/

  async updateFeedback(feedback: any) {
    await this.huskyPersistentDbService.create(process.env.MONGO_FEEDBACK_COLLECTION || '', feedback);
  }

  async persistChatHistory(uid: string, prompt: string, rephrasedPrompt: string, response: any) {
    await this.huskyPersistentDbService.create(process.env.MONGO_CONVERSATION_COLLECTION || '', {
      chatThreadId: uid,
      prompt,
      rephrasedPrompt,
      response: response?.content || '',
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

  async getChatHistory(uid: string) {
    const chatHistory = await this.huskyCacheDbService.get(uid);
    return chatHistory;
  }

  async getRephrasedQuesBasedOnHistory(chatId: string, question: string) {
    const chatHistory = await this.getChatHistory(`${chatId}:summary`);
    if (chatHistory) {
      const { text } = await generateText({
        model: openai(process.env.OPENAI_LLM_MODEL || ''),
        prompt: `Given the chat summary - ${chatHistory} and the new question - ${question}, Rephrase the new question if its missing any context. If its not missing any context, return the same question. If its a completely new context, return the new question as it is.`,
      });
      return text;
    }
    return question;
  }

  async updateChatSummary(chatId: string, question: string, response: any) {
    if (response?.object?.content === 'No information available' || response?.object?.content === '') {
      return;
    }
    const currentConversation = `user: ${question}\n system: ${response?.object?.content}`;
    const previousSummary = await this.huskyCacheDbService.get(chatId);
    if (previousSummary) {
      const { text } = await generateText({
        model: openai(process.env.OPENAI_LLM_MODEL || ''),
        prompt: `Given the summary of chat history - ${previousSummary}, and the new conversation - ${currentConversation}, Summarize all the system responses into one and also all user queries into one as short as possible but without losing any context or detail`,
      });
      await this.huskyCacheDbService.set(chatId, text);
    } else {
      const { text } = await generateText({
        model: openai(process.env.OPENAI_LLM_MODEL || ''),
        prompt: `Summarize the following chat conversation to as short as possible without losing any context or details but also maintain the thread of user and system responses: ${currentConversation}`,
      });
      await this.huskyCacheDbService.set(`${chatId}:summary`, text);
    }
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
          await this.updateChatSummary(chatId, question, response);
        }
        await this.persistChatHistory(chatId, question, rephrasedQuestion, prompt ? response?.object : { content: '' });
      },
    });
    aiStreamingResponse.pipeTextStreamToResponse(res);
  }

  private async fetchAndFormatActionDocsByType(type: string, embedding: any, collectionName: string, limit = 5) {
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
      this.fetchAndFormatActionDocsByType(HUSKY_ACTION_TYPES.MEMBER, process.env.QDRANT_MEMBERS_COLLECTION, embedding),
      this.fetchAndFormatActionDocsByType(HUSKY_ACTION_TYPES.TEAM, process.env.QDRANT_TEAMS_COLLECTION, embedding),
      this.fetchAndFormatActionDocsByType(
        HUSKY_ACTION_TYPES.PROJECT,
        process.env.QDRANT_PROJECTS_COLLECTION,
        embedding
      ),
    ]);

    return {
      memberDocs,
      teamDocs,
      projectDocs,
    };
  }

  async getMatchingEmbeddingsBySource(source: string, embedding: any, limit = 15) {
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

    const sortedResults = formattedResults.sort((a, b) => b?.score - a?.score).slice(0, 5);
    const context = sortedResults.map((result) => `${result?.text}(Source:${result?.source})`).join('\n');
    return context;
  }
  createPromptForHuskyChat(question: string, context: string, chatHistorySummary: string, allDocs: any) {
    const contextLength = Math.min(Math.max(60, context.split(' ').length / 2), 300);
    const aiPrompt = `Given the question - ${question}, And following 'Context' and 'Chat History Summary' (if available)
  Generate a JSON object with the following structure. Make sure you have the content, followUpQuestions, actions and sources separate in the JSON object. Dont add everything in the content itself.:

    sources: Array of sources of the information from the 'Source' available in the context. Remove any duplicate and invalid sources. If no sources are available, return an empty array.
    content: Respond based on the context provided with alteast ${contextLength} words. You can rearrange the sentences to make it meaningful with proper english but Only use the provided information. If you dont have the information user asked for in the text. Just inform - 'Information not available currently' Dont add any other details. Have citations using the 'Source' url from context if available and place it near the corresponding information. Have the citations as links and have the names as [1](Source url), [2](Source url), [3](Source url), etc in ascending order for each citation added. But the numbering order should be for entire context and not just for paragraphs. Avoid duplicate citations i.e. if a source is already cited, dont cite it again. Use sub-headings to make the content more readable.
    followUpQuestions: An array containing exactly 3 follow-up questions that are relevant to the retrieved information.
    actions: An array of objects with the following structure: {name: 'Name of the member', directoryLink: 'Link to the directory site', type: 'Member/Team/Project'}. Choose max 6 from the 'action list' that is appropriate for this context. Have least preference for someone with role - Contributor. If list items are not available or doesn't looks appropriate for the context, return an empty array.

  Dont add any additional information from your Pretrained knowledge. And citation it is important dont miss it.
  If the context is empty, return content as 'No information available' strictly.
  Dont add sources, followUpQuestions, actions into content strictly.

  Context: ${context}
  Chat History Summary: ${chatHistorySummary}
  action list: ${JSON.stringify(allDocs)}
  `;
    return aiPrompt;
  }
}
