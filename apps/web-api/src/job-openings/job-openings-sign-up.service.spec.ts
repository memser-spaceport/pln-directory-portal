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

  /* The address is optional, and so is the company it refers to — so it has to
     survive on its own. It rides in `options` beside `role` rather than in the
     member payload, which is where `createMemberAndAttach` writes it to the
     Member row. */
  it('passes teamEmail through, with or without a team', async () => {
    await service.signUp({
      name: 'Ada',
      email: 'ada@personal.com',
      role: 'Engineer',
      teamEmail: 'ada@newco.xyz',
      team: { uid: 'team-1' },
    });

    expect(membersService.createMemberAndAttach.mock.calls[0][1]).toMatchObject({
      teamEmail: 'ada@newco.xyz',
      team: { uid: 'team-1' },
    });

    await service.signUp({
      name: 'Ada',
      email: 'ada@personal.com',
      role: 'Engineer',
      teamEmail: 'ada@newco.xyz',
    });

    expect(membersService.createMemberAndAttach.mock.calls[1][1]).toMatchObject({
      teamEmail: 'ada@newco.xyz',
      team: undefined,
    });
  });

  it('leaves teamEmail undefined when it was not given', async () => {
    await service.signUp({ name: 'Ada', email: 'ada@example.com', role: 'Engineer' });

    expect(membersService.createMemberAndAttach.mock.calls[0][1].teamEmail).toBeUndefined();
  });

  /* It is an address or it is absent — a half-typed one must not reach the
     Member row, because the whole point of the field is that a reviewer can
     act on it. */
  it('rejects a malformed teamEmail and accepts its absence', () => {
    const base = { name: 'Ada', email: 'ada@example.com', role: 'Engineer' };

    expect(JobBoardSignUpSchema.safeParse({ ...base, teamEmail: 'not-an-email' }).success).toBe(false);
    expect(JobBoardSignUpSchema.safeParse({ ...base, teamEmail: '' }).success).toBe(false);
    expect(JobBoardSignUpSchema.safeParse(base).success).toBe(true);
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
