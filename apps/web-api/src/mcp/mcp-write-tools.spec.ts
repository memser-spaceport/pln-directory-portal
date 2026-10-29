jest.mock('../team-news/team-news.service', () => ({ TeamNewsService: jest.fn() }));
jest.mock('../team-news/team-news-query.service', () => ({ TeamNewsQueryService: jest.fn() }));
jest.mock('../members/members.service', () => ({ MembersService: jest.fn() }));
jest.mock('../members/members.hooks.service', () => ({ MembersHooksService: jest.fn() }));
jest.mock('../pl-events/pl-event-guests.service', () => ({ PLEventGuestsService: jest.fn() }));
jest.mock('../pl-events/pl-event-locations.service', () => ({ PLEventLocationsService: jest.fn() }));
jest.mock('../teams/teams.service', () => ({ TeamsService: jest.fn() }));
jest.mock('../projects/projects.service', () => ({ ProjectsService: jest.fn() }));

import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { z } from 'zod';
import { McpActorContext, McpToolDef, toolInputSchema } from './mcp-tools';
import { directoryWriteTools, eventWriteTools, newsWriteTools, profileTools } from './mcp-write-tools';
import { McpWriteLimitService, MCP_WRITE_LIMIT_PER_HOUR } from './mcp-write-limit.service';

const CTX: McpActorContext = {
  memberUid: 'member-1',
  name: 'Ada',
  email: 'ada@example.com',
  permissions: new Set(),
  authorizationUid: 'auth-1',
  clientName: 'Codex',
  agentAccess: 'read',
};

const MEMBER = {
  uid: 'member-1',
  name: 'Ada',
  email: 'ada@example.com',
  bio: 'Builder',
  moreDetails: null,
  githubHandler: 'ada',
  telegramHandler: null,
  linkedinHandler: null,
  twitterHandler: null,
  discordHandler: null,
  officeHours: null,
  openToWork: false,
  jobSearchStatus: null,
  skills: [{ uid: 's1', title: 'Rust' }],
  teamMemberRoles: [{ teamUid: 'team-1' }],
};

function tool(tools: McpToolDef[], name: string): McpToolDef {
  const found = tools.find((t) => t.name === name);
  if (!found) throw new Error(`missing tool ${name}`);
  return found;
}

describe('post_team_news', () => {
  function build() {
    const news = { createTeamPostedNews: jest.fn().mockResolvedValue({ uid: 'n1' }) };
    const newsQuery = {
      getTeamNewsItemDto: jest.fn().mockResolvedValue({
        uid: 'n1',
        title: 'We launched',
        summary: null,
        eventType: 'LAUNCH',
        eventDate: '2026-10-28',
        teamUid: 'team-1',
        teamName: 'Team One',
      }),
    };
    const members = { findMemberByUid: jest.fn().mockResolvedValue(MEMBER) };
    return { post: tool(newsWriteTools(news as any, newsQuery as any, members as any), 'post_team_news'), news };
  }

  it("posts as the member, with the member's team roles and admin flag", async () => {
    const { post, news } = build();
    const result: any = await post.execute(
      { ...CTX, permissions: new Set(['directory.admin.full']) },
      { teamUid: 'team-1', title: ' We launched ', url: 'https://example.com/launch', body: '<p>Hi</p>' }
    );
    expect(news.createTeamPostedNews).toHaveBeenCalledWith(
      'team-1',
      { title: 'We launched', url: 'https://example.com/launch', body: '<p>Hi</p>' },
      { uid: 'member-1', isDirectoryAdmin: true, teamMemberRoles: [{ teamUid: 'team-1' }] }
    );
    expect(result.posted).toMatchObject({ uid: 'n1', teamName: 'Team One' });
  });

  it.each([
    ['no team', { title: 'x', url: 'https://e.com' }],
    ['no title', { teamUid: 'team-1', url: 'https://e.com' }],
    ['title over 150', { teamUid: 'team-1', title: 'x'.repeat(151), url: 'https://e.com' }],
    ['no url', { teamUid: 'team-1', title: 'x' }],
  ])('rejects %s before calling the service', async (_label, args) => {
    const { post, news } = build();
    await expect(post.execute(CTX, args)).rejects.toBeInstanceOf(BadRequestException);
    expect(news.createTeamPostedNews).not.toHaveBeenCalled();
  });
});

describe('profile tools', () => {
  function build(
    skills = [
      { uid: 's1', title: 'Rust' },
      { uid: 's2', title: 'Go' },
    ]
  ) {
    const members = {
      findMemberByUid: jest.fn().mockResolvedValue(MEMBER),
      updateMemberByUid: jest.fn().mockResolvedValue(MEMBER),
    };
    const hooks = { postUpdateActions: jest.fn().mockResolvedValue(undefined) };
    const prisma = {
      skill: {
        findMany: jest.fn(async ({ where }) =>
          skills.filter((s) => where.OR.some((c: any) => c.title.equals.toLowerCase() === s.title.toLowerCase()))
        ),
      },
    };
    const tools = profileTools(members as any, hooks as any, prisma as any);
    return { tools, members, hooks };
  }

  it('reads only the editable fields', async () => {
    const { tools } = build();
    const profile: any = await tool(tools, 'get_my_profile').execute(CTX, {});
    expect(profile).toMatchObject({ uid: 'member-1', bio: 'Builder', githubHandler: 'ada', skills: ['Rust'] });
    expect(profile).not.toHaveProperty('email');
    expect(profile).not.toHaveProperty('teamMemberRoles');
  });

  it('updates allowed fields, clears empty text, maps job search status and skills, and runs the hooks', async () => {
    const { tools, members, hooks } = build();
    const result: any = await tool(tools, 'update_my_profile').execute(CTX, {
      bio: ' New bio ',
      twitterHandler: '',
      openToWork: true,
      jobSearchStatus: 'actively-looking',
      skills: ['rust', 'Go'],
    });
    expect(members.updateMemberByUid).toHaveBeenCalledWith('member-1', {
      bio: 'New bio',
      twitterHandler: null,
      openToWork: true,
      jobSearchStatus: 'ACTIVELY_LOOKING',
      skills: { set: [{ uid: 's1' }, { uid: 's2' }] },
    });
    expect(hooks.postUpdateActions).toHaveBeenCalledWith(MEMBER, 'ada@example.com');
    expect(result.updated).toEqual(['bio', 'twitterHandler', 'openToWork', 'jobSearchStatus', 'skills']);
  });

  it.each([
    ['a field outside the allowlist', { email: 'evil@example.com' }],
    ['an allowed field mixed with a blocked one', { bio: 'ok', email: 'evil@example.com' }],
    ['an admin field', { isDirectoryAdmin: true }],
    ['an unknown skill', { skills: ['Rust', 'Telepathy'] }],
    ['a bad job search status', { jobSearchStatus: 'sometimes' }],
    ['nothing', {}],
  ])('rejects %s and changes nothing', async (_label, args) => {
    const { tools, members, hooks } = build();
    await expect(tool(tools, 'update_my_profile').execute(CTX, args)).rejects.toBeInstanceOf(BadRequestException);
    expect(members.updateMemberByUid).not.toHaveBeenCalled();
    expect(hooks.postUpdateActions).not.toHaveBeenCalled();
  });

  // The SDK validates arguments with the tool's schema before `execute` and keeps only what the schema returns. A raw
  // shape strips unknown keys, so `email` never reached the allowlist check and `{ bio, email }` saved the bio.
  it('still refuses a blocked field after the SDK has parsed the arguments', async () => {
    const { tools, members } = build();
    const update = tool(tools, 'update_my_profile');
    const sdkParse = (args: Record<string, unknown>) => (toolInputSchema(update) as z.ZodTypeAny).parse(args);

    expect(z.object(update.inputSchema!).parse({ bio: 'ok', email: 'evil@example.com' })).toEqual({ bio: 'ok' });
    const parsed = sdkParse({ bio: 'ok', email: 'evil@example.com' });
    expect(parsed).toEqual({ bio: 'ok', email: 'evil@example.com' });
    await expect(update.execute(CTX, parsed)).rejects.toThrow("These fields can't be changed by an agent: email");
    expect(members.updateMemberByUid).not.toHaveBeenCalled();
  });
});

const DAY = 24 * 60 * 60 * 1000;

describe('event RSVP tools', () => {
  const GOING = { ...CTX, permissions: new Set(['irlg.going.write']) };
  const EVENT = {
    uid: 'ev-1',
    name: 'Builder Day',
    type: 'IN_PERSON',
    slugURL: 'builder-day',
    startDate: new Date(Date.now() + 10 * DAY),
    endDate: new Date(Date.now() + 11 * DAY),
    locationUid: 'loc-1',
  };
  const ROLES = [
    { teamUid: 'team-2', mainTeam: false },
    { teamUid: 'team-1', mainTeam: true },
  ];

  function build({
    event = EVENT as typeof EVENT | null,
    upcoming = ['ev-1'],
    existingGuest = null as { uid: string } | null,
    roles = ROLES,
  } = {}) {
    const location = { uid: 'loc-1', location: 'Lisbon', upcomingEvents: upcoming.map((uid) => ({ uid })) };
    const guests = {
      createPLEventGuestByLocation: jest.fn().mockResolvedValue({ count: 1 }),
      deletePLEventGuests: jest.fn().mockResolvedValue({ events: { count: 1 } }),
    };
    const locations = { getPLEventLocationByUid: jest.fn().mockResolvedValue(location) };
    const member = { ...MEMBER, telegramHandler: 'ada_tg', officeHours: 'https://cal.com/ada', teamMemberRoles: roles };
    const members = { findMemberByUid: jest.fn().mockResolvedValue(member) };
    const prisma = {
      pLEvent: { findFirst: jest.fn().mockResolvedValue(event) },
      pLEventGuest: { findFirst: jest.fn().mockResolvedValue(existingGuest) },
    };
    const tools = eventWriteTools(guests as any, locations as any, members as any, prisma as any);
    return {
      rsvp: tool(tools, 'rsvp_event'),
      cancel: tool(tools, 'cancel_event_rsvp'),
      guests,
      prisma,
      member,
      location,
    };
  }

  it("marks the member as going with their main team and their own contact details, like the UI's I'm going", async () => {
    const { rsvp, guests, member, location } = build();
    const result: any = await rsvp.execute(GOING, { eventUid: 'ev-1' });
    expect(guests.createPLEventGuestByLocation).toHaveBeenCalledWith(
      {
        memberUid: 'member-1',
        teamUid: 'team-1',
        telegramId: 'ada_tg',
        officeHours: 'https://cal.com/ada',
        events: [{ uid: 'ev-1' }],
        additionalInfo: {},
      },
      member,
      'loc-1',
      'ada@example.com',
      location,
      'CREATE',
      undefined,
      'upcoming'
    );
    expect(result).toMatchObject({ going: true, alreadyGoing: false, event: { uid: 'ev-1', name: 'Builder Day' } });
  });

  it("uses the team the agent names when it is one of the member's teams", async () => {
    const { rsvp, guests } = build();
    await rsvp.execute(GOING, { eventUid: 'ev-1', teamUid: 'team-2' });
    expect(guests.createPLEventGuestByLocation.mock.calls[0][0]).toMatchObject({ teamUid: 'team-2' });
  });

  it('allows directory admins without the going permission', async () => {
    const { rsvp, guests } = build();
    await rsvp.execute({ ...CTX, permissions: new Set(['directory.admin.full']) }, { eventUid: 'ev-1' });
    expect(guests.createPLEventGuestByLocation).toHaveBeenCalled();
  });

  it('lets directory admins RSVP to invite-only events, like the page', async () => {
    const { rsvp, guests } = build({ event: { ...EVENT, type: 'INVITE_ONLY' } as any });
    await rsvp.execute({ ...CTX, permissions: new Set(['directory.admin.full']) }, { eventUid: 'ev-1' });
    expect(guests.createPLEventGuestByLocation).toHaveBeenCalled();
  });

  it('does not add a second guest row when the member is already going', async () => {
    const { rsvp, guests, prisma } = build({ existingGuest: { uid: 'g1' } });
    const result: any = await rsvp.execute(GOING, { eventUid: 'ev-1' });
    expect(prisma.pLEventGuest.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { memberUid: 'member-1', eventUid: 'ev-1', locationUid: 'loc-1' } })
    );
    expect(guests.createPLEventGuestByLocation).not.toHaveBeenCalled();
    expect(result).toMatchObject({ going: true, alreadyGoing: true });
  });

  it.each([
    ['no going permission', CTX, { eventUid: 'ev-1' }, {}, ForbiddenException],
    ['no eventUid', GOING, {}, {}, BadRequestException],
    ['an unknown event', GOING, { eventUid: 'ev-1' }, { event: null }, NotFoundException],
    [
      'an event with no gathering',
      GOING,
      { eventUid: 'ev-1' },
      { event: { ...EVENT, locationUid: null } },
      BadRequestException,
    ],
    ['an event that has ended', GOING, { eventUid: 'ev-1' }, { upcoming: [] }, BadRequestException],
    // The gathering lists events that ended within the last 90 days as upcoming; an ended event is still ended.
    [
      'an event that ended but is still in the gathering list',
      GOING,
      { eventUid: 'ev-1' },
      { event: { ...EVENT, startDate: new Date(Date.now() - 3 * DAY), endDate: new Date(Date.now() - 2 * DAY) } },
      BadRequestException,
    ],
    ['a team the member is not on', GOING, { eventUid: 'ev-1', teamUid: 'team-9' }, {}, BadRequestException],
    ['a member with no team', GOING, { eventUid: 'ev-1' }, { roles: [] }, BadRequestException],
    [
      'an invite-only event',
      GOING,
      { eventUid: 'ev-1' },
      { event: { ...EVENT, type: 'INVITE_ONLY' } },
      ForbiddenException,
    ],
  ])('refuses %s without writing', async (_label, ctx, args, setup, error) => {
    const { rsvp, guests } = build(setup as any);
    await expect(rsvp.execute(ctx as McpActorContext, args)).rejects.toBeInstanceOf(error);
    expect(guests.createPLEventGuestByLocation).not.toHaveBeenCalled();
  });

  it('refuses fields an agent may not set, even through the SDK schema', async () => {
    const { rsvp, cancel, guests } = build({ existingGuest: { uid: 'g1' } });
    const args = { eventUid: 'ev-1', topics: ['AI'], reason: 'networking' };
    expect((toolInputSchema(rsvp) as z.ZodTypeAny).parse(args)).toEqual(args);
    await expect(build().rsvp.execute(GOING, args)).rejects.toThrow('topics, reason');
    await expect(cancel.execute(GOING, { eventUid: 'ev-1', memberUid: 'someone-else' })).rejects.toThrow('memberUid');
    expect(guests.deletePLEventGuests).not.toHaveBeenCalled();
  });

  it("removes only the member's own guest row for that event", async () => {
    const { cancel, guests } = build({ existingGuest: { uid: 'g1' } });
    const result: any = await cancel.execute(GOING, { eventUid: 'ev-1' });
    expect(guests.deletePLEventGuests).toHaveBeenCalledWith('loc-1', [{ memberUid: 'member-1', events: ['ev-1'] }]);
    expect(result).toMatchObject({ going: false, wasGoing: true, event: { uid: 'ev-1' } });
  });

  it('reports not going without deleting when the member was not going', async () => {
    const { cancel, guests } = build();
    const result: any = await cancel.execute(GOING, { eventUid: 'ev-1' });
    expect(guests.deletePLEventGuests).not.toHaveBeenCalled();
    expect(result).toMatchObject({ going: false, wasGoing: false });
  });

  it.each([
    ['no going permission', CTX, {}, ForbiddenException],
    ['an event that has ended', GOING, { upcoming: [] }, BadRequestException],
    [
      'an event that ended but is still in the gathering list',
      GOING,
      { event: { ...EVENT, startDate: new Date(Date.now() - 3 * DAY), endDate: new Date(Date.now() - 2 * DAY) } },
      BadRequestException,
    ],
  ])('refuses to cancel for %s', async (_label, ctx, setup, error) => {
    const { cancel, guests } = build({ existingGuest: { uid: 'g1' }, ...(setup as any) });
    await expect(cancel.execute(ctx as McpActorContext, { eventUid: 'ev-1' })).rejects.toBeInstanceOf(error);
    expect(guests.deletePLEventGuests).not.toHaveBeenCalled();
  });
});

describe('directory write tools', () => {
  const ADMIN = { ...CTX, permissions: new Set(['directory.admin.full']) };
  const ROLES = [
    { teamUid: 'team-1', teamLead: true },
    { teamUid: 'team-2', teamLead: false },
  ];
  const PROJECT = { uid: 'p1', createdBy: 'someone', maintainingTeamUid: 'team-2', contributingTeams: [] };

  function build({ roles = ROLES, project = PROJECT as any, team = { uid: 'team-1' } as any } = {}) {
    const teams = {
      updateTeamProfileFields: jest.fn(async (uid: string, data: Record<string, unknown>) => ({
        uid,
        name: 'T',
        ...data,
      })),
    };
    const projects = {
      updateProjectProfileFields: jest.fn(async (uid: string, data: Record<string, unknown>) => ({
        uid,
        name: 'P',
        ...data,
      })),
    };
    const members = { findMemberByUid: jest.fn().mockResolvedValue({ ...MEMBER, teamMemberRoles: roles }) };
    const prisma = {
      team: { findFirst: jest.fn().mockResolvedValue(team) },
      project: { findFirst: jest.fn().mockResolvedValue(project) },
    };
    const tools = directoryWriteTools(teams as any, projects as any, members as any, prisma as any);
    return { updateTeam: tool(tools, 'update_team'), updateProject: tool(tools, 'update_project'), teams, projects };
  }

  describe('update_team', () => {
    it('saves the allowed fields for a team the member leads, trimming text and clearing on empty', async () => {
      const { updateTeam, teams } = build();
      const result: any = await updateTeam.execute(CTX, {
        teamUid: 'team-1',
        shortDescription: '  We build things ',
        blog: '',
      });
      expect(teams.updateTeamProfileFields).toHaveBeenCalledWith(
        'team-1',
        { shortDescription: 'We build things', blog: null },
        'ada@example.com'
      );
      expect(result).toMatchObject({ updated: ['shortDescription', 'blog'], team: { uid: 'team-1' } });
    });

    it('lets directory admins edit any team', async () => {
      const { updateTeam, teams } = build({ roles: [] });
      await updateTeam.execute(ADMIN, { teamUid: 'team-9', website: 'https://t9.xyz' });
      expect(teams.updateTeamProfileFields).toHaveBeenCalled();
    });

    it.each([
      ['a team the member is on but does not lead', CTX, { teamUid: 'team-2', blog: 'x' }, {}, ForbiddenException],
      ['a team the member is not on', CTX, { teamUid: 'team-9', blog: 'x' }, {}, ForbiddenException],
      ['an unknown team', ADMIN, { teamUid: 'team-9', blog: 'x' }, { team: null }, NotFoundException],
      ['no teamUid', CTX, { blog: 'x' }, {}, BadRequestException],
      ['nothing to change', CTX, { teamUid: 'team-1' }, {}, BadRequestException],
      ['a non-text value', CTX, { teamUid: 'team-1', blog: 42 }, {}, BadRequestException],
      ['text over the limit', CTX, { teamUid: 'team-1', longDescription: 'x'.repeat(5001) }, {}, BadRequestException],
    ])('refuses %s without writing', async (_label, ctx, args, setup, error) => {
      const { updateTeam, teams } = build(setup as any);
      await expect(updateTeam.execute(ctx as McpActorContext, args)).rejects.toBeInstanceOf(error);
      expect(teams.updateTeamProfileFields).not.toHaveBeenCalled();
    });

    it('refuses fields an agent may not change, naming them, even through the SDK schema', async () => {
      const { updateTeam, teams } = build();
      const args = { teamUid: 'team-1', name: 'Renamed', teamMemberRoles: [], blog: 'x' };
      expect((toolInputSchema(updateTeam) as z.ZodTypeAny).parse(args)).toEqual(args);
      await expect(updateTeam.execute(CTX, args)).rejects.toThrow('name, teamMemberRoles');
      expect(teams.updateTeamProfileFields).not.toHaveBeenCalled();
    });
  });

  describe('update_project', () => {
    it("saves the allowed fields for a project of one of the member's teams", async () => {
      const { updateProject, projects } = build();
      const result: any = await updateProject.execute(CTX, {
        projectUid: 'p1',
        tagline: ' Faster storage ',
        lookingForFunding: true,
        tags: [' storage ', 'ipfs', 'storage'],
        projectLinks: [{ name: 'Docs', url: 'https://docs.p1.xyz' }],
      });
      expect(projects.updateProjectProfileFields).toHaveBeenCalledWith('p1', {
        tagline: 'Faster storage',
        lookingForFunding: true,
        tags: ['storage', 'ipfs'],
        projectLinks: [{ name: 'Docs', url: 'https://docs.p1.xyz' }],
      });
      expect(result).toMatchObject({ updated: ['tagline', 'lookingForFunding', 'tags', 'projectLinks'] });
    });

    it.each([
      ['its creator', { roles: [], project: { ...PROJECT, createdBy: 'member-1' } }],
      [
        'a member of a contributing team',
        { roles: [{ teamUid: 'team-7' }], project: { ...PROJECT, contributingTeams: [{ uid: 'team-7' }] } },
      ],
    ])('lets %s edit it, like the project page', async (_label, setup) => {
      const { updateProject, projects } = build(setup as any);
      await updateProject.execute(CTX, { projectUid: 'p1', readMe: '# Hi' });
      expect(projects.updateProjectProfileFields).toHaveBeenCalled();
    });

    it.each([
      [
        "a project of none of the member's teams",
        CTX,
        { projectUid: 'p1', readMe: 'x' },
        { roles: [] },
        ForbiddenException,
      ],
      ['an unknown project', ADMIN, { projectUid: 'p1', readMe: 'x' }, { project: null }, NotFoundException],
      ['an empty description', CTX, { projectUid: 'p1', description: '  ' }, {}, BadRequestException],
      [
        'a link without https',
        CTX,
        { projectUid: 'p1', projectLinks: [{ name: 'x', url: 'javascript:alert(1)' }] },
        {},
        BadRequestException,
      ],
      [
        'too many tags',
        CTX,
        { projectUid: 'p1', tags: Array.from({ length: 21 }, (_, i) => `t${i}`) },
        {},
        BadRequestException,
      ],
      ['a non-boolean funding flag', CTX, { projectUid: 'p1', lookingForFunding: 'yes' }, {}, BadRequestException],
    ])('refuses %s without writing', async (_label, ctx, args, setup, error) => {
      const { updateProject, projects } = build(setup as any);
      await expect(updateProject.execute(ctx as McpActorContext, args)).rejects.toBeInstanceOf(error);
      expect(projects.updateProjectProfileFields).not.toHaveBeenCalled();
    });

    it('refuses fields an agent may not change, naming them', async () => {
      const { updateProject, projects } = build();
      await expect(
        updateProject.execute(CTX, { projectUid: 'p1', contributingTeams: [], contactEmail: 'x@y.z', readMe: 'x' })
      ).rejects.toThrow('contributingTeams, contactEmail');
      expect(projects.updateProjectProfileFields).not.toHaveBeenCalled();
    });
  });
});

describe('McpWriteLimitService', () => {
  function cache() {
    const store = new Map<string, unknown>();
    return {
      store,
      get: jest.fn(async (k: string) => store.get(k)),
      set: jest.fn(async (k: string, v: unknown) => void store.set(k, v)),
    };
  }

  it(`allows ${MCP_WRITE_LIMIT_PER_HOUR} calls per member per tool per hour, then refuses`, async () => {
    const c = cache();
    const limit = new McpWriteLimitService(c as any);
    const now = Date.UTC(2026, 9, 28, 10, 15);
    for (let i = 0; i < MCP_WRITE_LIMIT_PER_HOUR; i++) {
      expect(await limit.tryConsume('m1', 'post_team_news', now)).toBe(true);
    }
    expect(await limit.tryConsume('m1', 'post_team_news', now)).toBe(false);
    // Another tool, another member and the next hour each have their own allowance.
    expect(await limit.tryConsume('m1', 'update_my_profile', now)).toBe(true);
    expect(await limit.tryConsume('m2', 'post_team_news', now)).toBe(true);
    expect(await limit.tryConsume('m1', 'post_team_news', now + 60 * 60 * 1000)).toBe(true);
  });

  it('fails open when the cache is down', async () => {
    const limit = new McpWriteLimitService({ get: jest.fn().mockRejectedValue(new Error('redis down')) } as any);
    await expect(limit.tryConsume('m1', 'post_team_news')).resolves.toBe(true);
  });
});
