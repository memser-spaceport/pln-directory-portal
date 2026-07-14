import { NotFoundException } from '@nestjs/common';

// axios ships ESM (not in the jest transform allowlist) and the member-context
// path under test never calls it.
jest.mock('axios', () => ({ isAxiosError: jest.fn(() => false) }));

import { AiAppsService } from './ai-apps.service';

const MEMBER = {
  uid: 'member-1',
  name: 'Ada Lovelace',
  email: 'ada@example.com',
  officeHours: null,
  image: { url: 'https://cdn.example.com/ada.png' },
  location: { city: 'London', country: 'United Kingdom', continent: 'Europe' },
  skills: [{ title: 'Engineering' }, { title: 'Research' }],
  teamMemberRoles: [
    {
      role: 'Engineer',
      mainTeam: true,
      teamLead: false,
      team: { uid: 'team-1', name: 'Protocol Labs' },
    },
    {
      role: null,
      mainTeam: false,
      teamLead: true,
      team: { uid: 'team-2', name: 'Side Project' },
    },
  ],
};

function buildService(overrides: Record<string, any> = {}) {
  const prisma = {
    member: { findUnique: jest.fn().mockResolvedValue(MEMBER) },
    ...overrides,
  };
  return { service: new AiAppsService(prisma as any, {} as any), prisma };
}

describe('AiAppsService getMemberContext', () => {
  it('throws 404 when the member does not exist', async () => {
    const { service, prisma } = buildService();
    prisma.member.findUnique.mockResolvedValue(null);
    await expect(service.getMemberContext('missing')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('returns the curated public identity under `member`', async () => {
    const { service } = buildService();
    const result = await service.getMemberContext('member-1');
    expect(result).toEqual({
      member: {
        uid: 'member-1',
        name: 'Ada Lovelace',
        email: 'ada@example.com',
        officeHours: null,
        image: 'https://cdn.example.com/ada.png',
        location: { city: 'London', country: 'United Kingdom', continent: 'Europe' },
        skills: ['Engineering', 'Research'],
        teams: [
          { uid: 'team-1', name: 'Protocol Labs', role: 'Engineer', mainTeam: true, teamLead: false },
          { uid: 'team-2', name: 'Side Project', role: null, mainTeam: false, teamLead: true },
        ],
      },
    });
  });

  it('tolerates a member without image, location, skills, or teams', async () => {
    const { service, prisma } = buildService();
    prisma.member.findUnique.mockResolvedValue({
      uid: 'member-2',
      name: 'No Frills',
      email: null,
      officeHours: null,
      image: null,
      location: null,
      skills: [],
      teamMemberRoles: [],
    });
    const result = await service.getMemberContext('member-2');
    expect(result.member).toEqual({
      uid: 'member-2',
      name: 'No Frills',
      email: null,
      officeHours: null,
      image: null,
      location: null,
      skills: [],
      teams: [],
    });
  });

  it('selects only curated public fields (no raw relations leak through)', async () => {
    const { service, prisma } = buildService();
    await service.getMemberContext('member-1');
    const select = prisma.member.findUnique.mock.calls[0][0].select;
    expect(Object.keys(select).sort()).toEqual(
      ['email', 'image', 'location', 'name', 'officeHours', 'skills', 'teamMemberRoles', 'uid'].sort()
    );
    const result = await service.getMemberContext('member-1');
    expect(result.member).not.toHaveProperty('teamMemberRoles');
  });
});
