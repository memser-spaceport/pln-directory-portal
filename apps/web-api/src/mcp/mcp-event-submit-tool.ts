import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';
import { parseEventSubmitBody } from 'libs/contracts/src/schema/pl-event-body';
import { ADMIN_PERMISSIONS } from '../access-control-v2/access-control-v2.constants';
import type { EventsService } from '../events/events.service';
import { isLocalEventSubmitEnabled } from '../pl-events/pl-event-submit.constants';
import type { PLEventWriteService } from '../pl-events/pl-event-write.service';
import { assertOwnEmail } from './mcp-profile-coverage-tools';
import { McpToolDef } from './mcp-tools';
import { refuseUnknown, requiredUid } from './mcp-write-tools';

/**
 * `submit_event`: the member submits an event through the same write path as the submit form, with themselves as
 * the submitter. While `EVENTS_LOCAL_SUBMIT_ENABLED` is off the events service still owns submissions, and the tool
 * sends the event there.
 */
export function submitEventTool(deps: {
  events: Pick<EventsService, 'submitPLEvent'>;
  eventWrite: Pick<PLEventWriteService, 'memberActor' | 'createEvent'>;
}): McpToolDef {
  return {
    name: 'submit_event',
    description:
      'Submit a new event, the same as the event submit form. A member with forum access is published at once; ' +
      'every other submission waits for approval. The answer says which. Needs a name, start and end, a time zone, ' +
      'a format, at least one tag and a host name.',
    visibility: 'always',
    keepUnknownArgs: true,
    inputSchema: {
      event_name: z.string(),
      description: z.string().optional(),
      start_date: z.string().optional(),
      end_date: z.string().optional(),
      all_day: z.boolean().optional(),
      website: z.string().optional(),
      timezone: z.string().optional(),
      format: z.enum(['IN_PERSON', 'VIRTUAL', 'HYBRID']).optional(),
      access_option: z.enum(['OPEN', 'INVITE', 'PAID']).optional(),
      tags: z.array(z.string()).optional(),
      host_name: z.string().optional(),
      city: z.string().optional(),
      country: z.string().optional(),
    },
    execute: async (ctx, args = {}) => {
      refuseUnknown(args, [
        'event_name',
        'description',
        'start_date',
        'end_date',
        'all_day',
        'website',
        'timezone',
        'format',
        'access_option',
        'tags',
        'host_name',
        'city',
        'country',
      ]);
      const event_name = requiredUid(args, 'event_name');

      // Until the cutover the events service owns submissions.
      if (!isLocalEventSubmitEnabled()) {
        const event = {
          event_name,
          description: args.description,
          start_date: args.start_date,
          end_date: args.end_date,
          website: args.website,
          timezone: args.timezone,
          address_info: { city: args.city, country: args.country },
        };
        const result = await deps.events.submitPLEvent(event, assertOwnEmail(ctx));
        return { submitted: true, event: result ?? { event_name } };
      }

      const parsed = parseEventSubmitBody({
        name: event_name,
        description: args.description,
        startDate: args.start_date,
        endDate: args.end_date,
        allDay: args.all_day,
        websiteUrl: args.website,
        timezone: args.timezone,
        format: args.format,
        accessOption: args.access_option,
        tags: args.tags,
        hostName: args.host_name,
        ...(args.city || args.country ? { address: { city: args.city, country: args.country } } : {}),
      });
      if (!parsed.success) {
        throw new BadRequestException(parsed.message);
      }
      const { draft, ...body } = parsed.data;
      const actor = await deps.eventWrite.memberActor({
        uid: ctx.memberUid,
        isDirectoryAdmin: ctx.permissions.has(ADMIN_PERMISSIONS.DIRECTORY_FULL),
      });
      const result = await deps.eventWrite.createEvent(body, actor);
      return { submitted: true, published: result.status === 'APPROVED', event: { ...result, event_name } };
    },
  };
}
