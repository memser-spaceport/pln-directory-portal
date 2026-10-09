import { SpvSpotlightsService } from './spv-spotlights.service';

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
    docSendUrl: 'https://docsend.com/view/x',
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

  const buildService = (participant: { type: string } | null, requestStatus: string | null = null) => {
    const prisma = {
      spvSpotlight: { findUnique: jest.fn().mockResolvedValue(spotlight) },
      member: { findFirst: jest.fn().mockResolvedValue({ uid: 'mem_1' }) },
      spvAccessRequest: {
        findUnique: jest.fn().mockResolvedValue(requestStatus ? { status: requestStatus } : null),
      },
      spvSpotlightParticipant: { findFirst: jest.fn().mockResolvedValue(participant) },
    };
    return { service: new SpvSpotlightsService(prisma as never), prisma };
  };

  it('approves a founder participant and shows the data room', async () => {
    const { service, prisma } = buildService({ type: 'FOUNDER' });

    const result = await service.getBySlug('netholabs', 'founder@example.com');

    expect(result.viewerAccess).toBe('APPROVED');
    expect(result.docSendUrl).toBe('https://docsend.com/view/x');
    expect(prisma.spvSpotlightParticipant.findFirst).toHaveBeenCalledWith({
      where: {
        spvSpotlightUid: 'spv_1',
        memberUid: 'mem_1',
        OR: [
          { type: 'INVESTOR', cohort: 'PRE_APPROVED' },
          { type: 'FOUNDER', access: { not: 'RESTRICTED' } },
        ],
      },
      select: { type: true },
    });
  });

  it('keeps approving a pre-approved investor', async () => {
    const { service } = buildService({ type: 'INVESTOR' });

    const result = await service.getBySlug('netholabs', 'investor@example.com');

    expect(result.viewerAccess).toBe('APPROVED');
  });

  it('keeps a member who is not a participant locked out', async () => {
    const { service } = buildService(null);

    const result = await service.getBySlug('netholabs', 'someone@example.com');

    expect(result.viewerAccess).toBe('NONE');
    expect(result.docSendUrl).toBeNull();
  });
});
