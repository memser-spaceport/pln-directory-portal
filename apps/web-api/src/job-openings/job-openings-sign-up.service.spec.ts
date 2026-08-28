jest.mock('../members/members.service', () => ({
  MembersService: class MembersService {},
}));

import { ConflictException, NotFoundException } from '@nestjs/common';
import { JobBoardSignUpSchema } from 'libs/contracts/src/schema/job-application';
import { JOB_ASPIRANT_POLICY_CODE } from '../access-control-v2/access-control-v2.constants';
import type { MembersService } from '../members/members.service';
import type { PrismaService } from '../shared/prisma.service';
import { JobOpeningsSignUpService } from './job-openings-sign-up.service';

type PrismaMock = {
  policy: { findUnique: jest.Mock };
  policyAssignment: { upsert: jest.Mock };
};

const buildPrismaMock = (): PrismaMock => ({
  policy: { findUnique: jest.fn().mockResolvedValue({ uid: 'policy-job-aspirant' }) },
  policyAssignment: { upsert: jest.fn().mockResolvedValue({ uid: 'assignment-1' }) },
});

describe('JobOpeningsSignUpService', () => {
  let service: JobOpeningsSignUpService;
  let membersService: { createMemberAndAttach: jest.Mock };
  let prisma: PrismaMock;

  beforeEach(() => {
    membersService = { createMemberAndAttach: jest.fn().mockResolvedValue({ uid: 'member-1' }) };
    prisma = buildPrismaMock();
    service = new JobOpeningsSignUpService(
      membersService as unknown as MembersService,
      prisma as unknown as PrismaService
    );
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

  it('assigns the Job Aspirant policy after creating a member with no team', async () => {
    await service.signUp({ name: 'Ada', email: 'ada@example.com', role: 'Engineer' });

    expect(prisma.policy.findUnique).toHaveBeenCalledWith({
      where: { code: JOB_ASPIRANT_POLICY_CODE },
      select: { uid: true },
    });
    expect(prisma.policyAssignment.upsert).toHaveBeenCalledWith({
      where: {
        memberUid_policyUid: {
          memberUid: 'member-1',
          policyUid: 'policy-job-aspirant',
        },
      },
      update: {},
      create: {
        memberUid: 'member-1',
        policyUid: 'policy-job-aspirant',
      },
    });
  });

  it('does not assign Job Aspirant or job-board signUpSource when an existing team is selected', async () => {
    await service.signUp({
      name: 'Ada',
      email: 'ada@example.com',
      role: 'Engineer',
      team: { uid: 'team-1' },
    });

    expect(membersService.createMemberAndAttach.mock.calls[0][0].signUpSource).toBeUndefined();
    expect(prisma.policy.findUnique).not.toHaveBeenCalled();
    expect(prisma.policyAssignment.upsert).not.toHaveBeenCalled();
  });

  it('does not assign Job Aspirant or job-board signUpSource when creating a new team', async () => {
    await service.signUp({
      name: 'Ada',
      email: 'ada@example.com',
      role: 'Engineer',
      isTeamNew: true,
      team: { name: 'New Co', website: 'https://new.co' },
    });

    expect(membersService.createMemberAndAttach.mock.calls[0][0].signUpSource).toBeUndefined();
    expect(prisma.policy.findUnique).not.toHaveBeenCalled();
    expect(prisma.policyAssignment.upsert).not.toHaveBeenCalled();
  });

  it('throws when the Job Aspirant policy is missing', async () => {
    prisma.policy.findUnique.mockResolvedValue(null);

    await expect(service.signUp({ name: 'Ada', email: 'ada@example.com', role: 'Engineer' })).rejects.toBeInstanceOf(
      NotFoundException
    );

    expect(prisma.policyAssignment.upsert).not.toHaveBeenCalled();
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

  /* Unlike `teamEmail` one block up, this rides in the member payload rather
     than in `options` — `prepareMemberFromParticipantRequest` already maps and
     writes it on the create path, so it needs no follow-up update and no new
     code. Guarding the argument position is the point of this test: moving it
     to `options` would be silently ignored, since nothing there reads it. */
  it('passes jobSearchStatus through on the member payload', async () => {
    await service.signUp({
      name: 'Ada',
      email: 'ada@example.com',
      role: 'Engineer',
      jobSearchStatus: 'actively-looking',
    });

    expect(membersService.createMemberAndAttach.mock.calls[0][0]).toMatchObject({
      jobSearchStatus: 'actively-looking',
    });
    expect(membersService.createMemberAndAttach.mock.calls[0][1].jobSearchStatus).toBeUndefined();
  });

  it('leaves jobSearchStatus undefined when it was not given', async () => {
    await service.signUp({ name: 'Ada', email: 'ada@example.com', role: 'Engineer' });

    expect(membersService.createMemberAndAttach.mock.calls[0][0].jobSearchStatus).toBeUndefined();
  });

  /* The three wire values and nothing else. They have to match the
     `JobSearchStatus` Prisma enum, and the schema is the only thing standing
     between a typo and a 500 from `toPrismaJobSearchStatus` further in. */
  it('accepts the three job search statuses and refuses anything else', () => {
    const base = { name: 'Ada', email: 'ada@example.com', role: 'Engineer' };

    for (const status of ['actively-looking', 'open-to-right-role', 'not-looking']) {
      expect(JobBoardSignUpSchema.safeParse({ ...base, jobSearchStatus: status }).success).toBe(true);
    }
    expect(JobBoardSignUpSchema.safeParse({ ...base, jobSearchStatus: 'ACTIVELY_LOOKING' }).success).toBe(false);
    expect(JobBoardSignUpSchema.safeParse({ ...base, jobSearchStatus: '' }).success).toBe(false);
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

    await expect(service.signUp({ name: 'Ada', email: 'ada@example.com', role: 'Engineer' })).rejects.toBeInstanceOf(
      ConflictException
    );

    expect(prisma.policy.findUnique).not.toHaveBeenCalled();
    expect(prisma.policyAssignment.upsert).not.toHaveBeenCalled();
  });

  it('does not create a JobApplication', async () => {
    await service.signUp({ name: 'Ada', email: 'ada@example.com', role: 'Engineer' });
    expect(Object.keys(membersService)).toEqual(['createMemberAndAttach']);
    expect(prisma).not.toHaveProperty('jobApplication');
  });

  it('creates a member when role is omitted', async () => {
    await service.signUp({ name: 'Ada', email: 'ada@example.com' });

    expect(membersService.createMemberAndAttach.mock.calls[0][1].role).toBeUndefined();
  });

  it('treats a blank role as omitted', () => {
    const base = { name: 'Ada', email: 'ada@example.com' };

    expect(JobBoardSignUpSchema.parse(base).role).toBeUndefined();
    expect(JobBoardSignUpSchema.parse({ ...base, role: '' }).role).toBeUndefined();
    expect(JobBoardSignUpSchema.parse({ ...base, role: '   ' }).role).toBeUndefined();
    expect(JobBoardSignUpSchema.parse({ ...base, role: 'Engineer' }).role).toBe('Engineer');
    expect(JobBoardSignUpSchema.safeParse({ ...base, role: 'x'.repeat(201) }).success).toBe(false);
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
