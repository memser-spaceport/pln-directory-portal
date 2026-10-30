jest.mock('../demo-days/demo-day-fundraising-profiles.service', () => ({
  DemoDayFundraisingProfilesService: jest.fn(),
}));
jest.mock('../team-pitches/team-pitch-profiles.service', () => ({ TeamPitchProfilesService: jest.fn() }));
jest.mock('../team-news/team-news.service', () => ({ TeamNewsService: jest.fn() }));
jest.mock('../team-news/team-news-query.service', () => ({ TeamNewsQueryService: jest.fn() }));
jest.mock('../members/members.service', () => ({ MembersService: jest.fn() }));
jest.mock('../members/members.hooks.service', () => ({ MembersHooksService: jest.fn() }));
jest.mock('../pl-events/pl-event-guests.service', () => ({ PLEventGuestsService: jest.fn() }));
jest.mock('../pl-events/pl-event-locations.service', () => ({ PLEventLocationsService: jest.fn() }));
jest.mock('../teams/teams.service', () => ({ TeamsService: jest.fn() }));
jest.mock('../projects/projects.service', () => ({ ProjectsService: jest.fn() }));

import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { z } from 'zod';
import { McpActorContext, McpToolDef, toolInputSchema } from './mcp-tools';
import { pitchProfileTools } from './mcp-pitch-profile-tools';

const CTX: McpActorContext = {
  memberUid: 'member-1',
  name: 'Ada',
  email: 'ada@example.com',
  permissions: new Set(),
  authorizationUid: 'auth-1',
  clientName: 'Codex',
  agentAccess: 'write',
};

function build() {
  const fundraising = {
    updateFundraisingTeam: jest.fn().mockResolvedValue({ founders: [{ email: 'x@y.z' }] }),
    updateFundraisingDescription: jest.fn().mockResolvedValue({ founders: [{ email: 'x@y.z' }] }),
  };
  const pitches = {
    updateTeam: jest.fn().mockResolvedValue({}),
    updateProfileDescription: jest.fn().mockResolvedValue({}),
  };
  const prisma = {
    industryTag: {
      findMany: jest.fn(async ({ where }) =>
        [
          { uid: 'it-1', title: 'DeFi' },
          { uid: 'it-2', title: 'AI' },
        ].filter((t) => where.OR.some((c: any) => c.title.equals.toLowerCase() === t.title.toLowerCase()))
      ),
    },
    fundingStage: {
      findFirst: jest.fn(async ({ where }) => (where.title.equals.toLowerCase() === 'seed' ? { uid: 'fs-1' } : null)),
      findMany: jest.fn().mockResolvedValue([{ title: 'Pre-seed' }, { title: 'Seed' }]),
    },
  };
  const tools = pitchProfileTools(fundraising as any, pitches as any, prisma as any);
  const tool = (name: string) => tools.find((t) => t.name === name) as McpToolDef;
  return { fundraising, pitches, tool };
}

describe('update_fundraising_profile (LAB-3064)', () => {
  it('resolves tag and stage titles and updates through the founder-checked service', async () => {
    const { fundraising, tool } = build();
    const result: any = await tool('update_fundraising_profile').execute(CTX, {
      demoDay: 'plw262',
      teamUid: 't1',
      description: ' We build X ',
      industryTags: ['defi', 'AI'],
      fundingStage: 'seed',
      website: 'https://x.io',
    });
    expect(fundraising.updateFundraisingTeam).toHaveBeenCalledWith(
      'ada@example.com',
      't1',
      { website: 'https://x.io', industryTags: ['it-1', 'it-2'], fundingStage: 'fs-1' },
      'plw262'
    );
    expect(fundraising.updateFundraisingDescription).toHaveBeenCalledWith(
      'ada@example.com',
      't1',
      'We build X',
      'plw262'
    );
    expect(result).toEqual({
      updated: ['description', 'website', 'industryTags', 'fundingStage'],
      demoDay: 'plw262',
      teamUid: 't1',
    });
    expect(JSON.stringify(result)).not.toContain('@');
  });

  it.each([
    ['an unknown tag', { industryTags: ['Astrology'] }, 'Unknown industry tags: Astrology'],
    ['an unknown stage', { fundingStage: 'Series Z' }, 'Use one of: Pre-seed, Seed'],
    ['a non-http website', { website: 'javascript:alert(1)' }, 'http(s)'],
    ['an empty name', { name: '  ' }, "can't be empty"],
    ['nothing', {}, 'Nothing to update'],
  ])('refuses %s before writing', async (_label, extra, message) => {
    const { fundraising, tool } = build();
    await expect(
      tool('update_fundraising_profile').execute(CTX, { demoDay: 'plw262', teamUid: 't1', ...extra })
    ).rejects.toThrow(message);
    expect(fundraising.updateFundraisingTeam).not.toHaveBeenCalled();
    expect(fundraising.updateFundraisingDescription).not.toHaveBeenCalled();
  });

  it('refuses the logo, program and other fields by name', async () => {
    const { fundraising, tool } = build();
    const t = tool('update_fundraising_profile');
    const parsed = (toolInputSchema(t) as z.ZodTypeAny).parse({
      demoDay: 'd',
      teamUid: 't1',
      name: 'N',
      logo: 'img-1',
    });
    await expect(t.execute(CTX, parsed)).rejects.toBeInstanceOf(BadRequestException);
    expect(fundraising.updateFundraisingTeam).not.toHaveBeenCalled();
  });

  it("passes the service's founder check through", async () => {
    const { fundraising, tool } = build();
    fundraising.updateFundraisingTeam.mockRejectedValueOnce(new ForbiddenException('Only founders'));
    await expect(
      tool('update_fundraising_profile').execute(CTX, { demoDay: 'd', teamUid: 't9', name: 'Hijack' })
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(fundraising.updateFundraisingDescription).not.toHaveBeenCalled();
  });
});

describe('update_team_pitch_profile (LAB-3064)', () => {
  it('updates the pitch team fields and clears the description with an empty string', async () => {
    const { pitches, tool } = build();
    await tool('update_team_pitch_profile').execute(CTX, { pitch: 'acme', name: 'Acme', description: '' });
    expect(pitches.updateTeam).toHaveBeenCalledWith('ada@example.com', 'acme', { name: 'Acme' });
    expect(pitches.updateProfileDescription).toHaveBeenCalledWith('ada@example.com', 'acme', null);
  });

  it('only describes when no team field is sent', async () => {
    const { pitches, tool } = build();
    await tool('update_team_pitch_profile').execute(CTX, { pitch: 'acme', description: 'New' });
    expect(pitches.updateTeam).not.toHaveBeenCalled();
    expect(pitches.updateProfileDescription).toHaveBeenCalledWith('ada@example.com', 'acme', 'New');
  });
});
