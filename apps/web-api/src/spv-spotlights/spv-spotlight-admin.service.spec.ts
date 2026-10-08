import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { SpvSpotlightAdminService } from './spv-spotlight-admin.service';
import { SpvSpotlightsService } from './spv-spotlights.service';

jest.mock('../notifications/notification-service.client', () => ({
  NotificationServiceClient: class NotificationServiceClient {},
}));
jest.mock('../auth/auth.service', () => ({
  AuthService: class AuthService {},
}));

describe('SpvSpotlightAdminService organization and rejection', () => {
  const provisionedMember = {
    memberUid: 'mem_1',
    isNewUser: false,
    willBeTeamLead: false,
    summaryDelta: { createdUsers: 0, updatedUsers: 1, createdTeams: 0, updatedMemberships: 0, promotedToLead: 0 },
  };
  const provisionInvestorFromBulkRow = jest.fn();

  beforeEach(() => {
    provisionInvestorFromBulkRow.mockReset().mockResolvedValue(provisionedMember);
  });

  function serviceWith(prisma: Record<string, unknown>) {
    const prismaWithTransaction: Record<string, unknown> = {
      member: { findFirst: jest.fn().mockResolvedValue(null) },
      ...prisma,
      $transaction: (run: (tx: unknown) => unknown) => run(prismaWithTransaction),
    };
    return new SpvSpotlightAdminService(
      prismaWithTransaction as never,
      { send: jest.fn(), loginLink: jest.fn() } as never,
      { provisionInvestorFromBulkRow } as never
    );
  }

  it('clears an open or rejected application when the email is imported as pre-approved', async () => {
    const deleteMany = jest.fn().mockResolvedValue({ count: 1 });
    const prisma = {
      spvSpotlight: { findUnique: jest.fn().mockResolvedValue({ uid: 'spv_1' }) },
      member: {
        findFirst: jest.fn().mockResolvedValue({
          uid: 'mem_1',
          memberApproval: { state: 'APPROVED' },
        }),
      },
      spvSpotlightParticipant: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({}),
      },
      spvAccessRequest: { deleteMany },
    };
    const service = serviceWith(prisma);
    jest
      .spyOn(service as unknown as { upsertInvestorMember: () => Promise<{ uid: string }> }, 'upsertInvestorMember')
      .mockResolvedValue({ uid: 'mem_1' });

    await service.addParticipantsBulk('spv_1', 'PRE_APPROVED', [{ email: 'Ada@Example.com', name: 'Ada' }]);

    expect(deleteMany).toHaveBeenCalledWith({
      where: { spvSpotlightUid: 'spv_1', memberUid: 'mem_1', status: { in: ['PENDING', 'REJECTED'] } },
    });
  });

  it('does not move a pre-approved investor back to outreach on re-import', async () => {
    const update = jest.fn();
    const prisma = {
      spvSpotlight: { findUnique: jest.fn().mockResolvedValue({ uid: 'spv_1' }) },
      spvSpotlightParticipant: {
        findUnique: jest.fn().mockResolvedValue({ uid: 'p_1', type: 'INVESTOR', cohort: 'PRE_APPROVED' }),
        update,
      },
      spvAccessRequest: { deleteMany: jest.fn() },
    };
    const service = serviceWith(prisma);
    jest
      .spyOn(service as unknown as { upsertInvestorMember: () => Promise<{ uid: string }> }, 'upsertInvestorMember')
      .mockResolvedValue({ uid: 'mem_1' });

    const result = await service.addParticipantsBulk('spv_1', 'OUTREACH', [{ email: 'ada@example.com' }]);

    expect(result).toMatchObject({ created: 0, updated: 0, skipped: 1 });
    expect(update).not.toHaveBeenCalled();
  });

  it('creates outreach investors without auto-approve on login', async () => {
    const prisma = {
      spvSpotlight: { findUnique: jest.fn().mockResolvedValue({ uid: 'spv_1' }) },
      spvSpotlightParticipant: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({}),
      },
      spvAccessRequest: { deleteMany: jest.fn() },
    };

    const service = serviceWith(prisma);
    jest
      .spyOn(service as unknown as { upsertInvestorMember: () => Promise<{ uid: string }> }, 'upsertInvestorMember')
      .mockResolvedValue({ uid: 'mem_1' });

    await service.addParticipantsBulk('spv_1', 'OUTREACH', [{ email: 'ada@example.com' }]);

    expect(provisionInvestorFromBulkRow.mock.calls[0][4]).toMatchObject({ useApproveOnLogin: false });
  });

  it('does not clear a rejection for an outreach import', async () => {
    const deleteMany = jest.fn();
    const prisma = {
      spvSpotlight: { findUnique: jest.fn().mockResolvedValue({ uid: 'spv_1' }) },
      spvSpotlightParticipant: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({}),
      },
      spvAccessRequest: { deleteMany },
    };
    const service = serviceWith(prisma);
    jest
      .spyOn(service as unknown as { upsertInvestorMember: () => Promise<{ uid: string }> }, 'upsertInvestorMember')
      .mockResolvedValue({ uid: 'mem_1' });

    await service.addParticipantsBulk('spv_1', 'OUTREACH', [{ email: 'ada@example.com' }]);

    expect(deleteMany).not.toHaveBeenCalled();
  });

  it('provisions the member profile and organization team from the uploaded row', async () => {
    const create = jest.fn().mockResolvedValue({});
    const prisma = {
      spvSpotlight: { findUnique: jest.fn().mockResolvedValue({ uid: 'spv_1' }) },
      spvSpotlightParticipant: { findUnique: jest.fn().mockResolvedValue(null), create },
      spvAccessRequest: { deleteMany: jest.fn() },
    };
    provisionInvestorFromBulkRow.mockResolvedValue({
      ...provisionedMember,
      orgTeamUid: 'team_1',
      summaryDelta: { ...provisionedMember.summaryDelta, createdTeams: 1 },
    });
    const service = serviceWith(prisma);
    jest
      .spyOn(service as unknown as { upsertInvestorMember: () => Promise<{ uid: string }> }, 'upsertInvestorMember')
      .mockResolvedValue({ uid: 'mem_1' });

    const result = await service.addParticipantsBulk('spv_1', 'PRE_APPROVED', [
      {
        email: 'Ada@Example.com',
        name: 'Ada',
        organization: 'Acme Ventures',
        investmentType: 'FUND',
        emailTemplateVariables: { firm: 'Acme' },
      },
    ]);

    expect(provisionInvestorFromBulkRow.mock.calls[0][1]).toMatchObject({
      email: 'ada@example.com',
      name: 'Ada',
      organization: 'Acme Ventures',
      investmentType: 'FUND',
    });
    expect(provisionInvestorFromBulkRow.mock.calls[0][1]).not.toHaveProperty('emailTemplateVariables');
    expect(provisionInvestorFromBulkRow.mock.calls[0][4]).toMatchObject({ useApproveOnLogin: true });
    expect(create.mock.calls[0][0].data.emailTemplateVariables).toEqual({ firm: 'Acme' });
    expect(result.created).toBe(1);
    expect(result.summary).toMatchObject({ total: 1, updatedUsers: 1, createdTeams: 1, errors: 0 });
    expect(result.rows[0]).toMatchObject({ email: 'ada@example.com', status: 'success', teamId: 'team_1' });
  });

  it('reports a failed row and keeps processing the rest', async () => {
    const prisma = {
      spvSpotlight: { findUnique: jest.fn().mockResolvedValue({ uid: 'spv_1' }) },
      spvSpotlightParticipant: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({}),
      },
      spvAccessRequest: { deleteMany: jest.fn() },
    };
    provisionInvestorFromBulkRow
      .mockRejectedValueOnce(new Error('Telegram handle taken'))
      .mockResolvedValueOnce(provisionedMember);
    const service = serviceWith(prisma);
    jest
      .spyOn(service as unknown as { upsertInvestorMember: () => Promise<{ uid: string }> }, 'upsertInvestorMember')
      .mockResolvedValue({ uid: 'mem_1' });

    const result = await service.addParticipantsBulk('spv_1', 'PRE_APPROVED', [
      { email: 'bad@example.com', name: 'Bad' },
      { email: 'good@example.com', name: 'Good' },
    ]);

    expect(result.created).toBe(1);
    expect(result.summary).toMatchObject({ total: 2, errors: 1 });
    expect(result.rows.map((row) => row.status)).toEqual(['error', 'success']);
    expect(result.rows[0].message).toBe('Telegram handle taken');
  });

  it('refuses a second spotlight for the same team', async () => {
    const prisma = {
      team: { findUnique: jest.fn().mockResolvedValue({ uid: 'team_1', name: 'Netholabs' }) },
      spvSpotlight: { findUnique: jest.fn().mockResolvedValue({ uid: 'existing' }) },
    };
    const service = serviceWith(prisma);
    await expect(
      service.create({ teamUid: 'team_1', title: 'SPV Spotlight: Netholabs', description: '<p>Hello</p>' })
    ).rejects.toBeInstanceOf(ConflictException);
  });
});

describe('attach or create organization team', () => {
  it('attaches an existing team and creates one when the name is new', async () => {
    const teamCreate = jest.fn().mockResolvedValue({ uid: 'team_new' });
    const roleCreate = jest.fn().mockResolvedValue({});
    const prisma = {
      team: {
        findFirst: jest.fn().mockResolvedValueOnce({ uid: 'team_existing' }).mockResolvedValueOnce(null),
        create: teamCreate,
      },
      teamMemberRole: {
        findMany: jest.fn().mockResolvedValue([]),
        create: roleCreate,
      },
    };
    const service = new SpvSpotlightsService(prisma as never);
    const attach = (
      service as unknown as {
        attachOrganization: (memberUid: string, role: string, organization: string) => Promise<string>;
      }
    ).attachOrganization.bind(service);

    const first = await attach('mem_1', 'Partner', 'Acme');
    expect(first).toBe('team_existing');
    const second = await attach('mem_1', 'Partner', 'New Fund');
    expect(second).toBe('team_new');
    expect(teamCreate).toHaveBeenCalledWith({
      data: { name: 'New Fund', accessLevel: 'L0' },
      select: { uid: true },
    });
    expect(roleCreate).toHaveBeenCalledTimes(2);
  });

  it('reuses the team when create hits a unique name', async () => {
    const duplicate = new Prisma.PrismaClientKnownRequestError('unique', 'P2002', '4.4.0');
    const prisma = {
      team: {
        findFirst: jest.fn().mockResolvedValueOnce(null).mockResolvedValueOnce({ uid: 'team_race' }),
        create: jest.fn().mockRejectedValue(duplicate),
      },
      teamMemberRole: {
        findMany: jest.fn().mockResolvedValue([{ teamUid: 'other', mainTeam: true }]),
        create: jest.fn().mockResolvedValue({}),
      },
    };
    const service = new SpvSpotlightsService(prisma as never);
    const attach = (
      service as unknown as {
        attachOrganization: (memberUid: string, role: string, organization: string) => Promise<string>;
      }
    ).attachOrganization.bind(service);

    await expect(attach('mem_1', 'Partner', 'Acme')).resolves.toBe('team_race');
    expect(prisma.teamMemberRole.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ mainTeam: false, investmentTeam: true, teamUid: 'team_race' }),
    });
  });
});

describe('approve access request', () => {
  it('adds the applicant to the investors list', async () => {
    const upsert = jest.fn().mockResolvedValue({ emailTemplateVariables: { firm: 'Gamma' } });
    const memberUpdate = jest.fn();
    const prisma = {
      spvAccessRequest: {
        findFirst: jest.fn().mockResolvedValue({
          uid: 'req_1',
          spvSpotlightUid: 'spv_1',
          status: 'PENDING',
          role: 'Partner',
          organization: 'Fund',
          member: { uid: 'mem_1', name: 'Ada', email: 'ada@example.com' },
          spvSpotlight: { uid: 'spv_1', title: 'SPV', slug: 'spv', emailTemplates: null, team: { name: 'Netholabs' } },
        }),
        update: jest.fn().mockResolvedValue({}),
      },
      spvSpotlightParticipant: { upsert },
      member: {
        findUnique: jest.fn().mockResolvedValue({ memberApproval: { state: 'PENDING' } }),
        update: memberUpdate,
      },
    };
    const send = jest.fn();
    const service = new SpvSpotlightAdminService(prisma as never, { send, loginLink: jest.fn() } as never, {} as never);

    await service.approveAccessRequest('spv_1', 'req_1');

    expect(memberUpdate).toHaveBeenCalledWith({ where: { uid: 'mem_1' }, data: { approveOnLogin: true } });
    expect(send.mock.calls[0][0].extra).toEqual({ firm: 'Gamma', role: 'Partner', organization: 'Fund' });

    expect(upsert).toHaveBeenCalledWith({
      where: { spvSpotlightUid_memberUid: { spvSpotlightUid: 'spv_1', memberUid: 'mem_1' } },
      create: { spvSpotlightUid: 'spv_1', memberUid: 'mem_1', type: 'INVESTOR', access: 'VIEW' },
      update: {},
    });
  });
});

describe('investor lists', () => {
  function serviceWith(prisma: Record<string, unknown>) {
    return new SpvSpotlightAdminService(
      prisma as never,
      { send: jest.fn(), loginLink: jest.fn() } as never,
      {} as never
    );
  }

  it('returns each participant with their application status', async () => {
    const prisma = {
      spvSpotlight: { findUnique: jest.fn().mockResolvedValue({ uid: 'spv_1' }) },
      spvSpotlightParticipant: {
        findMany: jest.fn().mockResolvedValue([
          { uid: 'p_1', memberUid: 'mem_1' },
          { uid: 'p_2', memberUid: 'mem_2' },
        ]),
      },
      spvAccessRequest: { findMany: jest.fn().mockResolvedValue([{ memberUid: 'mem_1', status: 'PENDING' }]) },
    };

    const participants = await serviceWith(prisma).listParticipants('spv_1');

    expect(participants.map((participant) => participant.accessRequestStatus)).toEqual(['PENDING', null]);
  });

  it('clears open applications and enables auto-approve when an investor is granted access', async () => {
    const deleteMany = jest.fn().mockResolvedValue({ count: 1 });
    const memberUpdate = jest.fn();
    const prisma = {
      spvSpotlight: { findUnique: jest.fn().mockResolvedValue({ uid: 'spv_1', teamUid: 'team_1' }) },
      spvSpotlightParticipant: {
        findFirst: jest.fn().mockResolvedValue({ uid: 'p_1', memberUid: 'mem_1', type: 'INVESTOR' }),
        update: jest.fn().mockResolvedValue({}),
      },
      spvAccessRequest: { deleteMany },
      member: { findUnique: jest.fn().mockResolvedValue({ memberApproval: null }), update: memberUpdate },
    };

    await serviceWith(prisma).updateParticipant('spv_1', 'p_1', { cohort: 'PRE_APPROVED' });

    expect(deleteMany).toHaveBeenCalledWith({
      where: { spvSpotlightUid: 'spv_1', memberUid: 'mem_1', status: { in: ['PENDING', 'REJECTED'] } },
    });
    expect(memberUpdate).toHaveBeenCalledWith({ where: { uid: 'mem_1' }, data: { approveOnLogin: true } });
  });

  it('moves a founder to the investors list as pre-approved', async () => {
    const update = jest.fn().mockResolvedValue({});
    const deleteMany = jest.fn().mockResolvedValue({ count: 0 });
    const memberUpdate = jest.fn();
    const prisma = {
      spvSpotlight: { findUnique: jest.fn().mockResolvedValue({ uid: 'spv_1', teamUid: 'team_1' }) },
      spvSpotlightParticipant: {
        findFirst: jest.fn().mockResolvedValue({ uid: 'p_1', memberUid: 'mem_1', type: 'FOUNDER', cohort: null }),
        update,
      },
      spvAccessRequest: { deleteMany },
      member: {
        findUnique: jest.fn().mockResolvedValue({ memberApproval: { state: 'PENDING' } }),
        update: memberUpdate,
      },
      policy: { findUnique: jest.fn().mockResolvedValue({ uid: 'pol_1' }) },
      policyAssignment: { upsert: jest.fn().mockResolvedValue({}) },
    };

    await serviceWith(prisma).updateParticipant('spv_1', 'p_1', { type: 'INVESTOR' });

    expect(update.mock.calls[0][0].data).toEqual({
      cohort: 'PRE_APPROVED',
      access: 'VIEW',
      teamUid: null,
      type: 'INVESTOR',
    });
    expect(deleteMany).toHaveBeenCalled();
    expect(memberUpdate).toHaveBeenCalledWith({ where: { uid: 'mem_1' }, data: { approveOnLogin: true } });
    expect(prisma.policyAssignment.upsert).toHaveBeenCalled();
  });

  it('resets an investor made founder like an auto-added founder', async () => {
    const update = jest.fn().mockResolvedValue({});
    const prisma = {
      spvSpotlight: { findUnique: jest.fn().mockResolvedValue({ uid: 'spv_1', teamUid: 'team_1' }) },
      spvSpotlightParticipant: {
        findFirst: jest.fn().mockResolvedValue({ uid: 'p_1', memberUid: 'mem_1', type: 'INVESTOR' }),
        update,
      },
    };

    await serviceWith(prisma).updateParticipant('spv_1', 'p_1', { type: 'FOUNDER' });

    expect(update.mock.calls[0][0].data).toEqual({ cohort: null, access: 'EDIT', teamUid: 'team_1', type: 'FOUNDER' });
  });

  it('revokes approved applications when investors are removed', async () => {
    const updateMany = jest.fn();
    const prisma = {
      spvSpotlight: { findUnique: jest.fn().mockResolvedValue({ uid: 'spv_1' }) },
      spvSpotlightParticipant: {
        findMany: jest.fn().mockResolvedValue([{ memberUid: 'mem_1' }]),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      spvAccessRequest: { updateMany },
    };

    await serviceWith(prisma).removeParticipantsBulk('spv_1', ['p_1']);

    expect(updateMany).toHaveBeenCalledWith({
      where: { spvSpotlightUid: 'spv_1', memberUid: { in: ['mem_1'] }, status: 'APPROVED' },
      data: { status: 'REJECTED' },
    });
  });

  it('sends the open notice only to investors who have access', async () => {
    const investor = (n: string, cohort: string | null) => ({
      uid: `p_${n}`,
      memberUid: `mem_${n}`,
      cohort,
      openNoticeSentCount: 0,
      member: { uid: `mem_${n}`, email: `${n}@x.io` },
    });
    const prisma = {
      spvSpotlight: { findUnique: jest.fn().mockResolvedValue({ uid: 'spv_1' }) },
      spvSpotlightParticipant: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            investor('1', 'PRE_APPROVED'),
            investor('2', 'PRE_APPROVED'),
            investor('3', null),
            investor('4', 'OUTREACH'),
          ]),
      },
      spvAccessRequest: {
        findMany: jest.fn().mockResolvedValue([
          { uid: 'r_2', memberUid: 'mem_2', status: 'REJECTED', openNoticeSentCount: 0 },
          { uid: 'r_3', memberUid: 'mem_3', status: 'APPROVED', openNoticeSentCount: 0 },
        ]),
      },
    };

    const preview = await serviceWith(prisma).openNoticePreview('spv_1');

    expect(preview).toEqual({ willReceive: 2, alreadySent: 0 });
  });

  it('keeps the application when an investor is moved to outreach', async () => {
    const deleteMany = jest.fn();
    const prisma = {
      spvSpotlight: { findUnique: jest.fn().mockResolvedValue({ uid: 'spv_1', teamUid: 'team_1' }) },
      spvSpotlightParticipant: {
        findFirst: jest.fn().mockResolvedValue({ uid: 'p_1', memberUid: 'mem_1' }),
        update: jest.fn().mockResolvedValue({}),
      },
      spvAccessRequest: { deleteMany },
    };

    await serviceWith(prisma).updateParticipant('spv_1', 'p_1', { cohort: 'OUTREACH' });

    expect(deleteMany).not.toHaveBeenCalled();
  });
});
