import { SpvSpotlightsService } from './spv-spotlights.service';
import { dataRoomEmailSubject } from './spv-spotlight.utils';

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

  it('shows the DocSend link before the data room email is sent', async () => {
    const hidden = { ...spotlight, emailOnDataRoomRequest: true };
    const waiting = buildService(
      { type: 'INVESTOR', cohort: 'PRE_APPROVED', access: 'VIEW', dataRoomEmailSentAt: null },
      null,
      hidden
    );
    const before = await waiting.service.getBySlug('netholabs', 'investor@example.com');
    expect(before.docSendUrl).toBe('https://docsend.com/view/x');
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
        updateMany: jest.fn().mockImplementation(async () => {
          if (sentAt) return { count: 0 };
          sentAt = new Date();
          return { count: 1 };
        }),
        update: jest.fn().mockImplementation(async ({ data }) => {
          sentAt = data.dataRoomEmailSentAt;
          return {};
        }),
      },
    };
    const service = new SpvSpotlightsService(prisma as never, { send } as never);

    const previousBcc = process.env.SPV_DATA_ROOM_BCC;
    process.env.SPV_DATA_ROOM_BCC = 'ops@plnetwork.io, labos@plnetwork.io';
    try {
      const first = await service.sendDataRoomAccessEmail('netholabs', 'ada@example.com');
      expect(first.docSendUrl).toBe('https://docsend.com/view/x');
      expect(send).toHaveBeenCalledTimes(1);
      expect(send.mock.calls[0][0]).toEqual(
        expect.objectContaining({
          bccSender: true,
          bcc: ['ops@plnetwork.io', 'labos@plnetwork.io'],
          replyTo: 'netholabsspv@plcapital.xyz',
          from: { email: 'netholabsspv@plcapital.xyz', name: 'PL Capital, Netholabs SPV' },
          cc: [],
          extra: { docSendLink: 'https://docsend.com/view/x' },
          template: expect.objectContaining({
            subject: dataRoomEmailSubject('stored', 'Ada Lovelace'),
          }),
        })
      );

      const second = await service.sendDataRoomAccessEmail('netholabs', 'ada@example.com');
      expect(second.docSendUrl).toBe('https://docsend.com/view/x');
      expect(second.alreadySent).toBe(true);
      expect(send).toHaveBeenCalledTimes(1);
    } finally {
      if (previousBcc === undefined) delete process.env.SPV_DATA_ROOM_BCC;
      else process.env.SPV_DATA_ROOM_BCC = previousBcc;
    }
  });

  it('replaces a shared data room subject with one that includes the recipient', async () => {
    const send = jest.fn().mockResolvedValue('link');
    const prisma = {
      spvSpotlight: {
        findUnique: jest.fn().mockResolvedValue({
          ...spotlight,
          emailTemplates: {
            dataRoomAccess: { subject: 'Connecting you to Netholabs SPV Team', body: '<p>Hi</p>' },
          },
        }),
      },
      member: {
        findFirst: jest.fn().mockResolvedValue({ uid: 'mem_1', name: 'Ada Lovelace', email: 'ada@example.com' }),
      },
      spvAccessRequest: { findUnique: jest.fn().mockResolvedValue(null) },
      spvSpotlightParticipant: {
        findUnique: jest.fn().mockResolvedValue({
          uid: 'part_1',
          type: 'INVESTOR',
          cohort: 'PRE_APPROVED',
          access: 'VIEW',
          dataRoomEmailSentAt: null,
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    const service = new SpvSpotlightsService(prisma as never, { send } as never);

    await service.sendDataRoomAccessEmail('netholabs', 'ada@example.com');

    expect(send.mock.calls[0][0].template.subject).toBe(
      dataRoomEmailSubject('Connecting you to Netholabs SPV Team', 'Ada Lovelace')
    );
    expect(send.mock.calls[0][0].memberName).toBe('Ada Lovelace');
  });
});

describe('sendDataRoomAccessEmailsForLoginTokens', () => {
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

  function loginToken(email: string) {
    const payload = Buffer.from(JSON.stringify({ email, purpose: 'login_token' })).toString('base64url');
    return `header.${payload}.sig`;
  }

  it('sends once per investor and skips a token that was already sent', async () => {
    const send = jest.fn().mockResolvedValue('link');
    const sent = new Set<string>();
    const prisma = {
      spvSpotlight: { findUnique: jest.fn().mockResolvedValue(spotlight) },
      member: {
        findFirst: jest.fn().mockImplementation(async ({ where }) => ({
          uid: where.email.equals,
          name: 'Investor',
          email: where.email.equals,
        })),
      },
      spvAccessRequest: { findUnique: jest.fn().mockResolvedValue(null) },
      spvSpotlightParticipant: {
        findUnique: jest.fn().mockImplementation(async ({ where }) => ({
          uid: where.spvSpotlightUid_memberUid.memberUid,
          type: 'INVESTOR',
          cohort: 'PRE_APPROVED',
          access: 'VIEW',
          dataRoomEmailSentAt: sent.has(where.spvSpotlightUid_memberUid.memberUid) ? new Date() : null,
        })),
        updateMany: jest.fn().mockImplementation(async ({ where }) => {
          if (sent.has(where.uid)) return { count: 0 };
          sent.add(where.uid);
          return { count: 1 };
        }),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    const service = new SpvSpotlightsService(prisma as never, { send } as never);
    const ada = loginToken('Ada@Example.com');
    const repeated = `https://directory.plnetwork.io/spv-spotlight/netholabs?loginToken=${encodeURIComponent(ada)}`;

    const result = await service.sendDataRoomAccessEmailsForLoginTokens('netholabs', [
      ada,
      repeated,
      loginToken('bob@example.com'),
      'not-a-token',
    ]);

    expect(send).toHaveBeenCalledTimes(2);
    expect(result.results).toEqual([
      { email: 'ada@example.com', status: 'sent' },
      { email: 'ada@example.com', status: 'already_sent' },
      { email: 'bob@example.com', status: 'sent' },
      { email: null, status: 'failed', reason: 'Invalid login token' },
    ]);
  });
});
