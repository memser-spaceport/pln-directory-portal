jest.mock('../analytics/service/analytics.service', () => ({
  AnalyticsService: class AnalyticsService {},
}));
jest.mock('../member-cv-imports/member-cv-imports.service', () => ({
  MemberCvImportsService: class MemberCvImportsService {},
}));

import { PrismaService } from '../shared/prisma.service';
import { AtsPushService } from './ats-push.service';

describe('AtsPushService', () => {
  const originalEnv = process.env;
  let fetchMock: jest.Mock;
  let analytics: { trackEvent: jest.Mock };
  let service: AtsPushService;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = {
      ...originalEnv,
      ATS_PUSH_URL: 'https://ats.example/api/directory/candidates',
      ATS_PUSH_KEY: 'push-key',
      ATS_PUSH_TEAM_UID: 'team-pl',
    };
    fetchMock = jest.fn().mockResolvedValue({ ok: true });
    global.fetch = fetchMock as typeof fetch;
    analytics = { trackEvent: jest.fn() };
    service = new AtsPushService({} as PrismaService, {} as never, analytics as never);
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('emits job-interest-pushed-to-ats when a job interest push succeeds', async () => {
    const prisma = {
      jobOpeningInterest: {
        findFirst: jest.fn().mockResolvedValue({
          uid: 'interest-1',
          jobOpening: { uid: 'job-1', roleTitle: 'Engineer', teamUid: 'team-pl' },
          member: {
            uid: 'm-1',
            name: 'Ada',
            email: 'ada@example.com',
            skills: [],
            location: null,
            teamMemberRoles: [],
          },
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
      },
    };
    service = new AtsPushService(prisma as never, { getSignedPreviewUrl: jest.fn() } as never, analytics as never);

    service.pushJobInterest('interest-1');
    await new Promise((resolve) => setImmediate(resolve));

    expect(analytics.trackEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'job-interest-pushed-to-ats',
        distinctId: 'interest:interest-1',
        properties: expect.objectContaining({
          interest_uid: 'interest-1',
          job_uid: 'job-1',
          team_uid: 'team-pl',
          origin: 'job-interest',
        }),
      })
    );
    expect(analytics.trackEvent.mock.calls[0][0].properties).not.toHaveProperty('email');
  });

  it('does not emit when the ATS push fails', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 502 });
    const prisma = {
      teamInterest: {
        findFirst: jest.fn().mockResolvedValue({
          uid: 'team-interest-1',
          teamUid: 'team-pl',
          message: null,
          member: {
            uid: 'm-1',
            name: 'Ada',
            email: 'ada@example.com',
            skills: [],
            location: null,
            teamMemberRoles: [],
          },
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
      },
    };
    service = new AtsPushService(prisma as never, {} as never, analytics as never);

    service.pushTeamInterest('team-interest-1');
    await new Promise((resolve) => setImmediate(resolve));

    expect(analytics.trackEvent).not.toHaveBeenCalled();
  });
});
