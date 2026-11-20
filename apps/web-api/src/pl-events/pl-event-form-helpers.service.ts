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
      this.logger.error(`Agenda parse failed: ${error?.message}`, error?.stack, LOG_CONTEXT);
      throw new ServiceUnavailableException('The agenda could not be read right now. Please try again.');
    }
    return toAgendaSessions(output, event);
  }
}
