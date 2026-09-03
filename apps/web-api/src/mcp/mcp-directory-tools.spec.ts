import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { FORUM_PERMISSIONS } from '../access-control-v2/access-control-v2.constants';
import { MembersService } from '../members/members.service';
import { TeamsService } from '../teams/teams.service';
import { ProjectsService } from '../projects/projects.service';
import { PLEventsService } from '../pl-events/pl-events.service';
import { SearchService } from '../search/search.service';
import { compactMemberRow, compactTeamRow, compactProjectRow, compactEventRow } from './mcp-directory-viewer';
import { directoryTools } from './mcp-directory-tools';
import { McpActorContext, toolsForPermissions, WHOAMI_TOOL } from './mcp-tools';

function ctxFor(memberUid: string, email: string | null = 'member@example.com'): McpActorContext {
  return {
    memberUid,
    name: 'Test Member',
    email,
    permissions: new Set<string>(),
    authorizationUid: 'auth-uid',
    clientName: 'test-client',
  };
}

function tool(catalog: ReturnType<typeof directoryTools>, name: string) {
  const found = catalog.find((t) => t.name === name);
  if (!found) throw new Error(`tool not found: ${name}`);
  return found;
}

describe('mcp-directory-viewer compact mappers', () => {
  const richMemberRow = {
    uid: 'member-1',
    name: 'Alice',
    email: 'alice@example.com',
    telegramHandler: '@alice',
    telegramUid: 'tg-1',
    accessLevel: 'L4',
    permissions: ['admin'],
    officeHours: 'https://cal.example/alice',
    image: { uid: 'img-1', url: 'https://img.example/alice.png' },
    location: { uid: 'loc-1', country: 'USA', city: 'NYC' },
    teamMemberRoles: [{ mainTeam: true, team: { name: 'Team Alpha' } }],
  };

  it('never passes through unlisted fields for members', () => {
    const row = compactMemberRow(richMemberRow);
    expect(Object.keys(row).sort()).toEqual(['image', 'location', 'mainTeam', 'name', 'uid'].sort());
    expect(row).not.toHaveProperty('email');
    expect(row).not.toHaveProperty('telegramHandler');
    expect(row).not.toHaveProperty('accessLevel');
    expect(row).not.toHaveProperty('permissions');
    expect(row.mainTeam).toBe('Team Alpha');
    expect(row.location).toEqual({ city: 'NYC', country: 'USA' });
  });

  it('never passes through unlisted fields for teams', () => {
    const row = compactTeamRow({
      uid: 't1',
      name: 'Team Alpha',
      shortDescription: 'desc',
      accessLevel: 'L0',
      website: 'https://team.example',
      logo: { url: 'https://img.example/team.png' },
    });
    expect(Object.keys(row).sort()).toEqual(['image', 'name', 'shortDescription', 'uid'].sort());
  });

  it('never passes through unlisted fields for projects', () => {
    const row = compactProjectRow({
      uid: 'p1',
      name: 'Project X',
      tagline: 'tagline',
      description: 'long internal description',
      contactEmail: 'internal@example.com',
      logo: { url: 'https://img.example/project.png' },
    });
    expect(Object.keys(row).sort()).toEqual(['image', 'name', 'tagline', 'uid'].sort());
  });

  it('never passes through unlisted fields for events', () => {
    const row = compactEventRow({
      uid: 'e1',
      name: 'Event X',
      slugURL: 'event-x',
      startDate: '2026-01-01',
      endDate: '2026-01-02',
      resources: [{ isPrivate: true }],
      logo: { url: 'https://img.example/event.png' },
      location: { location: 'San Francisco', timezone: 'PST' },
    });
    expect(Object.keys(row).sort()).toEqual(
      ['image', 'name', 'slugURL', 'startDate', 'endDate', 'location', 'uid'].sort()
    );
    expect(row.location).toBe('San Francisco');
  });
});

describe('directoryTools get_member permission parity', () => {
  const members = {
    searchMembers: jest.fn(),
    findOne: jest.fn(),
    findMemberByEmail: jest.fn(),
  } as unknown as MembersService;
  const teams = {} as unknown as TeamsService;
  const projects = {} as unknown as ProjectsService;
  const events = {} as unknown as PLEventsService;
  const search = {} as unknown as SearchService;
  const catalog = directoryTools(members, teams, projects, events, search);

  beforeEach(() => jest.clearAllMocks());

  it('omits jobSearchStatus when actor views another member (non-admin)', async () => {
    (members.findOne as jest.Mock).mockResolvedValue({ uid: 'other-member', jobSearchStatus: 'ACTIVELY_LOOKING' });
    (members.findMemberByEmail as jest.Mock).mockResolvedValue({ uid: 'actor-1', isDirectoryAdmin: false });

    const result = await tool(catalog, 'get_member').execute(ctxFor('actor-1'), { uid: 'other-member' });

    expect(result).not.toHaveProperty('jobSearchStatus');
  });

  it('includes jobSearchStatus when actor views self', async () => {
    (members.findOne as jest.Mock).mockResolvedValue({ uid: 'actor-1', jobSearchStatus: 'ACTIVELY_LOOKING' });

    const result = await tool(catalog, 'get_member').execute(ctxFor('actor-1'), { uid: 'actor-1' });

    expect(result.jobSearchStatus).toBe('actively-looking');
    expect(members.findMemberByEmail).not.toHaveBeenCalled();
  });

  it('includes jobSearchStatus when actor is a directory admin viewing another member', async () => {
    (members.findOne as jest.Mock).mockResolvedValue({ uid: 'other-member', jobSearchStatus: 'NOT_LOOKING' });
    (members.findMemberByEmail as jest.Mock).mockResolvedValue({ uid: 'actor-1', isDirectoryAdmin: true });

    const result = await tool(catalog, 'get_member').execute(ctxFor('actor-1'), { uid: 'other-member' });

    expect(result.jobSearchStatus).toBe('not-looking');
  });
});

describe('directoryTools get_team permission parity', () => {
  const members = {} as unknown as MembersService;
  const teams = { searchTeams: jest.fn(), findTeamByUid: jest.fn() } as unknown as TeamsService;
  const projects = {} as unknown as ProjectsService;
  const events = {} as unknown as PLEventsService;
  const search = {} as unknown as SearchService;
  const catalog = directoryTools(members, teams, projects, events, search);

  it('throws ForbiddenException for an L0 team when the actor is not a member/admin, same as REST', async () => {
    (teams.findTeamByUid as jest.Mock).mockRejectedValue(new ForbiddenException('Team is inactive'));

    await expect(tool(catalog, 'get_team').execute(ctxFor('actor-1', null), { uid: 'l0-team' })).rejects.toBeInstanceOf(
      ForbiddenException
    );
    expect(teams.findTeamByUid).toHaveBeenCalledWith('l0-team', undefined);
  });
});

describe('directoryTools get_project respects isDeleted', () => {
  const members = {} as unknown as MembersService;
  const teams = {} as unknown as TeamsService;
  const projects = { searchProjects: jest.fn(), getProjectByUid: jest.fn() } as unknown as ProjectsService;
  const events = {} as unknown as PLEventsService;
  const search = {} as unknown as SearchService;
  const catalog = directoryTools(members, teams, projects, events, search);

  it('throws NotFoundException for a soft-deleted project, same as REST', async () => {
    (projects.getProjectByUid as jest.Mock).mockResolvedValue({ uid: 'p1', isDeleted: true });

    await expect(tool(catalog, 'get_project').execute(ctxFor('actor-1'), { uid: 'p1' })).rejects.toBeInstanceOf(
      NotFoundException
    );
  });
});

describe('directoryTools get_event', () => {
  const members = {} as unknown as MembersService;
  const teams = {} as unknown as TeamsService;
  const projects = {} as unknown as ProjectsService;
  const events = { searchPLEvents: jest.fn(), getPLEventForViewer: jest.fn() } as unknown as PLEventsService;
  const search = {} as unknown as SearchService;
  const catalog = directoryTools(members, teams, projects, events, search);

  it('applies guest telegram preference hiding via getPLEventForViewer as an authenticated viewer', async () => {
    const eventWithGuests = {
      uid: 'event-1',
      eventGuests: [
        { telegramId: 'tg-1', member: { telegramHandler: '@guest', preferences: { showTelegram: false } } },
      ],
    };
    (events.getPLEventForViewer as jest.Mock).mockResolvedValue(eventWithGuests);

    const result = await tool(catalog, 'get_event').execute(ctxFor('actor-1'), { uid: 'event-1' });

    expect(events.getPLEventForViewer).toHaveBeenCalledWith('event-1', { isUserLoggedIn: true });
    expect(result).toBe(eventWithGuests);
  });
});

describe('directoryTools forum visibility', () => {
  const members = {} as unknown as MembersService;
  const teams = {} as unknown as TeamsService;
  const projects = {} as unknown as ProjectsService;
  const events = {} as unknown as PLEventsService;
  const search = { searchForumPosts: jest.fn(), getForumThreadByUid: jest.fn() } as unknown as SearchService;
  const catalog = [WHOAMI_TOOL, ...directoryTools(members, teams, projects, events, search)];

  it('hides forum tools without forum.read', () => {
    const visible = toolsForPermissions(new Set<string>(), catalog).map((t) => t.name);
    expect(visible).not.toContain('search_forum_threads');
    expect(visible).not.toContain('get_forum_thread');
    expect(visible).toContain('search_members');
    expect(visible).toContain('whoami');
  });

  it('exposes forum tools with forum.read', () => {
    const visible = toolsForPermissions(new Set([FORUM_PERMISSIONS.READ]), catalog).map((t) => t.name);
    expect(visible).toContain('search_forum_threads');
    expect(visible).toContain('get_forum_thread');
  });
});

describe('directoryTools search tools return whitelisted compact rows', () => {
  it('search_members never returns email/telegram/accessLevel/permissions', async () => {
    const members = {
      searchMembers: jest.fn().mockResolvedValue({
        members: [
          {
            uid: 'm1',
            name: 'Alice',
            email: 'alice@example.com',
            telegramHandler: '@alice',
            accessLevel: 'L4',
            permissions: ['admin'],
          },
        ],
      }),
    } as unknown as MembersService;
    const catalog = directoryTools(members, {} as any, {} as any, {} as any, {} as any);

    const result = await tool(catalog, 'search_members').execute(ctxFor('actor-1'), { q: 'alice' });
    const results = result.results as Record<string, unknown>[];

    expect(results).toHaveLength(1);
    const row = results[0];
    expect(row).not.toHaveProperty('email');
    expect(row).not.toHaveProperty('telegramHandler');
    expect(row).not.toHaveProperty('accessLevel');
    expect(row).not.toHaveProperty('permissions');
  });
});
