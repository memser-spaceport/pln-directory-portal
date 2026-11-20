// The helper modules the tool imports pull in services whose module graph jest cannot load; they are stubbed, as in
// mcp-write-tools.spec.ts. The tool and PLEventWriteService are real.
jest.mock('../team-news/team-news.service', () => ({ TeamNewsService: jest.fn() }));
jest.mock('../team-news/team-news-query.service', () => ({ TeamNewsQueryService: jest.fn() }));
jest.mock('../members/members.service', () => ({ MembersService: jest.fn() }));
jest.mock('../members/members.hooks.service', () => ({ MembersHooksService: jest.fn() }));
jest.mock('../members/investor-profile.service', () => ({ InvestorProfileService: jest.fn() }));
jest.mock('../notification-settings/notification-settings.service', () => ({ NotificationSettingsService: jest.fn() }));
jest.mock('../pl-events/pl-event-guests.service', () => ({ PLEventGuestsService: jest.fn() }));
jest.mock('../pl-events/pl-event-locations.service', () => ({ PLEventLocationsService: jest.fn() }));
jest.mock('../teams/teams.service', () => ({ TeamsService: jest.fn() }));
jest.mock('../projects/projects.service', () => ({ ProjectsService: jest.fn() }));
jest.mock('../team-enrichment/team-enrichment.service', () => ({ TeamEnrichmentService: jest.fn() }));
jest.mock('../shared/prisma.service', () => ({ PrismaService: class {} }));
jest.mock('../shared/log.service', () => ({ LogService: class {} }));
jest.mock('../utils/cache/cache.service', () => ({ CacheService: class {} }));
jest.mock('../pl-events/push/irl-gathering-push-candidates.service', () => ({
  IrlGatheringPushCandidatesService: class {},
}));
jest.mock('../access-control-v2/services/access-control-v2.service', () => ({ AccessControlV2Service: class {} }));

import { InMemoryPrisma } from '../pl-events/fixtures/in-memory-prisma';
import { PLEventWriteService } from '../pl-events/pl-event-write.service';
import { submitEventTool } from './mcp-event-submit-tool';
import { McpActorContext } from './mcp-tools';

const CTX: McpActorContext = {
  memberUid: 'm-1',
  name: 'Ada',
  email: 'ada@example.com',
  permissions: new Set(),
  authorizationUid: 'auth-1',
  clientName: 'Claude Code',
  agentAccess: 'write',
};

const ARGS = {
  event_name: 'Lisbon Builders Night',
  start_date: '2026-07-24T18:00:00+01:00',
  end_date: '2026-07-24T21:00:00+01:00',
  timezone: 'Europe/Lisbon',
  format: 'IN_PERSON',
  tags: ['Networking Event'],
  host_name: 'Protocol Labs',
  city: 'Lisbon',
  country: 'Portugal',
};

function setup(forumAccess: boolean) {
  const db = new InMemoryPrisma({ member: [{ uid: 'm-1' }] });
  const eventsService = { submitPLEvent: jest.fn(async () => ({ event_id: 'remote-1' })) };
  const eventWrite = new PLEventWriteService(
    db.client() as any,
    { info: jest.fn(), error: jest.fn() } as any,
    { reset: jest.fn() } as any,
    { refreshCandidatesForEvents: jest.fn(async () => undefined) } as any,
    { hasPermission: jest.fn(async () => ({ allowed: forumAccess })) } as any
  );
  const tool = submitEventTool({ events: eventsService as any, eventWrite });
  return { tool, db, eventsService };
}

describe('MCP submit_event (LAB-3325)', () => {
  const flag = process.env.EVENTS_LOCAL_SUBMIT_ENABLED;
  afterEach(() => {
    process.env.EVENTS_LOCAL_SUBMIT_ENABLED = flag;
  });

  it('stores a local event with the caller as submitter and does not call the events service', async () => {
    process.env.EVENTS_LOCAL_SUBMIT_ENABLED = 'true';
    const { tool, db, eventsService } = setup(false);

    const result: any = await tool.execute(CTX, { ...ARGS });

    const [event] = db.all('pLEvent');
    expect(event).toMatchObject({
      name: 'Lisbon Builders Night',
      submitterUid: 'm-1',
      status: 'PENDING',
      format: 'IN_PERSON',
      tags: ['Networking Event'],
      hostName: 'Protocol Labs',
      timezone: 'Europe/Lisbon',
    });
    expect(event.locationUid).toBeTruthy();
    expect(result).toEqual({
      submitted: true,
      published: false,
      event: { uid: event.uid, status: 'PENDING', event_name: 'Lisbon Builders Night' },
    });
    expect(eventsService.submitPLEvent).not.toHaveBeenCalled();
  });

  it('publishes a forum member at once', async () => {
    process.env.EVENTS_LOCAL_SUBMIT_ENABLED = 'true';
    const { tool, db } = setup(true);
    const result: any = await tool.execute(CTX, { ...ARGS });
    expect(result.published).toBe(true);
    expect(db.all('pLEvent')[0].status).toBe('APPROVED');
  });

  it('refuses a submission that lacks what the form requires, and stores nothing', async () => {
    process.env.EVENTS_LOCAL_SUBMIT_ENABLED = 'true';
    const { tool, db } = setup(true);
    await expect(tool.execute(CTX, { ...ARGS, tags: [], host_name: undefined })).rejects.toThrow(/tags: .*hostName: /);
    await expect(tool.execute(CTX, { ...ARGS, surprise: true })).rejects.toThrow();
    expect(db.all('pLEvent')).toHaveLength(0);
  });

  it('still sends the event to the events service while the flag is off', async () => {
    process.env.EVENTS_LOCAL_SUBMIT_ENABLED = 'false';
    const { tool, db, eventsService } = setup(true);
    const result: any = await tool.execute(CTX, { ...ARGS });
    expect(eventsService.submitPLEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        event_name: 'Lisbon Builders Night',
        address_info: { city: 'Lisbon', country: 'Portugal' },
      }),
      'ada@example.com'
    );
    expect(result).toEqual({ submitted: true, event: { event_id: 'remote-1' } });
    expect(db.all('pLEvent')).toHaveLength(0);
  });
});
