jest.mock('../analytics/service/analytics.service', () => ({
  AnalyticsService: jest.fn().mockImplementation(() => ({ trackEvent: jest.fn() })),
}));

import type { AnalyticsService } from '../analytics/service/analytics.service';
import type { PrismaService } from '../shared/prisma.service';
import { ROADMAP_ANALYTICS_EVENTS } from './roadmap.constants';
import { RoadmapDraftsService } from './roadmap-drafts.service';

const buildPrismaMock = () => ({
  roadmapSubmissionDraft: {
    findUnique: jest.fn().mockResolvedValue(null),
    upsert: jest.fn(),
    deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
  },
});

const draftRow = {
  uid: 'draft-1',
  memberUid: 'member-1',
  variant: 'idea',
  title: 'My idea',
  description: 'details',
  tags: ['infra'],
  type: 'Feature Request',
  stage: 'IDEA',
  objectiveUid: null,
  newObjectiveTitle: null,
  showCreateObjective: false,
  updatedAt: new Date('2026-06-17T00:00:00.000Z'),
};

describe('RoadmapDraftsService', () => {
  let service: RoadmapDraftsService;
  let prisma: ReturnType<typeof buildPrismaMock>;
  let analytics: { trackEvent: jest.Mock };

  beforeEach(() => {
    prisma = buildPrismaMock();
    analytics = { trackEvent: jest.fn().mockResolvedValue(undefined) };
    service = new RoadmapDraftsService(
      prisma as unknown as PrismaService,
      analytics as unknown as AnalyticsService
    );
  });

  describe('getMyDraft', () => {
    it('returns null when the member has no draft', async () => {
      const result = await service.getMyDraft('member-1');
      expect(result).toEqual({ draft: null });
      expect(prisma.roadmapSubmissionDraft.findUnique).toHaveBeenCalledWith({ where: { memberUid: 'member-1' } });
    });

    it('serializes an existing draft', async () => {
      prisma.roadmapSubmissionDraft.findUnique.mockResolvedValue(draftRow);
      const result = await service.getMyDraft('member-1');
      expect(result.draft).toMatchObject({
        uid: 'draft-1',
        variant: 'idea',
        title: 'My idea',
        tags: ['infra'],
        stage: 'IDEA',
        updatedAt: '2026-06-17T00:00:00.000Z',
      });
    });
  });

  describe('upsertMyDraft', () => {
    it('full-replaces, defaulting omitted fields to empty', async () => {
      prisma.roadmapSubmissionDraft.upsert.mockResolvedValue({ ...draftRow, variant: 'idea' });
      await service.upsertMyDraft({ title: 'Only a title' }, 'member-1');

      const args = prisma.roadmapSubmissionDraft.upsert.mock.calls[0][0];
      expect(args.where).toEqual({ memberUid: 'member-1' });
      expect(args.update).toEqual({
        variant: 'idea',
        title: 'Only a title',
        description: null,
        tags: [],
        type: null,
        stage: null,
        objectiveUid: null,
        newObjectiveTitle: null,
        showCreateObjective: false,
      });
      expect(args.create).toEqual({ memberUid: 'member-1', ...args.update });
    });

    it('tracks a draft-saved analytics event', async () => {
      prisma.roadmapSubmissionDraft.upsert.mockResolvedValue({ ...draftRow, variant: 'roadmap' });
      await service.upsertMyDraft({ variant: 'roadmap' }, 'member-1');
      expect(analytics.trackEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          name: ROADMAP_ANALYTICS_EVENTS.DRAFT_SAVED,
          distinctId: 'member-1',
          properties: { variant: 'roadmap' },
        })
      );
    });
  });

  describe('discardMyDraft', () => {
    it('reports deleted: false and skips analytics when no draft exists', async () => {
      const result = await service.discardMyDraft('member-1');
      expect(result).toEqual({ deleted: false });
      expect(analytics.trackEvent).not.toHaveBeenCalled();
    });

    it('reports deleted: true and tracks when a draft is removed', async () => {
      prisma.roadmapSubmissionDraft.deleteMany.mockResolvedValue({ count: 1 });
      const result = await service.discardMyDraft('member-1');
      expect(result).toEqual({ deleted: true });
      expect(analytics.trackEvent).toHaveBeenCalledWith(
        expect.objectContaining({ name: ROADMAP_ANALYTICS_EVENTS.DRAFT_DISCARDED, distinctId: 'member-1' })
      );
    });
  });
});
