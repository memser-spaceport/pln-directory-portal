import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { generateObject } from 'ai';
import { AiProviderService } from '../shared/ai-provider.service';
import { LogService } from '../shared/log.service';
import {
  AGENDA_PARSE_SYSTEM_PROMPT,
  agendaParsePrompt,
  AgendaModelOutputSchema,
  AgendaParseResult,
  eventDay,
  toAgendaSessions,
} from './pl-event-agenda';

/** Feature-specific provider override, like the other AI features (`EVENT_AGENDA_PARSE_AI_PROVIDER=gemini`). */
export const EVENT_AGENDA_PARSE_AI_PROVIDER_ENV = 'EVENT_AGENDA_PARSE_AI_PROVIDER';

const LOG_CONTEXT = 'PLEventFormHelpersService';

export type AgendaParseInput = { text: string; startDate: string; endDate: string; timezone: string };

/**
 * Agenda parsing for the event submit form (LAB-3343): pasted agenda text to sessions. The model key stays on the
 * server.
 */
@Injectable()
export class PLEventFormHelpersService {
  constructor(private readonly aiProvider: AiProviderService, private readonly logger: LogService) {}

  /** Agenda text → sessions, or a message that says what is missing. 503 when the model cannot be reached. */
  async parseAgenda(input: AgendaParseInput): Promise<AgendaParseResult> {
    const event = {
      startDay: eventDay(input.startDate, input.timezone),
      endDay: eventDay(input.endDate, input.timezone),
      timezone: input.timezone,
    };
    let output;
    const modelName = this.aiProvider.getModelName(EVENT_AGENDA_PARSE_AI_PROVIDER_ENV);
    try {
      const result = await generateObject({
        model: this.aiProvider.getResponsesModel(EVENT_AGENDA_PARSE_AI_PROVIDER_ENV, { useSearchGrounding: false }),
        schema: AgendaModelOutputSchema,
        system: AGENDA_PARSE_SYSTEM_PROMPT,
        prompt: agendaParsePrompt({ text: input.text, ...event }),
        temperature: 0,
      });
      output = result.object;
    } catch (error) {
      this.logger.error(
        `Agenda parse failed: ${JSON.stringify(agendaErrorFacts(error, modelName))}`,
        undefined,
        LOG_CONTEXT
      );
      throw new ServiceUnavailableException('The agenda could not be read right now. Please try again.');
    }
    return toAgendaSessions(output, event);
  }
}

type ProviderCallError = { statusCode: number; responseBody?: string; isRetryable?: boolean };

const SAFE_TOKEN = /^[A-Za-z0-9_.:-]{1,80}$/;
const safe = (value: unknown) => (typeof value === 'string' && SAFE_TOKEN.test(value) ? value : undefined);

/**
 * What the log keeps of a failed model call (LAB-3443): the model, the error class, the HTTP status and the
 * provider's error type, code and param. Never the agenda text, the model output or the request body.
 */
export function agendaErrorFacts(error: unknown, model: string) {
  const outer = error as { name?: string; cause?: unknown } | undefined;
  // An AI SDK APICallError (checked by shape: `ai` loads ESM-only code in Jest).
  const call = [error, outer?.cause].find(
    (item): item is ProviderCallError => typeof (item as ProviderCallError | undefined)?.statusCode === 'number'
  );
  let body: { error?: { type?: unknown; code?: unknown; param?: unknown } } | undefined;
  try {
    body = call?.responseBody ? JSON.parse(call.responseBody) : undefined;
  } catch {
    body = undefined;
  }
  return {
    model: safe(model),
    error: safe(outer?.name) ?? 'unknown',
    cause: safe((outer?.cause as { name?: string } | undefined)?.name),
    status: call?.statusCode,
    type: safe(body?.error?.type),
    code: safe(body?.error?.code),
    param: safe(body?.error?.param),
    retryable: call?.isRetryable,
  };
}
