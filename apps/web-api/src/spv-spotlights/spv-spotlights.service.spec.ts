import { SpvSpotlightsService } from './spv-spotlights.service';

jest.mock('../notifications/notification-service.client', () => ({
  NotificationServiceClient: class NotificationServiceClient {},
}));
jest.mock('../auth/auth.service', () => ({
  AuthService: class AuthService {},
}));

describe('SpvSpotlightsService getBySlug viewer access', () => {
  const spotlight = {
    uid: 'spv_1',
    slug: 'netholabs',
    status: 'OPEN',
    title: 'Netholabs',
    description: null,
    supportEmail: null,
    closesAt: null,
    summary: null,
    fundName: null,
    investment: null,
    targetSpvSize: null,
    minimumInvestment: null,
    managementFee: null,
    carriedInterest: null,
    expenseReserve: null,
    investorEligibility: null,
    liquidity: null,
    docSendUrl: 'https://docsend.com/view/x',
    emailOnDataRoomRequest: false,
    media: [],
    team: {
      uid: 'team_1',
      name: 'Netholabs',
      logo: null,
      shortDescription: null,
      longDescription: null,
      website: null,
      location: null,
      teamSize: null,
      fundingStage: null,
      industryTags: [],
      teamMemberRoles: [],
    },
  };

  const buildService = (
    participant: { type: string; cohort?: string | null; access?: string; dataRoomEmailSentAt?: Date | null } | null,
    requestStatus: string | null = null,
    record: Record<string, unknown> = spotlight
  ) => {
    const prisma = {
      spvSpotlight: { findUnique: jest.fn().mockResolvedValue(record) },
      member: { findFirst: jest.fn().mockResolvedValue({ uid: 'mem_1' }) },
      spvAccessRequest: {
        findUnique: jest.fn().mockResolvedValue(requestStatus ? { status: requestStatus } : null),
      },
      spvSpotlightParticipant: { findUnique: jest.fn().mockResolvedValue(participant) },
    };
    return { service: new SpvSpotlightsService(prisma as never, { send: jest.fn() } as never), prisma };
  };

  it('approves a founder participant and shows the data room', async () => {
    const { service, prisma } = buildService({ type: 'FOUNDER' });

    const result = await service.getBySlug('netholabs', 'founder@example.com');

    expect(result.viewerAccess).toBe('APPROVED');
    expect(result.docSendUrl).toBe('https://docsend.com/view/x');
    expect(result.spvDetails).toEqual({
      fundName: null,
      investment: null,
      targetSpvSize: null,
      minimumInvestment: null,
      managementFee: null,
      carriedInterest: null,
      expenseReserve: null,
      investorEligibility: null,
      liquidity: null,
    });
    expect(result.emailOnDataRoomRequest).toBe(false);
    expect(result.dataRoomEmailSent).toBe(false);
    expect(prisma.spvSpotlightParticipant.findUnique).toHaveBeenCalledWith({
      where: { spvSpotlightUid_memberUid: { spvSpotlightUid: 'spv_1', memberUid: 'mem_1' } },
      select: { type: true, cohort: true, access: true, dataRoomEmailSentAt: true },
    });
  });

  it('keeps approving a pre-approved investor', async () => {
    const { service } = buildService({ type: 'INVESTOR', cohort: 'PRE_APPROVED', access: 'VIEW' });

    const result = await service.getBySlug('netholabs', 'investor@example.com');

    expect(result.viewerAccess).toBe('APPROVED');
  });

  it('keeps a member who is not a participant locked out', async () => {
    const { service } = buildService(null);

    const result = await service.getBySlug('netholabs', 'someone@example.com');

    expect(result.viewerAccess).toBe('NONE');
    expect(result.docSendUrl).toBeNull();
  });

  it('hides the DocSend link until the data room email is sent', async () => {
    const hidden = { ...spotlight, emailOnDataRoomRequest: true };
    const waiting = buildService(
      { type: 'INVESTOR', cohort: 'PRE_APPROVED', access: 'VIEW', dataRoomEmailSentAt: null },
      null,
      hidden
    );
    const before = await waiting.service.getBySlug('netholabs', 'investor@example.com');
    expect(before.docSendUrl).toBeNull();
    expect(before.emailOnDataRoomRequest).toBe(true);
    expect(before.dataRoomEmailSent).toBe(false);

    const sent = buildService(
      { type: 'INVESTOR', cohort: 'PRE_APPROVED', access: 'VIEW', dataRoomEmailSentAt: new Date() },
      null,
      hidden
    );
    const after = await sent.service.getBySlug('netholabs', 'investor@example.com');
    expect(after.docSendUrl).toBe('https://docsend.com/view/x');
    expect(after.dataRoomEmailSent).toBe(true);
  });
});

describe('sendDataRoomAccessEmail', () => {
  const spotlight = {
    uid: 'spv_1',
    slug: 'netholabs',
    status: 'OPEN',
    title: 'Netholabs',
    supportEmail: 'labos@plnetwork.io',
    senderEmail: null,
    senderName: null,
    replyToEmail: null,
    emailOnDataRoomRequest: true,
    docSendUrl: 'https://docsend.com/view/x',
    emailTemplates: null,
    team: { name: 'Netholabs' },
  };

  it('sends once and returns the link on a later call', async () => {
    const send = jest.fn().mockResolvedValue('link');
    let sentAt: Date | null = null;
    const prisma = {
      spvSpotlight: { findUnique: jest.fn().mockResolvedValue(spotlight) },
      member: {
        findFirst: jest.fn().mockResolvedValue({ uid: 'mem_1', name: 'Ada Lovelace', email: 'ada@example.com' }),
      },
      spvAccessRequest: { findUnique: jest.fn().mockResolvedValue(null) },
      spvSpotlightParticipant: {
        findUnique: jest.fn().mockImplementation(async () => ({
          uid: 'part_1',
          type: 'INVESTOR',
          cohort: 'PRE_APPROVED',
          access: 'VIEW',
          dataRoomEmailSentAt: sentAt,
        })),
        update: jest.fn().mockImplementation(async () => {
          sentAt = new Date();
          return {};
        }),
      },
    };
    const service = new SpvSpotlightsService(prisma as never, { send } as never);

    const first = await service.sendDataRoomAccessEmail('netholabs', 'ada@example.com');
    expect(first.docSendUrl).toBe('https://docsend.com/view/x');
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        bccSender: false,
        replyTo: 'netholabsspv@plcapital.xyz',
        from: { email: 'netholabsspv@plcapital.xyz', name: 'PL Capital, Netholabs SPV' },
        cc: [],
        extra: { docSendLink: 'https://docsend.com/view/x' },
      })
    );

    const second = await service.sendDataRoomAccessEmail('netholabs', 'ada@example.com');
    expect(second.docSendUrl).toBe('https://docsend.com/view/x');
    expect(send).toHaveBeenCalledTimes(1);
  });
});
