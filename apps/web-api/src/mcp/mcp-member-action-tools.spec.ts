jest.mock('../member-experiences/member-experiences.service', () => ({ MemberExperiencesService: jest.fn() }));
jest.mock('../follows/follows.service', () => ({ FollowsService: jest.fn() }));
jest.mock('../job-openings/job-openings-saved.service', () => ({ JobOpeningsSavedService: jest.fn() }));
jest.mock('../job-openings/job-openings-query.service', () => ({ JobOpeningsQueryService: jest.fn() }));
jest.mock('../job-alerts/job-alerts.service', () => ({ JobAlertsService: jest.fn() }));
jest.mock('../team-news/team-news.service', () => ({ TeamNewsService: jest.fn() }));
jest.mock('../team-news/team-news-query.service', () => ({ TeamNewsQueryService: jest.fn() }));
jest.mock('../members/members.service', () => ({ MembersService: jest.fn() }));
jest.mock('../members/members.hooks.service', () => ({ MembersHooksService: jest.fn() }));
jest.mock('../pl-events/pl-event-guests.service', () => ({ PLEventGuestsService: jest.fn() }));
jest.mock('../pl-events/pl-event-locations.service', () => ({ PLEventLocationsService: jest.fn() }));
jest.mock('../teams/teams.service', () => ({ TeamsService: jest.fn() }));
jest.mock('../projects/projects.service', () => ({ ProjectsService: jest.fn() }));

import { BadRequestException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { z } from 'zod';
import { McpActorContext, McpToolDef, toolInputSchema } from './mcp-tools';
import { experienceTools, followTools, jobAlertTools, savedJobTools } from './mcp-member-action-tools';

const CTX: McpActorContext = {
  memberUid: 'member-1',
  name: 'Ada',
  email: 'ada@example.com',
  permissions: new Set(),
  authorizationUid: 'auth-1',
  clientName: 'Codex',
  agentAccess: 'read',
};

function tool(tools: McpToolDef[], name: string): McpToolDef {
  const found = tools.find((t) => t.name === name);
  if (!found) throw new Error(`missing tool ${name}`);
  return found;
}

/** What the SDK hands `execute` after validating with the tool's schema. */
function sdkArgs(t: McpToolDef, args: Record<string, unknown>) {
  return (toolInputSchema(t) as z.ZodTypeAny).parse(args);
}

describe('experience tools', () => {
  const OWN = {
    uid: 'exp-1',
    memberUid: 'member-1',
    title: 'Engineer',
    company: 'Acme',
    location: null,
    startDate: new Date('2020-01-01'),
    endDate: new Date('2022-01-01'),
    isCurrent: false,
  };

  function build(owned: any = OWN) {
    const experiences = {
      create: jest.fn(async (dto) => ({ uid: 'exp-new', ...dto })),
      update: jest.fn(async (uid, dto) => ({ ...OWN, ...dto, uid })),
      remove: jest.fn().mockResolvedValue(OWN),
      getAllMemberExperience: jest.fn().mockResolvedValue([OWN]),
    };
    const prisma = { memberExperience: { findFirst: jest.fn().mockResolvedValue(owned) } };
    return { tools: experienceTools(experiences as any, prisma as any), experiences, prisma };
  }

  it('adds a current role for the caller only', async () => {
    const { tools, experiences } = build();
    const result: any = await tool(tools, 'add_experience').execute(CTX, {
      title: ' Lead ',
      company: 'Beta',
      startDate: '2024-03-01',
    });
    expect(experiences.create).toHaveBeenCalledWith({
      memberUid: 'member-1',
      title: 'Lead',
      company: 'Beta',
      location: null,
      startDate: new Date('2024-03-01'),
      endDate: null,
      isCurrent: true,
    });
    expect(result.added).toMatchObject({ uid: 'exp-new', isCurrent: true });
  });

  it.each([
    ['another member', { title: 'X', company: 'Y', startDate: '2024-01-01', memberUid: 'someone-else' }],
    ['no title', { company: 'Y', startDate: '2024-01-01' }],
    ['a bad date', { title: 'X', company: 'Y', startDate: 'last year' }],
    ['an end before the start', { title: 'X', company: 'Y', startDate: '2024-01-01', endDate: '2023-01-01' }],
  ])('refuses to add with %s', async (_label, args) => {
    const { tools, experiences } = build();
    await expect(tool(tools, 'add_experience').execute(CTX, args)).rejects.toBeInstanceOf(BadRequestException);
    expect(experiences.create).not.toHaveBeenCalled();
  });

  it("only looks up the caller's own experience, and treats another member's as not found", async () => {
    const { tools, experiences, prisma } = build(null);
    await expect(
      tool(tools, 'update_experience').execute(CTX, { experienceUid: 'exp-9', title: 'Hacked' })
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(tool(tools, 'delete_experience').execute(CTX, { experienceUid: 'exp-9' })).rejects.toBeInstanceOf(
      NotFoundException
    );
    expect(prisma.memberExperience.findFirst).toHaveBeenCalledWith({ where: { uid: 'exp-9', memberUid: 'member-1' } });
    expect(experiences.update).not.toHaveBeenCalled();
    expect(experiences.remove).not.toHaveBeenCalled();
  });

  it('marks a role current and clears its end date', async () => {
    const { tools, experiences } = build();
    await tool(tools, 'update_experience').execute(CTX, { experienceUid: 'exp-1', isCurrent: true });
    expect(experiences.update).toHaveBeenCalledWith(
      'exp-1',
      { memberUid: 'member-1', isCurrent: true, endDate: null },
      'ada@example.com'
    );
  });

  it('sends only the changed fields', async () => {
    const { tools, experiences } = build();
    await tool(tools, 'update_experience').execute(CTX, { experienceUid: 'exp-1', location: '' });
    expect(experiences.update.mock.calls[0][1]).toEqual({ memberUid: 'member-1', location: null });
  });

  it.each([
    ['nothing', { experienceUid: 'exp-1' }],
    ['a start after the existing end', { experienceUid: 'exp-1', startDate: '2023-01-01' }],
    ['isCurrent with an endDate', { experienceUid: 'exp-1', isCurrent: true, endDate: '2024-01-01' }],
  ])('refuses an update with %s', async (_label, args) => {
    const { tools, experiences } = build();
    await expect(tool(tools, 'update_experience').execute(CTX, args)).rejects.toBeInstanceOf(BadRequestException);
    expect(experiences.update).not.toHaveBeenCalled();
  });

  it('refuses to end a current role without an end date, as the page does', async () => {
    const { tools } = build({ ...OWN, endDate: null, isCurrent: true });
    await expect(
      tool(tools, 'update_experience').execute(CTX, { experienceUid: 'exp-1', isCurrent: false })
    ).rejects.toThrow('End date is required');
  });

  it('deletes an own experience', async () => {
    const { tools, experiences } = build();
    const result: any = await tool(tools, 'delete_experience').execute(CTX, { experienceUid: 'exp-1' });
    expect(experiences.remove).toHaveBeenCalledWith('exp-1');
    expect(result.deleted).toMatchObject({ uid: 'exp-1' });
  });
});

describe('follow tools', () => {
  it('follows and unfollows as the caller', async () => {
    const follows = {
      followTeam: jest.fn().mockResolvedValue({ following: true, entityUid: 't1', followerCount: 3 }),
      unfollowTeam: jest.fn().mockResolvedValue({ following: false, entityUid: 't1', followerCount: 2 }),
    };
    const tools = followTools(follows as any);
    expect(await tool(tools, 'follow_team').execute(CTX, { teamUid: 't1' })).toMatchObject({ following: true });
    expect(await tool(tools, 'unfollow_team').execute(CTX, { teamUid: 't1' })).toMatchObject({ following: false });
    expect(follows.followTeam).toHaveBeenCalledWith('member-1', 't1');
    expect(follows.unfollowTeam).toHaveBeenCalledWith('member-1', 't1');
  });

  it('refuses following on behalf of someone else', async () => {
    const follows = { followTeam: jest.fn() };
    const follow = tool(followTools(follows as any), 'follow_team');
    await expect(follow.execute(CTX, sdkArgs(follow, { teamUid: 't1', memberUid: 'x' }))).rejects.toThrow('memberUid');
    expect(follows.followTeam).not.toHaveBeenCalled();
  });
});

describe('saved job tools', () => {
  it("saves and unsaves with the caller's email", async () => {
    const saved = {
      save: jest.fn().mockResolvedValue({ jobUid: 'j1', viewerHasSaved: true }),
      unsave: jest.fn().mockResolvedValue({ jobUid: 'j1', viewerHasSaved: false }),
    };
    const tools = savedJobTools(saved as any);
    await tool(tools, 'save_job').execute(CTX, { jobUid: 'j1' });
    await tool(tools, 'unsave_job').execute(CTX, { jobUid: 'j1' });
    expect(saved.save).toHaveBeenCalledWith('j1', 'ada@example.com');
    expect(saved.unsave).toHaveBeenCalledWith('j1', 'ada@example.com');
  });

  it('refuses a member without an email', async () => {
    const saved = { save: jest.fn() };
    await expect(
      tool(savedJobTools(saved as any), 'save_job').execute({ ...CTX, email: null }, { jobUid: 'j1' })
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(saved.save).not.toHaveBeenCalled();
  });
});

describe('job alert tools', () => {
  const FILTERS = {
    roleCategory: [{ value: 'Engineering', count: 4 }],
    seniority: [{ value: 'Senior (L4)', count: 2 }],
    location: [{ value: 'Remote', count: 3 }],
    workMode: [{ value: 'Remote', count: 3 }],
    focus: [{ value: 'Digital Human Rights', count: 2, children: [{ value: 'Privacy', count: 1 }] }],
  };

  function build(existing: any = null) {
    const alerts = {
      list: jest.fn().mockResolvedValue({ items: existing ? [existing] : [], total: existing ? 1 : 0 }),
      create: jest.fn(async (_m, input) => ({ uid: 'a-new', name: 'auto', ...input })),
      update: jest.fn(async (_m, uid, input) => ({ uid, ...input })),
      delete: jest.fn().mockResolvedValue(undefined),
    };
    const query = { getFilters: jest.fn().mockResolvedValue(FILTERS) };
    return { tools: jobAlertTools(alerts as any, query as any), alerts, query };
  }

  it('creates an alert with the canonical spelling of each value', async () => {
    const { tools, alerts } = build();
    const result: any = await tool(tools, 'set_job_alert').execute(CTX, {
      roleCategory: ['engineering'],
      focus: ['privacy'],
    });
    expect(alerts.create).toHaveBeenCalledWith('member-1', {
      filterState: {
        q: undefined,
        roleCategory: ['Engineering'],
        seniority: [],
        focus: ['Privacy'],
        location: [],
        workMode: [],
      },
    });
    expect(result.created).toBe(true);
  });

  it("replaces the filters of the member's existing alert", async () => {
    const { tools, alerts } = build({ uid: 'a1', name: 'Mine' });
    await tool(tools, 'set_job_alert').execute(CTX, { name: 'Remote eng', workMode: ['Remote'] });
    expect(alerts.update).toHaveBeenCalledWith('member-1', 'a1', expect.objectContaining({ name: 'Remote eng' }));
    expect(alerts.create).not.toHaveBeenCalled();
  });

  it.each([
    ['an unknown value', { roleCategory: ['Astrology'] }, 'Unknown roleCategory: Astrology. Use one of: Engineering'],
    ['no filters', { name: 'Empty' }, 'Set at least one filter'],
    ['an unknown field', { roleCategory: ['Engineering'], memberUid: 'x' }, 'memberUid'],
  ])('refuses %s', async (_label, args, message) => {
    const { tools, alerts } = build();
    const set = tool(tools, 'set_job_alert');
    await expect(set.execute(CTX, sdkArgs(set, args))).rejects.toThrow(message);
    expect(alerts.create).not.toHaveBeenCalled();
    expect(alerts.update).not.toHaveBeenCalled();
  });

  it('deletes the alert, and does nothing without one', async () => {
    const withAlert = build({ uid: 'a1' });
    expect(await tool(withAlert.tools, 'delete_job_alert').execute(CTX, {})).toMatchObject({ deleted: true });
    expect(withAlert.alerts.delete).toHaveBeenCalledWith('member-1', 'a1');

    const without = build();
    expect(await tool(without.tools, 'delete_job_alert').execute(CTX, {})).toEqual({ deleted: false });
    expect(without.alerts.delete).not.toHaveBeenCalled();
  });

  it('returns the alert with the values set_job_alert accepts', async () => {
    const { tools } = build({ uid: 'a1' });
    const result: any = await tool(tools, 'get_my_job_alert').execute(CTX, {});
    expect(result.alert).toEqual({ uid: 'a1' });
    expect(result.filterOptions.focus).toEqual(['Digital Human Rights', 'Privacy']);
  });
});
