jest.mock('../members/members.service', () => ({
  MembersService: class MembersService {},
}));

import { ConflictException } from '@nestjs/common';
import { JobBoardSignUpSchema } from 'libs/contracts/src/schema/job-application';
import type { MembersService } from '../members/members.service';
import { JobOpeningsSignUpService } from './job-openings-sign-up.service';

describe('JobOpeningsSignUpService', () => {
  let service: JobOpeningsSignUpService;
  let membersService: { createMemberAndAttach: jest.Mock };

  beforeEach(() => {
    membersService = { createMemberAndAttach: jest.fn().mockResolvedValue({ uid: 'member-1' }) };
    service = new JobOpeningsSignUpService(membersService as unknown as MembersService);
  });

  it('creates a member with job-board signUpSource and role', async () => {
    await expect(
      service.signUp({
        name: 'Ada',
        email: 'ada@example.com',
        role: 'Engineer',
        linkedinHandler: 'ada',
      })
    ).resolves.toEqual({ uid: 'member-1' });

    expect(membersService.createMemberAndAttach).toHaveBeenCalledWith(
      {
        name: 'Ada',
        email: 'ada@example.com',
        linkedinHandler: 'ada',
        signUpSource: 'job-board',
      },
      {
        role: 'Engineer',
        isTeamNew: false,
        team: undefined,
        requestorEmail: 'ada@example.com',
      }
    );
  });

  it('attaches an existing team', async () => {
    await service.signUp({
      name: 'Ada',
      email: 'ada@example.com',
      role: 'Engineer',
      team: { uid: 'team-1' },
    });

    expect(membersService.createMemberAndAttach.mock.calls[0][1]).toMatchObject({
      isTeamNew: false,
      team: { uid: 'team-1' },
    });
  });

  it('creates a new team when isTeamNew is true', async () => {
    await service.signUp({
      name: 'Ada',
      email: 'ada@example.com',
      role: 'Engineer',
      isTeamNew: true,
      team: { name: 'New Co', website: 'https://new.co' },
    });

    expect(membersService.createMemberAndAttach.mock.calls[0][1]).toMatchObject({
      isTeamNew: true,
      team: { name: 'New Co', website: 'https://new.co' },
    });
  });

  it('surfaces duplicate email as 409 from createMemberAndAttach', async () => {
    membersService.createMemberAndAttach.mockRejectedValue(
      new ConflictException('An account with this email already exists. Sign in or use a different email address.')
    );

    await expect(
      service.signUp({ name: 'Ada', email: 'ada@example.com', role: 'Engineer' })
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('does not create a JobApplication', async () => {
    await service.signUp({ name: 'Ada', email: 'ada@example.com', role: 'Engineer' });
    expect(Object.keys(membersService)).toEqual(['createMemberAndAttach']);
  });

  it('requires team.name when isTeamNew is true', () => {
    expect(
      JobBoardSignUpSchema.safeParse({
        name: 'Ada',
        email: 'ada@example.com',
        role: 'Engineer',
        isTeamNew: true,
        team: { uid: 'team-1' },
      }).success
    ).toBe(false);
  });
});
