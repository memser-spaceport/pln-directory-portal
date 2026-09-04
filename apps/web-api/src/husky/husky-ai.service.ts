import { ForbiddenException, Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { RedisCacheDbService } from './db/redis-cache-db.service';
import { MongoPersistantDbService } from './db/mongo-persistant-db.service';
import { LogService } from '../shared/log.service';
import { generateText, LanguageModel, streamObject, streamText } from 'ai';
import { HuskyChatInterface, HuskyResponseContextSchema } from 'libs/contracts/src/schema/husky-chat';
import {
  HUSKY_CHAT_SUMMARY_SYSTEM_PROMPT,
  PROMPT_FOR_GENERATE_TITLE,
  HUSKY_CONTEXTUAL_TOOLS_SYSTEM_PROMPT,
  HUSKY_CONTEXTUAL_TOOLS_STRUCTURED_PROMPT,
} from '../utils/ai-prompts';
import Handlebars from 'handlebars';
import { PrismaService } from '../shared/prisma.service';
import { v4 as uuidv4 } from 'uuid';
import { HuskyAiToolsService } from './tools/husky-ai-tools.serivice';
import { AiProviderService, AiProviderType } from '../shared/ai-provider.service';
import { z } from 'zod';

/**
 * Provider selection for Husky AI search (chat answers, chat summaries, thread titles).
 * Set HUSKY_SEARCH_AI_PROVIDER=gemini|anthropic|openai to switch; defaults to Gemini
 * regardless of the global AI_PROVIDER.
 */
export const HUSKY_SEARCH_PROVIDER_ENV_VAR = 'HUSKY_SEARCH_AI_PROVIDER';
export const HUSKY_SEARCH_FALLBACK_PROVIDER: AiProviderType = 'gemini';

type HuskyResponseContext = z.infer<typeof HuskyResponseContextSchema>;

const EMPTY_RESPONSE_CONTEXT: HuskyResponseContext = { followUpQuestions: [], sources: [], actions: [] };

/**
 * Encodes a text chunk so it can be appended inside an already-open JSON string
 * literal (quotes, backslashes, newlines and control characters are escaped).
 */
export function encodeJsonStringFragment(chunk: string): string {
  return JSON.stringify(chunk).slice(1, -1);
}

@Injectable()
export class HuskyAiService {
  constructor(
    private logger: LogService,
    private huskyCacheDbService: RedisCacheDbService,
    private huskyPersistentDbService: MongoPersistantDbService,
    private prisma: PrismaService,
    private huskyAiToolsService: HuskyAiToolsService,
    private aiProvider: AiProviderService
  ) {}

  /**
   * Language model for Husky search. Search grounding is disabled because Gemini
   * rejects requests that combine it with function tools; all context comes from
   * the directory database tools.
   */
  private getModel(): LanguageModel {
    return this.aiProvider.getResponsesModel(HUSKY_SEARCH_PROVIDER_ENV_VAR, {
      useSearchGrounding: false,
      fallbackProvider: HUSKY_SEARCH_FALLBACK_PROVIDER,
    });
  }

  /**
   * Streams a JSON object `{ content, followUpQuestions, sources, actions }` in two
   * phases so the client can render the answer while the structured data is still
   * being generated:
   *   1. the answer text, produced with the directory database tools, streamed
   *      into the `content` string;
   *   2. sources / follow-up questions / actions, streamed as the remaining fields.
   */
  async createContextualToolsResponse(chatInfo: HuskyChatInterface, isLoggedIn: boolean) {
    const { question, threadId, chatId, chatSummary } = chatInfo;
    const currentDate = new Date().toISOString().split('T')[0];

    // A conversation started elsewhere (e.g. a blog embed) is handed over with its
    // first exchange so the thread keeps that context.
    if (chatSummary) {
      await this.updateChatSummary(threadId, chatSummary);
      await this.persistContextualHistory(
        threadId,
        chatSummary.chatId,
        chatSummary.user,
        chatSummary.system || '',
        chatSummary.sources || [],
        chatSummary.followUpQuestions || [],
        chatSummary.actions || []
      );
    }

    const chatSummaryFromDb = await this.huskyCacheDbService.get(`${threadId}:summary`);
    const historyPrompt = chatSummaryFromDb ? ` - chatHistory: ${chatSummaryFromDb}` : '';
    const model = this.getModel();

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start: async (controller) => {
        const enqueue = (text: string) => controller.enqueue(encoder.encode(text));

        let content = '';
        try {
          enqueue('{ "content": "');

          let toolResults = '';
          const { textStream } = streamText({
            model,
            system: HUSKY_CONTEXTUAL_TOOLS_SYSTEM_PROMPT,
            tools: this.huskyAiToolsService.getTools(isLoggedIn),
            prompt: `
          ${historyPrompt}
            - question: ${question}
            - currentDate: ${currentDate}
          `,
            maxSteps: 5,
            temperature: 0.001,
            onStepFinish: async (step) => {
              if (step.toolResults?.length > 0) {
                toolResults += step.toolResults.map((tool: { result: string }) => tool.result).join('\n\n');
              }
            },
          });

          for await (const chunk of textStream) {
            content += chunk;
            enqueue(encodeJsonStringFragment(chunk));
          }

          enqueue('", ');

          const responseContext = await this.streamResponseContext(
            model,
            {
              historyPrompt,
              question,
              currentDate,
              content,
              toolResults,
            },
            enqueue
          );

          controller.close();

          this.updateChatSummary(threadId, { user: question, system: content })
            .then((summary) => this.updateChatSummaryInMongo(threadId, summary))
            .catch((error) => this.logger.error(`Failed to update chat summary for thread ${threadId}:`, error));
          this.persistContextualHistory(
            threadId,
            chatId,
            question,
            content,
            responseContext.sources,
            responseContext.followUpQuestions,
            responseContext.actions
          ).catch((error) => this.logger.error(`Failed to persist chat history for thread ${threadId}:`, error));
        } catch (error) {
          this.logger.error(`Husky search failed for thread ${threadId}, chat ${chatId}:`, error);
          controller.error(error);
        }
      },
    });

    return stream;
  }

  /**
   * Streams the structured tail of the response (everything after `content`).
   * The model's JSON is forwarded without its opening brace so it continues the
   * object already opened by the caller. If the structured generation fails, the
   * object is closed with empty fields so the already streamed answer stays valid.
   */
  private async streamResponseContext(
    model: LanguageModel,
    input: { historyPrompt: string; question: string; currentDate: string; content: string; toolResults: string },
    enqueue: (text: string) => void
  ): Promise<HuskyResponseContext> {
    let openingBraceStripped = false;
    try {
      const objectStream = streamObject({
        model,
        schema: HuskyResponseContextSchema,
        system: HUSKY_CONTEXTUAL_TOOLS_STRUCTURED_PROMPT,
        prompt: `
          ${input.historyPrompt}
            - question: ${input.question}
            - currentDate: ${input.currentDate}
            - content: ${input.content}
            - context: ${input.toolResults}
          `,
        temperature: 0.001,
      });
      // The object promise rejects together with the text stream; mark it handled so a
      // stream failure surfaces once, through the catch below, and never as an
      // unhandled rejection.
      const objectPromise = objectStream.object;
      objectPromise.catch(() => undefined);

      for await (const chunk of objectStream.textStream) {
        let text = chunk;
        if (!openingBraceStripped) {
          const braceIndex = text.indexOf('{');
          if (braceIndex === -1) {
            continue;
          }
          text = text.substring(braceIndex + 1);
          openingBraceStripped = true;
        }
        enqueue(text);
      }

      const object = await objectPromise;
      if (!openingBraceStripped) {
        enqueue(`${JSON.stringify(object).substring(1)}`);
      }
      return object;
    } catch (error) {
      this.logger.error('Husky structured response generation failed:', error);
      if (!openingBraceStripped) {
        enqueue(`${JSON.stringify(EMPTY_RESPONSE_CONTEXT).substring(1)}`);
      }
      return EMPTY_RESPONSE_CONTEXT;
    }
  }

  async updateChatSummaryInMongo(threadId: string, summary: string) {
    await this.huskyPersistentDbService.upsertByKeyValue(
      process.env.MONGO_CHATS_SUMMARY_COLLECTION || 'chats_summary',
      'threadId',
      threadId,
      {
        threadId,
        summary,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }
    );
  }

  async persistContextualHistory(
    threadId: string,
    chatId: string,
    question: string,
    response: string | null,
    sources: any[] = [],
    followUpQuestions: any[] = [],
    actions: any[] = []
  ) {
    const doc = await this.huskyPersistentDbService.getDocByKeyValue(
      process.env.MONGO_THREADS_COLLECTION || 'threads',
      'threadId',
      threadId
    );
    if (!doc) {
      const newDoc = {
        threadId,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        contextual: [
          {
            questionId: chatId,
            question,
            response: response || '',
            actions,
            sources,
            createdAt: Date.now(),
            followUpQuestions,
          },
        ],
      };
      await this.huskyPersistentDbService.create(process.env.MONGO_THREADS_COLLECTION || 'threads', newDoc);
    } else {
      const contextual = doc?.contextual || [];
      const updatedContextual = [
        ...contextual,
        {
          questionId: chatId,
          question,
          response: response || '',
          actions,
          sources,
          createdAt: Date.now(),
          followUpQuestions,
        },
      ];

      doc.updatedAt = Date.now();
      doc.contextual = updatedContextual;
      await this.huskyPersistentDbService.updateDocByKeyValue(
        process.env.MONGO_THREADS_COLLECTION || 'threads',
        'threadId',
        threadId,
        doc
      );
    }
  }

  async duplicateThread(threadId: string, email = '', guestUserId?: string) {
    if (email && guestUserId) {
      throw new BadRequestException('You cannot duplicate a thread with both email and guestUserId');
    }
    const threadPromise = this.huskyPersistentDbService.findOneByKeyValue(
      process.env.MONGO_THREADS_COLLECTION || 'threads',
      'threadId',
      threadId
    );
    const summaryPromise = this.huskyPersistentDbService.findOneByKeyValue(
      process.env.MONGO_CHATS_SUMMARY_COLLECTION || 'chats_summary',
      'threadId',
      threadId
    );
    const [thread, summary] = await Promise.all([threadPromise, summaryPromise]);
    if (!thread) {
      throw new NotFoundException('Thread not found');
    }
    if (thread?.email && thread.email !== email) {
      throw new ForbiddenException('You are not authorized to duplicate this thread');
    }

    let memberDetails: any = {};
    if (email) {
      memberDetails = await this.prisma.member.findUnique({
        where: {
          email: email,
        },
        select: {
          name: true,
          image: true,
        },
      });
    }

    if (email && !memberDetails) {
      throw new NotFoundException('Member not found');
    }

    const newThread = {
      threadId: uuidv4(),
      contextual: thread?.contextual,
      title: thread?.title,
      createdFrom: threadId,
      originalThreadId: thread.originalThreadId || thread.threadId,
      originalThreadTitle: thread.originalThreadTitle || thread.title,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      ...(email && { email: email }),
      ...(memberDetails && { memberName: memberDetails?.name, memberImage: memberDetails?.image?.url }),
      ...(guestUserId && { guestUserId: guestUserId }),
    } as { [key: string]: any };

    await this.huskyPersistentDbService.create(process.env.MONGO_THREADS_COLLECTION || 'threads', newThread);

    if (summary) {
      await Promise.all([
        this.huskyPersistentDbService.create(process.env.MONGO_CHATS_SUMMARY_COLLECTION || 'chats_summary', {
          summary: summary?.summary,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          threadId: newThread.threadId,
        }),
        this.huskyCacheDbService.set(`${newThread.threadId}:summary`, summary?.summary),
      ]);
    }

    return {
      threadId: newThread.threadId,
    };
  }

  async deleteThreadEmail(threadId: string, email: string) {
    const thread = await this.huskyPersistentDbService.findOneByKeyValue(
      process.env.MONGO_THREADS_COLLECTION || 'threads',
      'threadId',
      threadId
    );
    if (!thread) {
      throw new NotFoundException('Thread not found');
    }
    if (thread?.email !== email) {
      throw new ForbiddenException('You are not authorized to delete this thread');
    }
    await this.huskyPersistentDbService.deleteDocByKeyValue(
      process.env.MONGO_THREADS_COLLECTION || 'threads',
      'threadId',
      threadId
    );
  }

  async updateChatSummary(chatId: string, rawChatHistory: any) {
    const previousSummary = await this.huskyCacheDbService.get(`${chatId}:summary`);

    // Define a maximum length for the summary
    const maxLength = 500; // Adjust this value as needed

    const aiPrompt = Handlebars.compile(HUSKY_CHAT_SUMMARY_SYSTEM_PROMPT)({
      previousChatHistory: previousSummary || '',
      question: rawChatHistory.user,
      response: rawChatHistory.system,
      maxLength,
    });

    const { text } = await generateText({
      model: this.getModel(),
      prompt: aiPrompt,
    });
    await this.huskyCacheDbService.set(`${chatId}:summary`, text);
    return text;
  }

  async createThread(threadId: string, email: string) {
    return await this.huskyPersistentDbService.create(process.env.MONGO_THREADS_COLLECTION || 'threads', {
      threadId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      title: '',
      contextual: [],
      ...(email && { email: email }),
    });
  }

  async createThreadBasicInfo(threadId: string, question: string, email = '') {
    const thread = await this.huskyPersistentDbService.findOneByKeyValue(
      process.env.MONGO_THREADS_COLLECTION || 'threads',
      'threadId',
      threadId
    );
    if (!thread) {
      throw new NotFoundException('Thread not found');
    }
    if (email && thread?.email !== email) {
      throw new ForbiddenException('You are not authorized to update this thread');
    }
    let memberDetails: any = {};
    if (email) {
      memberDetails = await this.prisma.member.findUnique({
        where: {
          email: email,
        },
        select: {
          name: true,
          image: true,
        },
      });
    }
    if (email && !memberDetails) {
      throw new NotFoundException('Member not found');
    }

    const prompt = Handlebars.compile(PROMPT_FOR_GENERATE_TITLE)({
      question: question,
    });
    const { text } = await generateText({
      model: this.getModel(),
      prompt: prompt,
    });
    const createdTitle = text || '';
    await this.huskyPersistentDbService.updateByKeyValue(
      process.env.MONGO_THREADS_COLLECTION || 'threads',
      'threadId',
      threadId,
      {
        ...(memberDetails && { memberName: memberDetails?.name, memberImage: memberDetails?.image?.url }),
        title: createdTitle,
      }
    );
  }

  async getThreadsByEmail(email: string) {
    try {
      const threads = await this.huskyPersistentDbService.findByKeyValue(
        process.env.MONGO_THREADS_COLLECTION || 'threads',
        'email',
        email
      );
      return threads
        .filter((thread) => thread?.title?.length > 0)
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .map((thread) => ({
          threadId: thread?.threadId,
          title: thread?.title,
          createdAt: thread?.createdAt,
          updatedAt: thread?.updatedAt,
        }));
    } catch (error) {
      this.logger.error(`Failed to get threads for email ${email}:`, error);
      throw new Error(`Failed to retrieve threads: ${error.message}`);
    }
  }

  async getThreadById(threadId: string, email = '') {
    const threadPromise = this.huskyPersistentDbService.findOneByKeyValue(
      process.env.MONGO_THREADS_COLLECTION || 'threads',
      'threadId',
      threadId
    );
    const summaryPromise = this.huskyPersistentDbService.findOneByKeyValue(
      process.env.MONGO_CHATS_SUMMARY_COLLECTION || 'chats_summary',
      'threadId',
      threadId
    );

    const [thread, summaryData] = await Promise.all([threadPromise, summaryPromise]);
    if (!thread) {
      throw new NotFoundException('Thread not found');
    }

    if (thread?.email && thread.email !== email) {
      throw new NotFoundException('Thread not found');
    }

    if (summaryData) {
      this.huskyCacheDbService.set(`${threadId}:summary`, summaryData?.summary);
    }

    const chats = thread?.contextual || [];
    return {
      chats: chats.sort((a, b) => a.createdAt - b.createdAt),
      threadId: thread?.threadId,
      title: thread?.title,
      memberName: thread?.memberName,
      memberImage: thread?.memberImage,
      isOwner: thread?.email === email && email !== '',
      ...(thread?.guestUserId && { guestUserId: thread?.guestUserId }),
    };
  }
}
