import { AiAppsConnectService } from './ai-apps-connect.service';

/**
 * Kits ≥1.17 tell an agent whose polling was interrupted to re-poll with the
 * pollToken it already holds, so polling an approved session must keep
 * returning the same deploy token instead of consuming it on the first read.
 */
describe('AiAppsConnectService.poll', () => {
  const approvedSession = {
    uid: 'session-1',
    pollToken: 'poll-token-1',
    status: 'APPROVED',
    expiresAt: new Date(Date.now() - 60_000),
    deployToken: 'plndeploy_abc',
    deployTokenExpiresAt: new Date('2026-10-06T18:00:00.000Z'),
  };

  function buildService(session: Record<string, unknown> | null) {
    const prisma = {
      aiAppConnectSession: {
        findUnique: jest.fn().mockResolvedValue(session),
        update: jest.fn(),
      },
    };
    return { service: new AiAppsConnectService(prisma as any, {} as any), prisma };
  }

  it('returns the same deploy token on every poll of an approved session', async () => {
    const { service, prisma } = buildService(approvedSession);

    const first = await service.poll('poll-token-1');
    const second = await service.poll('poll-token-1');

    const expected = {
      status: 'approved',
      deployToken: 'plndeploy_abc',
      deployTokenExpiresAt: '2026-10-06T18:00:00.000Z',
    };
    expect(first).toEqual(expected);
    expect(second).toEqual(expected);
    expect(prisma.aiAppConnectSession.update).not.toHaveBeenCalled();
  });

  it('answers expired for an unknown poll token', async () => {
    const { service } = buildService(null);

    await expect(service.poll('unknown')).resolves.toEqual({ status: 'expired' });
  });
});
