import { ForbiddenException, Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { RedisCacheDbService } from './db/redis-cache-db.service';
import { MongoPersistantDbService } from './db/mongo-persistant-db.service';
import { LogService } from '../shared/log.service';
import { logSafeError } from './log-safe-error.util';
import { CoreTool, generateText, LanguageModel, streamObject, streamText } from 'ai';
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
import { AiProviderService } from '../shared/ai-provider.service';
import { StallWatchdog } from './stall-watchdog';
import { AnswerOverride } from './answer-override.util';
import { MAX_OVERLAP_CHARS, trimRepeatedPrefix } from './answer-continuation.util';
import { buildSourceRefs } from './source-refs';
import { textPartBreak } from './text-parts.util';
import { z } from 'zod';

import {
  HUSKY_SEARCH_FALLBACK_PROVIDER,
  HUSKY_SEARCH_OPUS_ENABLED_ENV_VAR,
  HUSKY_SEARCH_PROVIDER_ENV_VAR,
} from './husky-search.constants';

export { HUSKY_SEARCH_FALLBACK_PROVIDER, HUSKY_SEARCH_OPUS_ENABLED_ENV_VAR, HUSKY_SEARCH_PROVIDER_ENV_VAR };

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

/**
 * LAB-3367 i1: the longest wait for one latest reply cache step (the read and the clear together, the write, or the
 * clear after a cancel). After it the turn goes on as if the step failed. The wait ends, but the Redis command is not
 * cancelled and can still run later.
 */
export const LATEST_REPLY_CACHE_TIMEOUT_MS = 1_000;

/** LAB-3367 F3: the `latestReply` prompt value when the latest reply is not known. A stored reply is JSON text. */
/** LAB-3367 F5: the plain label of the latest reply line in the C1 answer prompt. It is not a field name to quote. */
export const LATEST_REPLY_LABEL = 'Previous reply';
export const LATEST_REPLY_UNKNOWN = 'not available';

/** Appended to an answer that stayed incomplete after the one continuation attempt. */
export const HUSKY_SEARCH_STALLED_NOTICE =
  '\n\n_The answer was cut short because the AI provider stopped responding. Please try again._';

/**
 * How the answer text is generated: from scratch with the directory tools, or as
 * the continuation of an interrupted answer from the tool results already gathered.
 */
type AnswerMode = { kind: 'initial' } | { kind: 'continuation'; partialAnswer: string; toolResults: string };

interface AnswerInput {
  /** The chat history line, plus the `latestReply` line when `ContextualToolsOptions.latestReplyKey` is set. */
  historyPrompt: string;
  question: string;
  currentDate: string;
  /** Prompt lines from ContextualToolsOptions.promptContext, or ''. */
  pageContext: string;
  /** ContextualToolsOptions.answerInstructions, or ''. It goes at the end of the system message (LAB-3367 k7). */
  answerInstructions: string;
  /** LAB-3367 K3: a fixed answer from `latestReplyTurn`. The answer then runs no model call and no tool. */
  fixedAnswer?: string;
}

/** LAB-3367: the options that `ContextualToolsOptions.latestReplyTurn` can replace for one turn. */
export type LatestReplyTurn = Partial<
  Pick<ContextualToolsOptions, 'promptContext' | 'extraTools' | 'answerLine' | 'answerInstructions'>
> & {
  /** A fixed answer for this turn. The turn then runs no model call and no tool, and the tail has no follow-ups. */
  fixedAnswer?: string;
  /** LAB-3367 G7: true to send no `Previous reply` line in the answer prompt of this turn. */
  omitLatestReply?: boolean;
  /**
   * LAB-3367 w1: true to send no chat history (the thread summary) in the answer, the continuation and the structured
   * tail of this turn. So a recovery turn cannot use an older request.
   */
  omitHistory?: boolean;
};

/**
 * Optional extension point for callers other than AI search (the LabOS agent, LAB-3298).
 * AI search passes nothing and keeps its behavior.
 */
export interface ContextualToolsOptions {
  /** Extra prompt lines for every model call, for example the page the member is on. */
  promptContext?: string;
  /** Extra tools for the answer model, next to the AI search tools. */
  extraTools?: Record<string, CoreTool>;
  /** Extra fields added to the end of the streamed JSON object, for example `proposals`. */
  extraResponseFields?: Record<string, unknown>;
  /**
   * LAB-3362 D4: while this gives a line, the stream drops the model text. When the turn ends and it still gives the
   * line, the stream adds the line, so the line goes out only with a draft card. The LabOS agent uses it for an intro
   * draft. AI search passes nothing.
   */
  answerLine?: () => string | undefined;
  /** False: keep the thread summary in the cache only, and write nothing to MongoDB. Default true. */
  persistHistory?: boolean;
  /**
   * LAB-3367 h3: the cache key of the latest reply, for the LabOS agent only. The caller scopes the key (member and
   * thread). With a key, the stream reads the value into the answer prompt as the line
   * `Previous reply` (`LATEST_REPLY_LABEL`; `not available` when empty, LAB-3367 F3, F5), then writes `''` before
   * the stream starts. Before the stream closes, it writes the reply of this turn: only the answer line for a turn
   * with that line, else the answer text. A failed, cancelled or still cut-off turn writes nothing, so the key stays
   * `''`. A cache error does not stop the turn. AI search passes nothing.
   */
  latestReplyKey?: string;
  /**
   * LAB-3367 k2, k7: extra text for the system message of the answer call and of the continuation, after the shared
   * prompt. The structured tail call does not get it. Give only fixed rules, never member or card text. The LabOS
   * agent uses it for the rules for "your last answer". AI search passes nothing.
   */
  answerInstructions?: string;
  /**
   * LAB-3367 F1, F3, K3: for the LabOS agent only, with `latestReplyKey`. Called once with the latest reply ('' when
   * not known), after the cache read and before the stream starts. The fields it gives replace `promptContext`,
   * `extraTools` and `answerLine` for this turn. A field with the value `undefined` removes that option for the turn.
   * Give no member text in log lines. AI search passes nothing.
   */
  latestReplyTurn?: (latestReply: string) => LatestReplyTurn;
  /**
   * LAB-3367: with `latestReplyKey`, a fixed line (the LabOS agent draft line). When the model text of a turn with no
   * answer line is the same as this line, the stream stores '' (not known), so a model echo never looks like a draft
   * turn. AI search passes nothing.
   */
  reservedReply?: string;
  /**
   * LAB-3367 t7b: with `reservedReply`, other forms of that line, for example "Here’s" for "Here is". The stream
   * removes these forms and the line, also in bold, from the model text of a turn with no answer line.
   */
  reservedReplyForms?: string[];
  /**
   * LAB-3367 t1: with `reservedReply`, a fixed line for a turn with no answer line and no text after trim, for example
   * when the stream removed the reserved line. The latest reply stays '' (not known). AI search passes nothing.
   */
  emptyReplyLine?: string;
  /**
   * LAB-3367 G3: with `reservedReply`, the bare words for the `Previous reply` line when the stored reply is that line
   * (for example `an intro draft card`). The model then cannot quote the line. AI search passes nothing.
   */
  reservedReplyLabel?: string;
  /**
   * Extra fields for the end of the streamed JSON object that need the finished turn, for example the answer counts
   * of the LabOS agent (LAB-3297). Called once, after `extraResponseFields`. A field with the key of a tail field
   * replaces it in the body, for example the agent `sources` (LAB-3362 D2). AI search passes nothing.
   */
  turnFields?: (turn: ContextualTurnSummary) => Record<string, unknown>;
}

/** What the finished turn did, for `ContextualToolsOptions.turnFields`. */
export interface ContextualTurnSummary {
  /** The name of each tool call of the answer model in the turn, in order. One entry for each call. */
  toolNames: string[];
  /** The `sources` of the tail. */
  sources: string[];
  /** The `sourceRefs` of the tail. */
  sourceRefs: HuskySourceRef[];
}

interface AnswerResult {
  text: string;
  toolResults: string;
  /** True when the model ended the answer itself (finish reason `stop`). */
  complete: boolean;
  reason: string;
  /** The name of each tool call in the finished steps of this generation. */
  toolNames: string[];
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
const TOOL_STATUS: Record<string, { marker: string; singular: string; plural: string; searching?: string }> = {
  getMembers: { marker: 'Member ID:', singular: 'member', plural: 'members' },
  getTeams: { marker: 'Team ID:', singular: 'team', plural: 'teams' },
  getProjects: { marker: 'Project ID:', singular: 'project', plural: 'projects' },
  getIrlEvents: { marker: 'Event ID:', singular: 'event', plural: 'events' },
  getForumPosts: { marker: '[ForumLink](', singular: 'forum post', plural: 'forum posts' },
  getInvestorProfiles: { marker: 'Investor:', singular: 'investor profile', plural: 'investor profiles' },
  getInvestorDb: { marker: 'Investor DB record:', singular: 'Investor DB record', plural: 'Investor DB records' },
  getWarmIntros: { marker: 'Warm intro:', singular: 'warm intro', plural: 'warm intros' },
  getJobOpenings: { marker: '[JobLink](', singular: 'job opening', plural: 'job openings' },
  getTeamNews: { marker: '[NewsLink](', singular: 'news item', plural: 'news items' },
  getDemoDayTeams: { marker: '[TeamLink](', singular: 'team', plural: 'teams' },
  getAsks: { marker: 'Ask ID:', singular: 'ask', plural: 'asks' },
  getFocusAreas: { marker: 'Focus Area ID:', singular: 'focus area', plural: 'focus areas' },
  searchWeb: { marker: '[WebLink](', singular: 'web page', plural: 'web pages', searching: 'Searching the web' },
};

function searchingLineForTool(toolName: string): string | null {
  const spec = TOOL_STATUS[toolName];
  if (!spec) return null;
  return spec.searching ?? `Searching ${spec.plural}`;
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
  async createContextualToolsResponse(
    chatInfo: HuskyChatInterface,
    isLoggedIn: boolean,
    userEmail?: string,
    options: ContextualToolsOptions = {}
  ) {
    const { question, threadId, chatId, chatSummary } = chatInfo;
    const persistHistory = options.persistHistory !== false;
    const { turnFields } = options;
    const currentDate = new Date().toISOString().split('T')[0];
    const auth = await this.resolveAuthContext(isLoggedIn, userEmail);

    // A conversation started elsewhere (e.g. a blog embed) is handed over with its
    // first exchange so the thread keeps that context.
    if (chatSummary && persistHistory) {
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
    const threadHistoryPrompt = chatSummaryFromDb ? ` - chatHistory: ${chatSummaryFromDb}` : '';
    const { latestReplyKey } = options;
    const latestReply = latestReplyKey ? await this.takeLatestReply(latestReplyKey) : '';
    // LAB-3367 F1, F3, K3: the caller can change the prompt context, the extra tools and the answer line of this turn
    // from the latest reply. It runs once, before the stream starts. AI search passes nothing.
    const turn: ContextualToolsOptions & LatestReplyTurn = options.latestReplyTurn
      ? { ...options, ...options.latestReplyTurn(latestReply) }
      : options;
    // LAB-3367 w1: a recovery turn gets no chat history, also in the structured tail.
    const historyPrompt = turn.omitHistory ? '' : threadHistoryPrompt;
    // LAB-3367 F6, t7b: the model text never has the reserved line (the draft line) or its other forms when the turn
    // has no answer line. Only with `reservedReply`, so AI search does not change.
    const override = new AnswerOverride(
      turn.answerLine,
      options.reservedReply ? [options.reservedReply, ...(options.reservedReplyForms ?? [])] : []
    );
    const pageContext = turn.promptContext ? `  - pageContext: ${turn.promptContext}` : '';
    // LAB-3367 F3, F5: with a key, an empty value (a first turn, or a stopped, failed or cut-off turn, or a cache
    // failure) is the bare words `not available`. A stored reply is JSON text, so it is always in quotes.
    // LAB-3367 G3: the stored reserved line is bare words, not the line in quotes. G7: the turn can omit the line.
    const latestReplyValue = !latestReply
      ? LATEST_REPLY_UNKNOWN
      : options.reservedReplyLabel && latestReply === options.reservedReply
      ? options.reservedReplyLabel
      : JSON.stringify(latestReply);
    const answerHistoryPrompt =
      latestReplyKey && !turn.omitLatestReply
        ? `${historyPrompt}\n  - ${LATEST_REPLY_LABEL}: ${latestReplyValue}`
        : historyPrompt;
    const model = this.getSearchModel();

    const encoder = new TextEncoder();
    // LAB-3367 h3: true after the reader cancels the stream, for example when the C1 client disconnects.
    let cancelled = false;
    const stream = new ReadableStream({
      cancel: () => {
        cancelled = true;
      },
      start: async (controller) => {
        const enqueue = (text: string) => controller.enqueue(encoder.encode(text));

        let content = '';
        // LAB-3367 h3: false when the answer stayed cut off after the continuation. Then no latest reply is written.
        let complete = true;
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

          // LAB-3367 F6: the model text that the override held back (a possible start of the reserved line). Called
          // once after all generations, before the stalled notice and the answer line, so the text order stays.
          const flushHeld = () => {
            const held = override.flush();
            if (!held) return;
            content += held;
            emitText(encodeJsonStringFragment(held));
          };

          enqueue('{ "steps": [');
          pushStep(UNDERSTANDING_STEP);

          const input: AnswerInput = {
            historyPrompt: answerHistoryPrompt,
            question,
            currentDate,
            pageContext,
            // LAB-3367 G1, G4, G7: `latestReplyTurn` can give other rules for this turn.
            answerInstructions: turn.answerInstructions ?? '',
            fixedAnswer: turn.fixedAnswer,
          };
          const answer = await this.streamAnswer(
            model,
            auth,
            input,
            { kind: 'initial' },
            emitText,
            pushStep,
            turn.extraTools,
            override
          );
          content = answer.text;
          let toolResults = answer.toolResults;
          const toolNames = [...answer.toolNames];

          // LAB-3362 D4: with the answer line on, more model text is dropped, so a cut-off answer is not continued.
          if (!answer.complete && !override.isOn()) {
            this.logger.error(
              `Husky answer for thread ${threadId}, chat ${chatId} was cut off after ${content.length} chars (${answer.reason}); continuing once`
            );
            // Nothing reached the client yet and no context was gathered: start over.
            // Otherwise complete the visible text from the context already in hand.
            // LAB-3367 t7a: the text that the override holds back is part of the answer so far. The continuation
            // repeats nothing of it: its opening is compared with this partial answer, and the held text goes first.
            const partialAnswer = content + override.held();
            const mode: AnswerMode =
              partialAnswer || toolResults ? { kind: 'continuation', partialAnswer, toolResults } : { kind: 'initial' };
            const continuation = await this.streamAnswer(
              model,
              auth,
              input,
              mode,
              emitText,
              pushStep,
              turn.extraTools,
              override
            );
            content += continuation.text;
            // LAB-3367 F6: flush after the continuation, not between the generations, so the line cannot form across them.
            flushHeld();
            toolResults += continuation.toolResults;
            toolNames.push(...continuation.toolNames);
            if (!continuation.complete) {
              this.logger.error(
                `Husky answer continuation for thread ${threadId}, chat ${chatId} was cut off as well (${continuation.reason})`
              );
              complete = false;
              content += HUSKY_SEARCH_STALLED_NOTICE;
              emitText(encodeJsonStringFragment(HUSKY_SEARCH_STALLED_NOTICE));
            }
          }

          flushHeld();
          // LAB-3362 D4: the line goes out only now, when the turn still has the draft card.
          const lastLine = override.finish(content);
          if (lastLine) {
            content += lastLine;
            emitText(encodeJsonStringFragment(lastLine));
          }
          // LAB-3367 t1: with `reservedReply` only, a turn with no draft and no text (for example the model wrote only
          // the draft line, also after a refused draft tool) gets `emptyReplyLine`. The latest reply stays not known.
          // G3: the stream holds a first text with no letter or digit, and drops it when the filter removed a line.
          const emptyAnswer =
            !lastLine &&
            Boolean(options.reservedReply) &&
            turn.fixedAnswer === undefined &&
            (!content.trim() || (override.removedLine() && !/[\p{L}\p{N}]/u.test(content)));
          if (emptyAnswer && options.emptyReplyLine) {
            content += options.emptyReplyLine;
            emitText(encodeJsonStringFragment(options.emptyReplyLine));
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
              pageContext,
              fixed: turn.fixedAnswer !== undefined,
            },
            enqueue,
            options.extraResponseFields,
            turnFields ? (payload) => turnFields(turnSummary(toolNames, payload)) : undefined,
            // LAB-3367 i5: a client stop during the tail is not a tail failure, so it gets no log line.
            () => Boolean(latestReplyKey) && cancelled
          );

          // LAB-3367 h3: write before close, so the next C1 turn can read the reply as soon as the client sees the end.
          // A draft turn stores only the answer line, never the draft text. A cut-off or cancelled turn stores nothing.
          if (latestReplyKey && cancelled) return;
          if (latestReplyKey && complete) {
            // LAB-3367: model text that is the same as `reservedReply` is not that line, so it is stored as not known.
            const reply = lastLine ? lastLine.trim() : content;
            // F6, t1: the stream removed the line from the model text, so text with nothing more is also not known.
            const reserved =
              !lastLine && Boolean(options.reservedReply) && (emptyAnswer || content.trim() === options.reservedReply);
            await this.saveLatestReply(latestReplyKey, reserved ? '' : reply);
            // A cancel during the write: the client gets no end, so the reply is not latest. Clear it again and do not
            // close the cancelled stream. No await comes between this check and `controller.close()`.
            if (cancelled) {
              await this.saveLatestReply(latestReplyKey, '', 'clear');
              return;
            }
          }

          controller.close();

          // LAB-3367 K3: a fixed answer runs no summary model call and keeps the earlier summary.
          if (turn.fixedAnswer !== undefined) return;
          this.updateChatSummary(threadId, { user: question, system: content })
            .then((summary) => (persistHistory ? this.updateChatSummaryInMongo(threadId, summary) : undefined))
            .catch((error) =>
              this.logger.error(`Failed to update chat summary for thread ${threadId}: ${logSafeError(error)}`)
            );
          if (!persistHistory) return;
          this.persistContextualHistory(
            threadId,
            chatId,
            question,
            content,
            responseContext.sources,
            responseContext.followUpQuestions,
            responseContext.actions,
            responseContext.sourceRefs
          ).catch((error) =>
            this.logger.error(`Failed to persist chat history for thread ${threadId}: ${logSafeError(error)}`)
          );
        } catch (error) {
          if (latestReplyKey && cancelled) return;
          // LAB-3362: log the name, status and message only. The error can hold the whole prompt. A tool name is
          // logged only when it is one of the caller's extra tools (for example draft_intro).
          this.logger.error(
            `Husky search failed for thread ${threadId}, chat ${chatId}: ${logSafeError(
              error,
              Object.keys(turn.extraTools ?? {})
            )}`
          );
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
    pushStep: (label: string) => void,
    extraTools?: Record<string, CoreTool>,
    override?: AnswerOverride
  ): Promise<AnswerResult> {
    if (input.fixedAnswer !== undefined) {
      enqueue(encodeJsonStringFragment(input.fixedAnswer));
      return { text: input.fixedAnswer, toolResults: '', complete: true, reason: 'fixed', toolNames: [] };
    }
    const watchdog = new StallWatchdog(this.getStallTimeoutMs());
    let text = '';
    let toolResults = '';
    const toolNames: string[] = [];
    const emit = (chunk: string) => {
      const out = override
        ? override.filter(chunk, (mode.kind === 'continuation' ? mode.partialAnswer : '') + text)
        : chunk;
      if (!out) return;
      text += out;
      enqueue(encodeJsonStringFragment(out));
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
            system: withAnswerInstructions(HUSKY_CONTEXTUAL_TOOLS_SYSTEM_PROMPT, input.answerInstructions),
            tools: { ...this.huskyAiToolsService.getTools(auth), ...extraTools },
            maxSteps: 5,
            prompt: `
          ${input.historyPrompt}
            - question: ${input.question}
            - currentDate: ${input.currentDate}
          ${input.pageContext}
          `,
          }
        : {
            system: withAnswerInstructions(HUSKY_CONTEXTUAL_TOOLS_CONTINUATION_PROMPT, input.answerInstructions),
            prompt: `
          ${input.historyPrompt}
            - question: ${input.question}
            - currentDate: ${input.currentDate}
            - context: ${mode.toolResults}
            - partialAnswer: ${mode.partialAnswer}
          ${input.pageContext}
          `,
          };
    // LAB-3362: the tools of this call. A tool argument error log names only one of these.
    const callToolNames = Object.keys((generation as { tools?: Record<string, CoreTool> }).tools ?? {});

    const result = streamText({
      model,
      ...generation,
      ...this.searchCallOptions(),
      abortSignal: watchdog.signal,
      onStepFinish: async (step) => {
        // LAB-3297: one entry for each tool call of the step. A step without `toolCalls` counts its tool results.
        const calls = (step.toolCalls ?? step.toolResults ?? []) as { toolName?: string }[];
        toolNames.push(...calls.map((call) => call.toolName ?? ''));
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

    // LAB-3362 D3: the text of the model before and after a tool call are two text parts. `written` is the text of
    // this generation so far; after a tool call, the next text part starts with `textPartBreak`. The deltas of one
    // text part get no break.
    let written = '';
    let toolSinceText = false;
    const forwardText = (delta: string) => {
      if (!delta) return;
      const gap = toolSinceText ? textPartBreak(written, delta) : '';
      toolSinceText = false;
      written += gap + delta;
      forward(gap + delta);
    };

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
          toolSinceText = true;
        } else if (part.type === 'text-delta') {
          forwardText(part.textDelta);
        } else if (part.type === 'error') {
          // The provider error (quota, auth, 5xx) ends the stream with finish reason
          // "unknown". Log it, or the cut-off log line is the only trace. LAB-3362: only the safe fields, because a
          // tool argument error has the model input (for example a draft_intro text) in its message. A tool
          // name is logged only when it is a tool of this call.
          this.logger.error(`Husky answer stream provider error: ${logSafeError(part.error, callToolNames)}`);
        }
      }
      release();
      watchdog.touch();
      const finishReason = await watchdog.race(result.finishReason);
      return {
        text,
        toolResults,
        complete: finishReason === 'stop',
        reason: `finish reason "${finishReason}"`,
        toolNames,
      };
    } catch (error) {
      if (!watchdog.stalled) {
        throw error;
      }
      release();
      return { text, toolResults, complete: false, reason: `no chunk for ${watchdog.timeoutMs}ms`, toolNames };
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
    input: {
      historyPrompt: string;
      question: string;
      currentDate: string;
      content: string;
      toolResults: string;
      pageContext: string;
      /** LAB-3367 K3: a fixed answer. The tail then runs no model call and has no follow-ups, sources or actions. */
      fixed?: boolean;
    },
    enqueue: (text: string) => void,
    extraResponseFields?: Record<string, unknown>,
    turnFields?: (payload: HuskyStoredContext) => Record<string, unknown>,
    stopped?: () => boolean
  ): Promise<HuskyStoredContext> {
    if (input.fixed) {
      const payload = this.withSourceRefs(EMPTY_RESPONSE_CONTEXT, input);
      enqueue(JSON.stringify({ ...payload, ...extraResponseFields, ...turnFields?.(payload) }).substring(1));
      return payload;
    }
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
          ${input.pageContext}
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
      enqueue(JSON.stringify({ ...payload, ...extraResponseFields, ...turnFields?.(payload) }).substring(1));
      return payload;
    } catch (error) {
      if (stopped?.()) throw error;
      if (watchdog.stalled) {
        this.logger.error(`Husky structured response generation stalled: no chunk for ${watchdog.timeoutMs}ms`);
      } else {
        // LAB-3362: an APICallError (rate limit, 529, 5xx) holds `requestBodyValues`, the whole prompt.
        this.logger.error(`Husky structured response generation failed: ${logSafeError(error)}`);
      }
      const payload = this.withSourceRefs(EMPTY_RESPONSE_CONTEXT, input);
      enqueue(JSON.stringify({ ...payload, ...extraResponseFields, ...turnFields?.(payload) }).substring(1));
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

  /**
   * LAB-3367 h3, i1: the latest reply under `key`, or '' when there is none, the read fails or the step times out. The
   * read and the clear ('') go to the cache client one after the other, with no wait between them. So the clear
   * follows the read in the order of the one Redis connection, and a late read cannot start a clear after a newer
   * turn. The two together wait at most `latestReplyTimeoutMs`. On a timeout the value is not used, because it can be
   * old. The log lines are fixed texts: a Redis error can hold the command arguments, that is, the reply text.
   */
  private async takeLatestReply(key: string): Promise<string> {
    const read = this.latestReplyCall(() => this.huskyCacheDbService.get(key));
    const clear = this.latestReplyCall(() => this.huskyCacheDbService.set(key, ''));
    const settled = await this.withinLatestReplyTimeout(Promise.all([read, clear]));
    if (!settled) {
      this.logger.error('Timed out reading and clearing the latest reply of the LabOS agent thread');
      return '';
    }
    const [value, cleared] = settled;
    if (cleared.failed) this.logger.error('Failed to clear the latest reply of the LabOS agent thread');
    if (value.failed) {
      this.logger.error('Failed to read the latest reply of the LabOS agent thread');
      return '';
    }
    return typeof value.value === 'string' ? value.value : '';
  }

  /**
   * LAB-3367 h3, i1: writes `reply` ('write') or '' after a cancel ('clear'). It waits at most `latestReplyTimeoutMs`.
   * A failure or a timeout is logged with a fixed text and does not stop the turn.
   */
  private async saveLatestReply(key: string, reply: string, step: 'write' | 'clear' = 'write'): Promise<void> {
    const saved = await this.withinLatestReplyTimeout(
      this.latestReplyCall(() => this.huskyCacheDbService.set(key, reply))
    );
    if (!saved) this.logger.error(`Timed out on the ${step} of the latest reply of the LabOS agent thread`);
    else if (saved.failed) this.logger.error(`Failed to ${step} the latest reply of the LabOS agent thread`);
  }

  /** LAB-3367 i1: the wait of one latest reply cache step. A field, so a test can make it short. */
  private latestReplyTimeoutMs = LATEST_REPLY_CACHE_TIMEOUT_MS;

  /** Starts one cache call now. The result never rejects, so a late failure after a timeout is not unhandled. */
  private latestReplyCall<T>(call: () => Promise<T>): Promise<{ failed: false; value: T } | { failed: true }> {
    let started: Promise<T>;
    try {
      started = call();
    } catch {
      return Promise.resolve({ failed: true });
    }
    return Promise.resolve(started).then(
      (value) => ({ failed: false as const, value }),
      () => ({ failed: true as const })
    );
  }

  /** The result of `work`, or undefined after `latestReplyTimeoutMs`. The timer does not keep the process alive. */
  private async withinLatestReplyTimeout<T>(work: Promise<T>): Promise<T | undefined> {
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<undefined>((resolve) => {
      timer = setTimeout(() => resolve(undefined), this.latestReplyTimeoutMs);
      timer.unref?.();
    });
    try {
      return await Promise.race([work, timeout]);
    } finally {
      if (timer) clearTimeout(timer);
    }
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

    const feedbackPromise = this.huskyPersistentDbService.findByKeyValue(
      process.env.MONGO_FEEDBACK_COLLECTION || '',
      'threadId',
      threadId
    );

    const [thread, summaryData, feedback] = await Promise.all([threadPromise, summaryPromise, feedbackPromise]);
    if (!thread) {
      throw new NotFoundException('Thread not found');
    }

    if (thread?.email && thread.email !== email) {
      throw new NotFoundException('Thread not found');
    }

    if (summaryData) {
      this.huskyCacheDbService.set(`${threadId}:summary`, summaryData?.summary);
    }

    const isOwner = thread?.email === email && email !== '';
    const votes = new Map(
      isOwner ? feedback.map((vote) => [vote.questionId, { rating: vote.rating, reasons: vote.reasons }] as const) : []
    );
    const chats = (thread?.contextual || []).map((chat) => ({ ...chat, feedback: votes.get(chat.questionId) }));
    return {
      chats: chats.sort((a, b) => a.createdAt - b.createdAt),
      threadId: thread?.threadId,
      title: thread?.title,
      memberName: thread?.memberName,
      memberImage: thread?.memberImage,
      isOwner,
      ...(thread?.guestUserId && { guestUserId: thread?.guestUserId }),
    };
  }
}

function turnSummary(toolNames: string[], payload: HuskyStoredContext): ContextualTurnSummary {
  return { toolNames, sources: payload.sources ?? [], sourceRefs: payload.sourceRefs ?? [] };
}

/** LAB-3367 k7: the shared system prompt, then the caller's answer instructions. With none, the prompt is unchanged. */
function withAnswerInstructions(system: string, answerInstructions: string): string {
  return answerInstructions ? `${system}\n\n${answerInstructions}` : system;
}
