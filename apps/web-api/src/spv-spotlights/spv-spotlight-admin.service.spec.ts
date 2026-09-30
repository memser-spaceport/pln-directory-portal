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
  function serviceWith(prisma: Record<string, unknown>) {
    return new SpvSpotlightAdminService(prisma as never, { send: jest.fn(), loginLink: jest.fn() } as never);
  }

  it('clears a rejected request when the email is imported as pre-approved', async () => {
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
      where: { spvSpotlightUid: 'spv_1', memberUid: 'mem_1', status: 'REJECTED' },
    });
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
    const upsert = jest.fn().mockResolvedValue({});
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
    };
    const service = new SpvSpotlightAdminService(prisma as never, { send: jest.fn(), loginLink: jest.fn() } as never);

    await service.approveAccessRequest('spv_1', 'req_1');

    expect(upsert).toHaveBeenCalledWith({
      where: { spvSpotlightUid_memberUid: { spvSpotlightUid: 'spv_1', memberUid: 'mem_1' } },
      create: { spvSpotlightUid: 'spv_1', memberUid: 'mem_1', type: 'INVESTOR', access: 'VIEW' },
      update: {},
    });
  });
});

describe('investor lists', () => {
  function serviceWith(prisma: Record<string, unknown>) {
    return new SpvSpotlightAdminService(prisma as never, { send: jest.fn(), loginLink: jest.fn() } as never);
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

  it('clears a rejected application when an investor is granted access', async () => {
    const deleteMany = jest.fn().mockResolvedValue({ count: 1 });
    const prisma = {
      spvSpotlightParticipant: {
        findFirst: jest.fn().mockResolvedValue({ uid: 'p_1', memberUid: 'mem_1' }),
        update: jest.fn().mockResolvedValue({}),
      },
      spvAccessRequest: { deleteMany },
    };

    await serviceWith(prisma).updateParticipant('spv_1', 'p_1', { cohort: 'PRE_APPROVED' });

    expect(deleteMany).toHaveBeenCalledWith({
      where: { spvSpotlightUid: 'spv_1', memberUid: 'mem_1', status: 'REJECTED' },
    });
  });

  it('keeps the application when an investor is moved to outreach', async () => {
    const deleteMany = jest.fn();
    const prisma = {
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
