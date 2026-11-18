// Same light mocks as labos-agent.spec.ts and the MCP write tool specs. The real MCP tools run against fakes.
jest.mock('../guards/user-token-validation.guard', () => ({ UserTokenValidation: class UserTokenValidation {} }));
jest.mock('../husky/husky-ai.service', () => ({ HuskyAiService: jest.fn() }));
jest.mock('../team-news/team-news.service', () => ({ TeamNewsService: jest.fn() }));
jest.mock('../team-news/team-news-query.service', () => ({ TeamNewsQueryService: jest.fn() }));
jest.mock('../team-news/team-news-suggestions.service', () => ({ TeamNewsSuggestionsService: jest.fn() }));
jest.mock('../mcp/mcp-tool-catalog', () => ({ McpToolCatalog: jest.fn() }));
jest.mock('../access-control-v2/services/access-control-v2.service', () => ({ AccessControlV2Service: jest.fn() }));
jest.mock('../members/members.service', () => ({ MembersService: jest.fn() }));
jest.mock('../members/members.hooks.service', () => ({ MembersHooksService: jest.fn() }));
jest.mock('../pl-events/pl-event-guests.service', () => ({ PLEventGuestsService: jest.fn() }));
jest.mock('../pl-events/pl-event-locations.service', () => ({ PLEventLocationsService: jest.fn() }));
jest.mock('../teams/teams.service', () => ({ TeamsService: jest.fn() }));
jest.mock('../projects/projects.service', () => ({ ProjectsService: jest.fn() }));
jest.mock('../notification-settings/notification-settings.service', () => ({ NotificationSettingsService: jest.fn() }));
jest.mock('../notification-settings/suggested-candidates-email-preference.service', () => ({
  SuggestedCandidatesEmailPreferenceService: jest.fn(),
}));
jest.mock('../notifications/notification-service.client', () => ({ NotificationServiceClient: jest.fn() }));
jest.mock('../demo-days/demo-days.service', () => ({ DemoDaysService: jest.fn() }));
jest.mock('../demo-days/demo-day-engagement.service', () => ({ DemoDayEngagementService: jest.fn() }));
jest.mock('../member-experiences/member-experiences.service', () => ({ MemberExperiencesService: jest.fn() }));
jest.mock('../follows/follows.service', () => ({ FollowsService: jest.fn() }));
jest.mock('../job-openings/job-openings-saved.service', () => ({ JobOpeningsSavedService: jest.fn() }));
jest.mock('../job-openings/job-openings-query.service', () => ({ JobOpeningsQueryService: jest.fn() }));
jest.mock('../job-alerts/job-alerts.service', () => ({ JobAlertsService: jest.fn() }));
jest.mock('ai', () => ({ tool: (def: unknown) => def }));

import { APP_ENV } from '../utils/constants';
import { experienceTools } from '../mcp/mcp-member-action-tools';
import { MCP_SCOPE_KEYS } from 'libs/contracts/src/schema/mcp-scopes';
import { appTools } from '../mcp/mcp-tool-plan';
import { toolsForPermissions } from '../mcp/mcp-tools';
import { directoryWriteTools, profileTools } from '../mcp/mcp-write-tools';
import { LabosAgentAccessService } from './labos-agent-access.service';
import { LabosAgentController } from './labos-agent.controller';
import { LabosAgentProposalStore, proposalRecordKey } from './labos-agent-proposals';
import { LabosAgentService } from './labos-agent.service';

const WRITE_TOOLS = ['update_my_profile', 'add_experience', 'update_experience', 'update_team'];
/** Admin caps with no limit: every scope at write. */
const ALL_WRITE = Object.fromEntries(MCP_SCOPE_KEYS.map((key) => [key, 'write']));

const NOW = Date.parse('2026-11-18T12:00:00.000Z');
const VALID = { threadId: 'thread-1', chatId: 'chat-1', message: 'Change my bio' };

function fakeCache() {
  const data = new Map<string, unknown>();
  return {
    data,
    get: jest.fn(async (key: string) => data.get(key)),
    set: jest.fn(async (key: string, value: unknown) => void data.set(key, JSON.parse(JSON.stringify(value)))),
    del: jest.fn(async (key: string) => (data.delete(key) ? 1 : 0)),
  };
}

function setup() {
  process.env.ENVIRONMENT = APP_ENV.DEV;
  let callerUid = 'member-1';
  const leads = new Set(['team-led']);
  const member = () => ({
    uid: 'member-1',
    name: 'Ada',
    bio: 'Old bio',
    moreDetails: null,
    githubHandler: 'ada-old',
    telegramHandler: null,
    linkedinHandler: null,
    twitterHandler: null,
    discordHandler: null,
    officeHours: null,
    openToWork: false,
    jobSearchStatus: null,
    skills: [],
    location: null,
    teamMemberRoles: [...leads].map((teamUid) => ({ teamUid, teamLead: true })),
  });
  const team = {
    uid: 'team-led',
    name: 'Team Led',
    shortDescription: 'Old pitch',
    fundingStage: null,
    industryTags: [],
  };
  const experience = {
    uid: 'exp-1',
    memberUid: 'member-1',
    title: 'Engineer',
    company: 'Acme',
    location: null,
    startDate: new Date('2024-03-01'),
    endDate: null,
    isCurrent: true,
  };
  const prisma = {
    member: { findUnique: jest.fn(async () => ({ uid: callerUid, deletedAt: null })) },
    teamMemberRole: {
      findFirst: jest.fn(async ({ where }) =>
        where.memberUid === 'member-1' && leads.has(where.teamUid) ? { teamUid: where.teamUid } : null
      ),
    },
    team: { findFirst: jest.fn(async ({ where }) => (where.uid === team.uid ? team : null)) },
    memberExperience: { findFirst: jest.fn(async ({ where }) => (where.uid === 'exp-1' ? experience : null)) },
    skill: { findMany: jest.fn(async () => []) },
  };
  const members = {
    findMemberByUid: jest.fn(async () => member()),
    updateMemberByUid: jest.fn(async () => ({ ...member(), email: 'ada@example.com' })),
  };
  const hooks = { postUpdateActions: jest.fn() };
  const experiences = {
    getAllMemberExperience: jest.fn(async () => [experience]),
    create: jest.fn(async (data) => ({ uid: 'exp-2', ...data })),
    update: jest.fn(async (uid, data) => ({ ...experience, ...data })),
  };
  const teams = { updateTeamProfileFields: jest.fn(async (uid, data) => ({ ...team, ...data })) };
  /** Names of the write tools whose real `execute` ran. */
  const runs: string[] = [];
  const forPermissions = (permissions: Set<string>) =>
    toolsForPermissions(permissions, [
      ...profileTools(members as any, hooks as any, prisma as any),
      ...experienceTools(experiences as any, prisma as any),
      ...directoryWriteTools(teams as any, {} as any, members as any, prisma as any),
    ]).map((def) => ({
      ...def,
      execute: (ctx: any, args: any) => {
        if (WRITE_TOOLS.includes(def.name)) runs.push(def.name);
        return def.execute(ctx, args);
      },
    }));
  // The real caps step (`appTools` = `planTools` with app levels), as McpToolCatalog.forApp runs it.
  const catalog = {
    forPermissions,
    forApp: (permissions: Set<string>, caps: any) => appTools(forPermissions(permissions), caps),
  };
  let caps: Record<string, string> | Error = ALL_WRITE;
  const scopes = {
    adminCaps: jest.fn(async () => {
      if (caps instanceof Error) throw caps;
      return caps;
    }),
  };
  const accessControl = { getMemberAccess: jest.fn().mockResolvedValue({ effectivePermissions: [] }) };
  const cache = fakeCache();
  const husky = { createContextualToolsResponse: jest.fn().mockResolvedValue({}) };
  const service = new LabosAgentService(
    prisma as any,
    new LabosAgentAccessService(),
    husky as any,
    {} as any,
    catalog as any,
    accessControl as any,
    new LabosAgentProposalStore(cache as any),
    scopes as any
  );
  const controller = new LabosAgentController(service);
  const req = { userEmail: 'ada@example.com' };

  /** One chat turn: the agent tools as the model gets them, and the `proposals` the stream body ends with. */
  const chat = async () => {
    await controller.chat(VALID, req, { setHeader: jest.fn(), flushHeaders: jest.fn() } as any).catch(() => undefined);
    const options = husky.createContextualToolsResponse.mock.calls.at(-1)[3];
    return {
      tools: options.extraTools as Record<string, { execute: (args: unknown) => Promise<string> }>,
      proposals: options.extraResponseFields.proposals as Array<Record<string, any>>,
    };
  };
  const propose = async (name: string, args: Record<string, unknown>) => {
    const turn = await chat();
    const text = await turn.tools[name].execute(args);
    return { text, proposal: turn.proposals[0] };
  };
  const stored = (proposalId: string) => cache.data.get(proposalRecordKey(proposalId)) as Record<string, any>;
  const confirm = (proposalId: string, decision = 'confirm') =>
    controller.confirm({ proposalId, decision }, req).catch((error) => error);
  const writes = () =>
    members.updateMemberByUid.mock.calls.length +
    experiences.create.mock.calls.length +
    experiences.update.mock.calls.length +
    teams.updateTeamProfileFields.mock.calls.length;
  return {
    propose,
    confirm,
    writes,
    leads,
    members,
    experiences,
    teams,
    prisma,
    cache,
    runs,
    chat,
    stored,
    setCaps: (next: Record<string, string> | Error) => (caps = next),
    setCaller: (uid: string) => (callerUid = uid),
  };
}

/** The error body as the client gets it; `statusCode` is the HTTP status. */
const body = (error: any) => ({ ...error.getResponse(), statusCode: error.getStatus() });

describe('LabOS agent action proposals (LAB-3299)', () => {
  const originalEnv = process.env.ENVIRONMENT;
  beforeEach(() => jest.spyOn(Date, 'now').mockReturnValue(NOW));
  afterEach(() => jest.restoreAllMocks());
  afterAll(() => {
    process.env.ENVIRONMENT = originalEnv;
  });

  it('makes a profile proposal with old and new values, stores it for 15 minutes and writes nothing', async () => {
    const h = setup();
    const { text, proposal } = await h.propose('update_my_profile', { bio: 'New bio', githubHandler: '' });
    expect(text).toContain('Nothing is saved yet');
    expect(proposal).toEqual({
      proposalId: expect.stringMatching(/^ap_/),
      tool: 'update_my_profile',
      title: 'Update your Bio, GitHub',
      targetType: 'member',
      targetUid: 'member-1',
      changes: [
        { field: 'bio', label: 'Bio', oldValue: 'Old bio', newValue: 'New bio' },
        { field: 'githubHandler', label: 'GitHub', oldValue: 'ada-old', newValue: null },
      ],
      expiresAt: '2026-11-18T12:15:00.000Z',
    });
    expect(h.stored(proposal.proposalId)).toEqual(
      expect.objectContaining({ memberUid: 'member-1', tool: 'update_my_profile', status: 'open' })
    );
    expect(h.writes()).toBe(0);
  });

  it('refuses a field the real tool does not allow, with no proposal', async () => {
    const h = setup();
    const { text, proposal } = await h.propose('update_my_profile', { email: 'x@example.com' });
    expect(text).toContain('refused');
    expect(text).toContain('email');
    expect(proposal).toBeUndefined();
  });

  it('makes add_experience and update_experience proposals from current data', async () => {
    const h = setup();
    const added = await h.propose('add_experience', { title: 'CTO', company: 'Beta', startDate: '2025-01-01' });
    expect(added.proposal).toEqual(
      expect.objectContaining({
        tool: 'add_experience',
        title: 'Add CTO at Beta to your experience',
        changes: [
          { field: 'title', label: 'Title', oldValue: null, newValue: 'CTO' },
          { field: 'company', label: 'Company', oldValue: null, newValue: 'Beta' },
          { field: 'startDate', label: 'Start date', oldValue: null, newValue: '2025-01-01' },
        ],
      })
    );
    const updated = await h.propose('update_experience', { experienceUid: 'exp-1', title: 'Staff engineer' });
    expect(updated.proposal).toEqual(
      expect.objectContaining({
        tool: 'update_experience',
        title: 'Update your experience at Acme',
        changes: [{ field: 'title', label: 'Title', oldValue: 'Engineer', newValue: 'Staff engineer' }],
      })
    );
    const missing = await h.propose('update_experience', { experienceUid: 'exp-x', title: 'X' });
    expect(missing.text).toContain('Experience not found');
    expect(missing.proposal).toBeUndefined();
    expect(h.writes()).toBe(0);
  });

  it('gives a non-lead no update_team proposal and says the member cannot change the team', async () => {
    const h = setup();
    const refused = await h.propose('update_team', { teamUid: 'team-other', shortDescription: 'New' });
    expect(refused.text).toContain('cannot change the team');
    expect(refused.proposal).toBeUndefined();

    const lead = await h.propose('update_team', { teamUid: 'team-led', shortDescription: 'New pitch' });
    expect(lead.proposal).toEqual(
      expect.objectContaining({
        tool: 'update_team',
        title: 'Update Team Led',
        targetType: 'team',
        targetUid: 'team-led',
        changes: [
          { field: 'shortDescription', label: 'Short description', oldValue: 'Old pitch', newValue: 'New pitch' },
        ],
      })
    );
    expect(h.writes()).toBe(0);
  });
});

describe('C2 POST /v1/labos-agent/actions/confirm (LAB-3299)', () => {
  beforeEach(() => jest.spyOn(Date, 'now').mockReturnValue(NOW));
  afterEach(() => jest.restoreAllMocks());

  it('runs the real tool once with the stored arguments and returns its result', async () => {
    const h = setup();
    const { proposal } = await h.propose('update_my_profile', { bio: 'New bio' });
    const [first, second] = await Promise.all([h.confirm(proposal.proposalId), h.confirm(proposal.proposalId)]);
    const results = [first, second];
    const done = results.find((result) => result.status === 'done');
    const closed = results.find((result) => result !== done);
    expect(done).toEqual({
      proposalId: proposal.proposalId,
      status: 'done',
      tool: 'update_my_profile',
      summary: 'Your profile is updated: Bio.',
      result: expect.objectContaining({ updated: ['bio'] }),
    });
    expect(body(closed)).toEqual(expect.objectContaining({ statusCode: 409, code: 'PROPOSAL_CLOSED' }));
    expect(h.members.updateMemberByUid).toHaveBeenCalledTimes(1);
    expect(h.members.updateMemberByUid).toHaveBeenCalledWith('member-1', { bio: 'New bio' });
    expect(body(await h.confirm(proposal.proposalId))).toEqual(expect.objectContaining({ code: 'PROPOSAL_CLOSED' }));
  });

  it('cancel closes the proposal and writes nothing', async () => {
    const h = setup();
    const { proposal } = await h.propose('add_experience', { title: 'CTO', company: 'Beta', startDate: '2025-01-01' });
    await expect(h.confirm(proposal.proposalId, 'cancel')).resolves.toEqual({
      proposalId: proposal.proposalId,
      status: 'cancelled',
      tool: 'add_experience',
      summary: 'Cancelled. Nothing changed.',
      result: {},
    });
    expect(body(await h.confirm(proposal.proposalId))).toEqual(expect.objectContaining({ statusCode: 409 }));
    expect(h.writes()).toBe(0);
  });

  it('returns 404 PROPOSAL_NOT_FOUND for an unknown id and for another member', async () => {
    const h = setup();
    expect(body(await h.confirm('ap_missing'))).toEqual(
      expect.objectContaining({ statusCode: 404, code: 'PROPOSAL_NOT_FOUND' })
    );
    const { proposal } = await h.propose('update_my_profile', { bio: 'New bio' });
    h.setCaller('member-2');
    expect(body(await h.confirm(proposal.proposalId))).toEqual(
      expect.objectContaining({ statusCode: 404, code: 'PROPOSAL_NOT_FOUND' })
    );
    expect(h.writes()).toBe(0);
  });

  it('returns 410 PROPOSAL_EXPIRED after 15 minutes', async () => {
    const h = setup();
    const { proposal } = await h.propose('update_my_profile', { bio: 'New bio' });
    jest.spyOn(Date, 'now').mockReturnValue(NOW + 15 * 60 * 1000 + 1);
    expect(body(await h.confirm(proposal.proposalId))).toEqual(
      expect.objectContaining({ statusCode: 410, code: 'PROPOSAL_EXPIRED' })
    );
    expect(h.writes()).toBe(0);
  });

  it('returns 403 ACTION_NOT_ALLOWED when the member is no longer a team lead', async () => {
    const h = setup();
    const { proposal } = await h.propose('update_team', { teamUid: 'team-led', shortDescription: 'New pitch' });
    h.leads.clear();
    expect(body(await h.confirm(proposal.proposalId))).toEqual(
      expect.objectContaining({ statusCode: 403, code: 'ACTION_NOT_ALLOWED' })
    );
    expect(h.teams.updateTeamProfileFields).not.toHaveBeenCalled();
  });

  it('rechecks the lead role at confirm time: the tool never runs and the proposal stays open', async () => {
    // The update_team tool has its own lead check, so a 403 alone does not prove the C2 recheck. Without the
    // recheck, C2 claims the proposal and runs the tool, which refuses: `runs` gets update_team and the status is failed.
    const h = setup();
    const { proposal } = await h.propose('update_team', { teamUid: 'team-led', shortDescription: 'New pitch' });
    h.leads.clear();
    expect(body(await h.confirm(proposal.proposalId))).toEqual(
      expect.objectContaining({ statusCode: 403, code: 'ACTION_NOT_ALLOWED' })
    );
    expect(h.runs).toEqual([]);
    expect(h.stored(proposal.proposalId).status).toBe('open');
  });

  it.each([
    ['confirm first', ['confirm', 'cancel']],
    ['cancel first', ['cancel', 'confirm']],
  ])(
    'races Cancel against Confirm (%s): one wins, the tool runs at most once, the loser gets 409 with status',
    async (_n, order) => {
      const h = setup();
      const { proposal } = await h.propose('update_my_profile', { bio: 'New bio' });
      const results = await Promise.all(order.map((decision) => h.confirm(proposal.proposalId, decision)));
      const winners = results.filter((result) => !(result instanceof Error));
      const losers = results.filter((result) => result instanceof Error);
      expect(winners).toHaveLength(1);
      expect(losers).toHaveLength(1);
      expect(body(losers[0])).toEqual(
        expect.objectContaining({ statusCode: 409, code: 'PROPOSAL_CLOSED', status: winners[0].status })
      );
      expect(h.runs.length).toBeLessThanOrEqual(1);
      expect(h.members.updateMemberByUid).toHaveBeenCalledTimes(winners[0].status === 'done' ? 1 : 0);
      expect(h.stored(proposal.proposalId).status).toBe(winners[0].status);
    }
  );

  it('gives the stored status in the 409 body: done, cancelled or failed', async () => {
    const h = setup();
    const done = (await h.propose('update_my_profile', { bio: 'New bio' })).proposal;
    await h.confirm(done.proposalId);
    expect(body(await h.confirm(done.proposalId))).toEqual({
      statusCode: 409,
      code: 'PROPOSAL_CLOSED',
      message: 'The proposal is closed',
      status: 'done',
    });
    const cancelled = (await h.propose('update_my_profile', { bio: 'Other bio' })).proposal;
    await h.confirm(cancelled.proposalId, 'cancel');
    expect(body(await h.confirm(cancelled.proposalId, 'cancel'))).toEqual(
      expect.objectContaining({ statusCode: 409, status: 'cancelled' })
    );
    const failed = (await h.propose('update_my_profile', { skills: ['Nope'] })).proposal;
    await h.confirm(failed.proposalId);
    expect(body(await h.confirm(failed.proposalId))).toEqual(
      expect.objectContaining({ statusCode: 409, status: 'failed' })
    );
  });

  it('gives status pending when another request holds the proposal and has not finished', async () => {
    const h = setup();
    const { proposal } = await h.propose('update_my_profile', { bio: 'New bio' });
    // The other request claimed the proposal (deleted the open key) and its write still runs.
    for (const key of [...h.cache.data.keys()]) if (key.includes('proposal-open')) h.cache.data.delete(key);
    expect(body(await h.confirm(proposal.proposalId))).toEqual(
      expect.objectContaining({ statusCode: 409, code: 'PROPOSAL_CLOSED', status: 'pending' })
    );
    expect(h.runs).toEqual([]);
  });

  it('confirms a team change for a lead through the real update_team tool', async () => {
    const h = setup();
    const { proposal } = await h.propose('update_team', { teamUid: 'team-led', shortDescription: 'New pitch' });
    const result = await h.confirm(proposal.proposalId);
    expect(result).toEqual(
      expect.objectContaining({ status: 'done', summary: 'Team Led is updated: Short description.' })
    );
    expect(h.teams.updateTeamProfileFields).toHaveBeenCalledWith(
      'team-led',
      { shortDescription: 'New pitch' },
      'ada@example.com'
    );
  });

  it('returns 422 ACTION_FAILED with the message when the tool refuses the values, and runs only once', async () => {
    const h = setup();
    const { proposal } = await h.propose('update_my_profile', { skills: ['Nope'] });
    const error = await h.confirm(proposal.proposalId);
    expect(body(error)).toEqual(
      expect.objectContaining({
        statusCode: 422,
        code: 'ACTION_FAILED',
        message: expect.stringContaining('Unknown skills'),
      })
    );
    expect(body(await h.confirm(proposal.proposalId))).toEqual(expect.objectContaining({ statusCode: 409 }));
    expect(h.prisma.skill.findMany).toHaveBeenCalledTimes(1);
    expect(h.writes()).toBe(0);
  });

  it('returns 400 VALIDATION_ERROR for a bad body and 403 AGENT_NOT_ENABLED outside the gate', async () => {
    const h = setup();
    expect(body(await h.confirm('ap_1', 'maybe'))).toEqual(
      expect.objectContaining({ statusCode: 400, code: 'VALIDATION_ERROR' })
    );
    process.env.ENVIRONMENT = APP_ENV.PRODUCTION;
    expect(body(await h.confirm('ap_1'))).toEqual(
      expect.objectContaining({ statusCode: 403, code: 'AGENT_NOT_ENABLED' })
    );
    process.env.ENVIRONMENT = APP_ENV.DEV;
  });
});

describe('Admin MCP caps in the LabOS agent (LAB-3299)', () => {
  beforeEach(() => jest.spyOn(Date, 'now').mockReturnValue(NOW));
  afterEach(() => jest.restoreAllMocks());

  it('drops the profile propose tools in C1 when an admin sets profile to read, and keeps the reads', async () => {
    const h = setup();
    h.setCaps({ ...ALL_WRITE, profile: 'read' });
    const names = Object.keys((await h.chat()).tools);
    expect(names).toEqual(expect.arrayContaining(['get_my_profile', 'list_my_experiences', 'update_team']));
    for (const name of ['update_my_profile', 'add_experience', 'update_experience']) {
      expect(names).not.toContain(name);
    }
  });

  it('returns 403 ACTION_NOT_ALLOWED in C2 when the admin caps changed after the proposal', async () => {
    const h = setup();
    const { proposal } = await h.propose('update_my_profile', { bio: 'New bio' });
    h.setCaps({ ...ALL_WRITE, profile: 'read' });
    expect(body(await h.confirm(proposal.proposalId))).toEqual(
      expect.objectContaining({ statusCode: 403, code: 'ACTION_NOT_ALLOWED' })
    );
    expect(h.runs).toEqual([]);
    expect(h.writes()).toBe(0);
  });

  it('fails closed when the caps cannot be read: no LabOS tools in C1 (as on MCP) and 403 in C2', async () => {
    const h = setup();
    const { proposal } = await h.propose('update_my_profile', { bio: 'New bio' });
    h.setCaps(new Error('db down'));
    expect(Object.keys((await h.chat()).tools)).toEqual([]);
    expect(body(await h.confirm(proposal.proposalId))).toEqual(
      expect.objectContaining({ statusCode: 403, code: 'ACTION_NOT_ALLOWED' })
    );
    expect(h.writes()).toBe(0);
  });

  it('keeps proposal keys under the environment prefix', async () => {
    const h = setup();
    const { proposal } = await h.propose('update_my_profile', { bio: 'New bio' });
    expect([...h.cache.data.keys()].sort()).toEqual([
      `development:labos-agent:proposal-open:${proposal.proposalId}`,
      `development:labos-agent:proposal:${proposal.proposalId}`,
    ]);
  });
});
