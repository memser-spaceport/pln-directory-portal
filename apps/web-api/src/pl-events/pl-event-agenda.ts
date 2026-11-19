import moment from 'moment-timezone';
import { z } from 'zod';
import { isDateOnly } from 'libs/contracts/src/schema/pl-event-body';

/**
 * Turning pasted agenda text into sessions (LAB-3343). The model reads the text and returns each session with its
 * day and local clock times; the instants are computed here, so a time zone or daylight-saving mistake cannot come
 * from the model.
 */

/** What the model returns. Times are the event's local clock times, as written in the text. */
export const AgendaModelOutputSchema = z.object({
  isValid: z.boolean().describe('Whether the text holds agenda items: each needs a time and a title'),
  message: z.string().describe('When invalid: what is missing. When valid: an empty string'),
  sessions: z
    .array(
      z.object({
        name: z.string().describe('The title of the session'),
        description: z.string().describe('The description, only when the text gives one apart from the title; else ""'),
        date: z.string().describe('The day of the session as YYYY-MM-DD, or "" when the text names no day for it'),
        startTime: z.string().describe('The local start time as HH:mm, 24-hour'),
        endTime: z.string().describe('The local end time as HH:mm, 24-hour, or "" when the text gives none'),
      })
    )
    .describe('The sessions in the order of the text; empty when invalid'),
});

export type AgendaModelOutput = z.infer<typeof AgendaModelOutputSchema>;

export const AGENDA_PARSE_SYSTEM_PROMPT = `You read the agenda of an event and return its sessions.

Rules:
- A session needs a time and a title. A short title such as "Break", "Lunch" or "End" is fine.
- Text with no agenda items (random words, a title with no time, a time with no title) is invalid: set isValid to
  false, return no sessions, and say in "message" what is missing, for example "The times are missing".
- Return times exactly as the text gives them, as local clock times in 24-hour HH:mm. Do not convert time zones.
- "9-11 AM" is 09:00 to 11:00. "noon" is 12:00. "morning" with no clock time is not a time.
- When the text gives no end time for a session, return "" for endTime.
- Set "date" only when the text names the day of the session (a date, or a weekday or "Day 2" you can map to a day
  of the event). Otherwise return "".
- Only use a description that the text gives apart from the title. "10am - Team Meeting: Discuss Q4 goals" has the
  name "Team Meeting" and the description "Discuss Q4 goals". "10am - Team Meeting" has the description "".
- Keep the order of the text.`;

export function agendaParsePrompt(input: { text: string; startDay: string; endDay: string; timezone: string }): string {
  const span =
    input.startDay === input.endDay
      ? `The event is on ${input.startDay} (one day).`
      : `The event runs from ${input.startDay} to ${input.endDay} (several days).`;
  return `${span} Its time zone is ${input.timezone}.\n\nAgenda text:\n\n${input.text}`;
}

export type AgendaSession = {
  name: string;
  description: string;
  start_date: string;
  end_date: string;
  timezone: string;
};

export type AgendaParseResult = { sessions: AgendaSession[]; message: string | null };

const TIME = /^([01]?\d|2[0-3]):([0-5]\d)$/;
const DEFAULT_SESSION_MINUTES = 60;

/** The calendar day of an event date in the event's time zone. */
export function eventDay(value: string, timezone: string): string {
  return isDateOnly(value) ? value : moment.tz(value, timezone).format('YYYY-MM-DD');
}

/**
 * Sessions with instants, from the model's local times. A session with no end lasts one hour. A multi-day event
 * whose text names no day for a session gets a message asking for dates, and no sessions.
 */
export function toAgendaSessions(
  output: AgendaModelOutput,
  event: { startDay: string; endDay: string; timezone: string }
): AgendaParseResult {
  const items = output.sessions.filter((item) => item.name.trim() && TIME.test(item.startTime.trim()));
  if (!output.isValid || items.length === 0) {
    return { sessions: [], message: output.message.trim() || 'The times are missing. Add a time to each agenda item.' };
  }

  const multiDay = event.startDay !== event.endDay;
  if (multiDay && items.some((item) => !isDateOnly(item.date.trim()))) {
    return {
      sessions: [],
      message: `This is a multi-day event (${event.startDay} to ${event.endDay}). Please provide specific dates for each day's activities.`,
    };
  }

  const sessions = items.map((item) => {
    const day = isDateOnly(item.date.trim()) ? item.date.trim() : event.startDay;
    const at = (time: string) => moment.tz(`${day} ${time.padStart(5, '0')}`, 'YYYY-MM-DD HH:mm', true, event.timezone);
    const start = at(item.startTime.trim());
    const endTime = item.endTime.trim();
    let end = TIME.test(endTime) ? at(endTime) : start.clone().add(DEFAULT_SESSION_MINUTES, 'minutes');
    // "23:00 - 01:00" ends on the next day.
    if (!end.isAfter(start)) end = end.add(1, 'day');
    return {
      name: item.name.trim(),
      description: item.description.trim(),
      start_date: start.toISOString(),
      end_date: end.toISOString(),
      timezone: event.timezone,
    };
  });
  return { sessions, message: null };
}
