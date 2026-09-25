import { ForbiddenException, Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { RedisCacheDbService } from './db/redis-cache-db.service';
import { MongoPersistantDbService } from './db/mongo-persistant-db.service';
import { LogService } from '../shared/log.service';
import { generateText, LanguageModel, streamObject, streamText } from 'ai';
import { HuskyChatInterface, HuskyResponseContextSchema, HuskySourceRef } from 'libs/contracts/src/schema/husky-chat';
import {
  HUSKY_CHAT_SUMMARY_SYSTEM_PROMPT,
  PROMPT_FOR_GENERATE_TITLE,
  HUSKY_CONTEXTUAL_TOOLS_SYSTEM_PROMPT,
  HUSKY_CONTEXTUAL_TOOLS_STRUCTURED_PROMPT,
  HUSKY_CONTEXTUAL_TOOLS_CONTINUATION_PROMPT,
} from '../utils/ai-prompts';
import Handlebars from 'handlebars';
import { PrismaService } from '../shared/prisma.service';
import { resolveLiveMemberUidByEmail } from '../shared/resolve-live-member-uid.util';
import { v4 as uuidv4 } from 'uuid';
import { HuskyAiToolsService } from './tools/husky-ai-tools.serivice';
import { HuskyAuthContext } from './tools/husky-auth-context';
import { AiProviderService, AiProviderType } from '../shared/ai-provider.service';
import { StallWatchdog } from './stall-watchdog';
import { MAX_OVERLAP_CHARS, trimRepeatedPrefix } from './answer-continuation.util';
import { buildSourceRefs } from './source-refs';
import { z } from 'zod';

/**
 * Provider selection for Husky AI search (chat answers, chat summaries, thread titles).
 * Set HUSKY_SEARCH_AI_PROVIDER=gemini|anthropic|openai to switch; defaults to Gemini
 * regardless of the global AI_PROVIDER.
 */
export const HUSKY_SEARCH_PROVIDER_ENV_VAR = 'HUSKY_SEARCH_AI_PROVIDER';
export const HUSKY_SEARCH_FALLBACK_PROVIDER: AiProviderType = 'gemini';

/** `true` (any case) runs Husky search answers on Opus. Anything else keeps the current provider. */
export const HUSKY_SEARCH_OPUS_ENABLED_ENV_VAR = 'HUSKY_SEARCH_OPUS_ENABLED';
/** Optional slug override. Defaults to claude-opus-5-5. Does not change CLAUDE_MODEL. */
export const HUSKY_SEARCH_OPUS_MODEL_ENV_VAR = 'HUSKY_SEARCH_OPUS_MODEL';
export const DEFAULT_HUSKY_SEARCH_OPUS_MODEL = 'claude-opus-5-5';

/**
 * Longest silence tolerated from the model before its stream is aborted and the
 * response is closed with whatever has been generated so far. Set
 * HUSKY_SEARCH_STALL_TIMEOUT_MS to override.
 */
export const HUSKY_SEARCH_STALL_TIMEOUT_ENV_VAR = 'HUSKY_SEARCH_STALL_TIMEOUT_MS';
export const DEFAULT_HUSKY_SEARCH_STALL_TIMEOUT_MS = 30_000;

/** Appended to an answer that stayed incomplete after the one continuation attempt. */
export const HUSKY_SEARCH_STALLED_NOTICE =
  '\n\n_The answer was cut short because the AI provider stopped responding. Please try again._';

/**
 * How the answer text is generated: from scratch with the directory tools, or as
 * the continuation of an interrupted answer from the tool results already gathered.
 */
type AnswerMode = { kind: 'initial' } | { kind: 'continuation'; partialAnswer: string; toolResults: string };

interface AnswerInput {
  historyPrompt: string;
  question: string;
  currentDate: string;
}

interface AnswerResult {
  text: string;
  toolResults: string;
  /** True when the model ended the answer itself (finish reason `stop`). */
  complete: boolean;
  reason: string;
}

type HuskyResponseContext = z.infer<typeof HuskyResponseContextSchema>;
type HuskyStoredContext = HuskyResponseContext & { sourceRefs?: HuskySourceRef[] };

const EMPTY_RESPONSE_CONTEXT: HuskyResponseContext = { followUpQuestions: [], sources: [], actions: [] };

/** Shown before any directory tool has returned. */
const UNDERSTANDING_STEP = 'Understanding your question';
/** Shown once the lookups are done and the answer text is about to start. */
const WRITING_STEP = 'Writing the answer';

/**
 * How to count a tool's text result. The marker is the row prefix that tool
 * already writes; a sentence result ("No … found", "unavailable") has none.
 */
const TOOL_STATUS: Record<string, { marker: string; singular: string; plural: string }> = {
  getMembers: { marker: 'Member ID:', singular: 'member', plural: 'members' },
  getTeams: { marker: 'Team ID:', singular: 'team', plural: 'teams' },
  getProjects: { marker: 'Project ID:', singular: 'project', plural: 'projects' },
  getIrlEvents: { marker: 'Event ID:', singular: 'event', plural: 'events' },
  getForumPosts: { marker: '[ForumLink](', singular: 'forum post', plural: 'forum posts' },
  getInvestors: { marker: 'Investor:', singular: 'investor', plural: 'investors' },
  getJobOpenings: { marker: '[JobLink](', singular: 'job opening', plural: 'job openings' },
  getTeamNews: { marker: '[NewsLink](', singular: 'news item', plural: 'news items' },
  getDemoDayTeams: { marker: '[TeamLink](', singular: 'team', plural: 'teams' },
  getAsks: { marker: 'Ask ID:', singular: 'ask', plural: 'asks' },
  getFocusAreas: { marker: 'Focus Area ID:', singular: 'focus area', plural: 'focus areas' },
};

function searchingLineForTool(toolName: string): string | null {
  const spec = TOOL_STATUS[toolName];
  return spec ? `Searching ${spec.plural}` : null;
}

function statusLineForTool(toolName: string, result: string): string | null {
  const spec = TOOL_STATUS[toolName];
  if (!spec) return null;
  const count = result.split(spec.marker).length - 1;
  if (count <= 0) return `No ${spec.plural} found`;
  if (count === 1) return `Found 1 ${spec.singular}`;
  return `Found ${count} ${spec.plural}`;
}

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

  private isOpusEnabled(): boolean {
    return process.env[HUSKY_SEARCH_OPUS_ENABLED_ENV_VAR]?.trim().toLowerCase() === 'true';
  }

  /** Opus rejects `temperature`; other search models keep the near-deterministic setting. */
  private searchCallOptions(): { temperature?: number } {
    return this.isOpusEnabled() ? {} : { temperature: 0.001 };
  }

  /** Search answers and the structured tail. Summaries and titles stay on getModel(). */
  private getSearchModel(): LanguageModel {
    if (!this.isOpusEnabled()) {
      return this.getModel();
    }
    return this.aiProvider.getResponsesModel(undefined, {
      useSearchGrounding: false,
      providerOverride: 'anthropic',
      modelOverride: process.env[HUSKY_SEARCH_OPUS_MODEL_ENV_VAR] || DEFAULT_HUSKY_SEARCH_OPUS_MODEL,
    });
  }

  private getStallTimeoutMs(): number {
    const configured = Number(process.env[HUSKY_SEARCH_STALL_TIMEOUT_ENV_VAR]);
    return Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_HUSKY_SEARCH_STALL_TIMEOUT_MS;
  }

  /**
   * Streams a JSON object `{ content, followUpQuestions, sources, sourceRefs, actions }`
   * in two phases so the client can render the answer while the structured data is
   * still being generated:
   *   1. the answer text, produced with the directory database tools, streamed
   *      into the `content` string;
   *   2. sources / follow-up questions / actions, plus sourceRefs built from tool
   *      markers, sent once that call finishes.
   * Each phase runs under a stall watchdog: if the model stops sending chunks, its
   * request is aborted so the client always sees the stream end. An answer that is
   * cut off (stall, token limit, content filter) is continued once from where it
   * stopped before the structured tail is generated.
   */
  async createContextualToolsResponse(chatInfo: HuskyChatInterface, isLoggedIn: boolean, userEmail?: string) {
    const { question, threadId, chatId, chatSummary } = chatInfo;
    const currentDate = new Date().toISOString().split('T')[0];
    const auth = await this.resolveAuthContext(isLoggedIn, userEmail);

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
    const model = this.getSearchModel();

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start: async (controller) => {
        const enqueue = (text: string) => controller.enqueue(encoder.encode(text));

        let content = '';
        try {
          // Status lines stream as a JSON array ahead of `content`, so the client
          // can show the latest one during the tool phase. Closed on the first
          // answer character; a late tool finish must not write into that string.
          let stepsOpen = true;
          let stepCount = 0;
          const pushStep = (label: string) => {
            if (!stepsOpen) return;
            enqueue(`${stepCount ? ', ' : ''}${JSON.stringify(label)}`);
            stepCount += 1;
          };
          const emitText = (fragment: string) => {
            if (!fragment) return;
            if (stepsOpen) {
              pushStep(WRITING_STEP);
              stepsOpen = false;
              enqueue('], "content": "');
            }
            enqueue(fragment);
          };

          enqueue('{ "steps": [');
          pushStep(UNDERSTANDING_STEP);

          const input: AnswerInput = { historyPrompt, question, currentDate };
          const answer = await this.streamAnswer(model, auth, input, { kind: 'initial' }, emitText, pushStep);
          content = answer.text;
          let toolResults = answer.toolResults;

          if (!answer.complete) {
            this.logger.error(
              `Husky answer for thread ${threadId}, chat ${chatId} was cut off after ${content.length} chars (${answer.reason}); continuing once`
            );
            // Nothing reached the client yet and no context was gathered: start over.
            // Otherwise complete the visible text from the context already in hand.
            const mode: AnswerMode =
              content || toolResults
                ? { kind: 'continuation', partialAnswer: content, toolResults }
                : { kind: 'initial' };
            const continuation = await this.streamAnswer(model, auth, input, mode, emitText, pushStep);
            content += continuation.text;
            toolResults += continuation.toolResults;
            if (!continuation.complete) {
              this.logger.error(
                `Husky answer continuation for thread ${threadId}, chat ${chatId} was cut off as well (${continuation.reason})`
              );
              content += HUSKY_SEARCH_STALLED_NOTICE;
              emitText(encodeJsonStringFragment(HUSKY_SEARCH_STALLED_NOTICE));
            }
          }

          if (stepsOpen) {
            stepsOpen = false;
            enqueue('], "content": "');
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
            responseContext.actions,
            responseContext.sourceRefs
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
   * Streams one answer generation, forwarding every chunk to `enqueue` as a JSON
   * string fragment. Returns what was produced and whether the model finished on
   * its own; a stall (see StallWatchdog) or any other finish reason counts as cut
   * off, and the caller decides whether to continue the text.
   */
  private async streamAnswer(
    model: LanguageModel,
    auth: HuskyAuthContext,
    input: AnswerInput,
    mode: AnswerMode,
    enqueue: (text: string) => void,
    pushStep: (label: string) => void
  ): Promise<AnswerResult> {
    const watchdog = new StallWatchdog(this.getStallTimeoutMs());
    let text = '';
    let toolResults = '';
    const emit = (chunk: string) => {
      text += chunk;
      enqueue(encodeJsonStringFragment(chunk));
    };

    // A continuation often restates the line it picks up from. Its opening is held
    // back until it is long enough to compare with the end of the partial answer,
    // then forwarded with any repetition removed.
    const partialAnswer = mode.kind === 'continuation' ? mode.partialAnswer : '';
    const holdBackChars = Math.min(partialAnswer.length, MAX_OVERLAP_CHARS);
    let heldBack = '';
    let opened = holdBackChars === 0;
    const forward = (chunk: string) => {
      if (opened) {
        emit(chunk);
        return;
      }
      heldBack += chunk;
      if (heldBack.length >= holdBackChars) {
        release();
      }
    };
    const release = () => {
      if (opened) {
        return;
      }
      opened = true;
      emit(trimRepeatedPrefix(partialAnswer, heldBack));
    };

    const generation =
      mode.kind === 'initial'
        ? {
            system: HUSKY_CONTEXTUAL_TOOLS_SYSTEM_PROMPT,
            tools: this.huskyAiToolsService.getTools(auth),
            maxSteps: 5,
            prompt: `
          ${input.historyPrompt}
            - question: ${input.question}
            - currentDate: ${input.currentDate}
          `,
          }
        : {
            system: HUSKY_CONTEXTUAL_TOOLS_CONTINUATION_PROMPT,
            prompt: `
          ${input.historyPrompt}
            - question: ${input.question}
            - currentDate: ${input.currentDate}
            - context: ${mode.toolResults}
            - partialAnswer: ${mode.partialAnswer}
          `,
          };

    const result = streamText({
      model,
      ...generation,
      ...this.searchCallOptions(),
      abortSignal: watchdog.signal,
      onStepFinish: async (step) => {
        if (step.toolResults?.length > 0) {
          toolResults += step.toolResults.map((tool: { result: string }) => tool.result).join('\n\n');
          for (const tool of step.toolResults as { toolName?: string; result?: unknown }[]) {
            if (!tool.toolName) continue;
            const line = statusLineForTool(tool.toolName, String(tool.result ?? ''));
            if (line) pushStep(line);
          }
        }
      },
    });

    const announcedTools = new Set<string>();
    const announceSearch = (toolCallId: string, toolName: string) => {
      if (announcedTools.has(toolCallId)) return;
      announcedTools.add(toolCallId);
      const line = searchingLineForTool(toolName);
      if (line) pushStep(line);
    };

    try {
      // fullStream carries the tool-call start, which is the only event that
      // happens while a lookup is still running. textStream is the fallback
      // for tests that only stub the answer text.
      const parts = result.fullStream
        ? result.fullStream
        : (async function* () {
            for await (const textDelta of result.textStream) yield { type: 'text-delta' as const, textDelta };
          })();
      for await (const part of parts) {
        watchdog.touch();
        if (part.type === 'tool-call-streaming-start' || part.type === 'tool-call') {
          announceSearch(part.toolCallId, part.toolName);
        } else if (part.type === 'text-delta') {
          forward(part.textDelta);
        }
      }
      release();
      watchdog.touch();
      const finishReason = await watchdog.race(result.finishReason);
      return { text, toolResults, complete: finishReason === 'stop', reason: `finish reason "${finishReason}"` };
    } catch (error) {
      if (!watchdog.stalled) {
        throw error;
      }
      release();
      return { text, toolResults, complete: false, reason: `no chunk for ${watchdog.timeoutMs}ms` };
    } finally {
      watchdog.stop();
    }
  }

  /**
   * Resolves the directory member behind the signed-in caller so tools can gate
   * their own data by this member's actual permissions (Investor DB access,
   * etc.), not just by whether a session exists. Failure to resolve degrades to
   * "logged in with no member context" rather than blocking the search.
   */
  private async resolveAuthContext(isLoggedIn: boolean, userEmail?: string): Promise<HuskyAuthContext> {
    if (!isLoggedIn || !userEmail) {
      return { isLoggedIn: false };
    }
    try {
      const memberUid = await resolveLiveMemberUidByEmail(this.prisma, userEmail);
      return { isLoggedIn: true, memberUid, email: userEmail };
    } catch (error) {
      this.logger.error(`Failed to resolve member for Husky auth context: ${error?.message ?? error}`);
      return { isLoggedIn: true, email: userEmail };
    }
  }

  /**
   * Builds the structured tail (everything after `content`). The model still fills
   * sources, follow-ups, and actions. sourceRefs are attached from tool markers
   * before the tail is sent, so the client never sees a model-invented list.
   * The tail is one JSON fragment: follow-ups appear when this call finishes.
   * If generation fails or stalls, the object is closed with empty fields so the
   * already streamed answer stays valid.
   */
  private async streamResponseContext(
    model: LanguageModel,
    input: { historyPrompt: string; question: string; currentDate: string; content: string; toolResults: string },
    enqueue: (text: string) => void
  ): Promise<HuskyStoredContext> {
    const watchdog = new StallWatchdog(this.getStallTimeoutMs());
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
        ...this.searchCallOptions(),
        abortSignal: watchdog.signal,
      });
      // The object promise rejects together with the text stream; mark it handled so a
      // stream failure surfaces once, through the catch below, and never as an
      // unhandled rejection.
      const objectPromise = objectStream.object;
      objectPromise.catch(() => undefined);

      for await (const chunk of objectStream.textStream) {
        watchdog.touch();
        void chunk;
      }

      // The object promise settles from the stream's own finish, which an aborted
      // stream never reaches, so it is raced against the watchdog as well.
      watchdog.touch();
      const object = await watchdog.race(objectPromise);
      const payload = this.withSourceRefs(object, input);
      enqueue(JSON.stringify(payload).substring(1));
      return payload;
    } catch (error) {
      if (watchdog.stalled) {
        this.logger.error(`Husky structured response generation stalled: no chunk for ${watchdog.timeoutMs}ms`);
      } else {
        this.logger.error('Husky structured response generation failed:', error);
      }
      const payload = this.withSourceRefs(EMPTY_RESPONSE_CONTEXT, input);
      enqueue(JSON.stringify(payload).substring(1));
      return payload;
    } finally {
      watchdog.stop();
    }
  }

  private withSourceRefs(
    context: HuskyResponseContext,
    input: { content: string; toolResults: string }
  ): HuskyStoredContext {
    const { sourceRefs, mismatches } = buildSourceRefs({
      content: input.content,
      toolResults: input.toolResults,
      llmSources: context.sources,
    });
    for (const mismatch of mismatches) {
      this.logger.info(`Husky source ref: ${mismatch}`);
    }
    return sourceRefs.length ? { ...context, sourceRefs } : context;
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
    actions: any[] = [],
    sourceRefs?: HuskySourceRef[]
  ) {
    const turn = {
      questionId: chatId,
      question,
      response: response || '',
      actions,
      sources,
      createdAt: Date.now(),
      followUpQuestions,
      ...(sourceRefs?.length ? { sourceRefs } : {}),
    };
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
        contextual: [turn],
      };
      await this.huskyPersistentDbService.create(process.env.MONGO_THREADS_COLLECTION || 'threads', newDoc);
    } else {
      const contextual = doc?.contextual || [];
      const updatedContextual = [...contextual, turn];

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
