import { FounderReviewStatus } from '@prisma/client';
import { FounderSourcingService } from './founder-sourcing.service';
import { PrismaService } from '../shared/prisma.service';
import { FounderIngestItem } from './dto/ingest-founder-sourcing.dto';

function minimalItem(overrides: Partial<FounderIngestItem> = {}): FounderIngestItem {
  return {
    founder_id: 'profile-001',
    dedupe_key: 'email:alice@example.com',
    source: 'github-events',
    sources: ['github-events'],
    name: 'Alice Example',
    ...overrides,
  };
}

describe('FounderSourcingService', () => {
  let service: FounderSourcingService;
  const findUnique = jest.fn();
  const upsert = jest.fn();
  const ingestRunUpsert = jest.fn();

  const methodologyUpsert = jest.fn();

  const prismaMock = {
    founderSourcingRecord: {
      findUnique,
      upsert,
    },
    founderSourcingIngestRun: {
      upsert: ingestRunUpsert,
    },
    founderSourcingMethodology: {
      upsert: methodologyUpsert,
    },
  } as unknown as PrismaService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new FounderSourcingService(prismaMock);
    upsert.mockResolvedValue({ id: 1 });
    ingestRunUpsert.mockResolvedValue({});
    methodologyUpsert.mockResolvedValue({});
  });

  it('creates when no existing rows', async () => {
    findUnique.mockResolvedValue(null);

    const res = await service.ingest({ items: [minimalItem()] });

    expect(res.created).toBe(1);
    expect(res.updated).toBe(0);
    expect(res.failed).toBe(0);
    expect(upsert).toHaveBeenCalledTimes(1);
  });

  it('updates when dedupe exists with same founder id', async () => {
    findUnique.mockImplementation(({ where }: { where: Record<string, unknown> }) => {
      if ('dedupeKey' in where) {
        return Promise.resolve({ founderId: 'profile-001', dedupeKey: 'email:alice@example.com' });
      }
      if ('founderId' in where) {
        return Promise.resolve({ dedupeKey: 'email:alice@example.com' });
      }
      return Promise.resolve(null);
    });

    const res = await service.ingest({ items: [minimalItem()] });

    expect(res.updated).toBe(1);
    expect(res.created).toBe(0);
  });

  it('fails item when dedupe maps to different founder id', async () => {
    findUnique.mockImplementation(({ where }: { where: Record<string, unknown> }) => {
      if ('dedupeKey' in where) {
        return Promise.resolve({ founderId: 'profile-other', dedupeKey: 'email:alice@example.com' });
      }
      return Promise.resolve(null);
    });

    const res = await service.ingest({ items: [minimalItem()] });

    expect(res.failed).toBe(1);
    expect(res.ingested).toBe(0);
    expect(upsert).not.toHaveBeenCalled();
  });

  it('does not overwrite review fields on update payload', () => {
    const item = minimalItem();
    const input = service.buildRecordInput(item, 'run-1', 'signal-sourcing');
    const update = service['stripKeysForUpdate'](input, item);

    expect(update.reviewStatus).toBeUndefined();
    expect(update.reviewFeedback).toBeUndefined();
    expect(update.reviewChannel).toBeUndefined();
    expect(update.reviewField).toBeUndefined();
    expect(update.reviewArea).toBeUndefined();
    expect(update.reviewDecidedAt).toBeUndefined();
    expect(update.reviewNote).toBeUndefined();
    expect(update.reviewedByMemberUid).toBeUndefined();
  });

  it('maps contract fields and sticky booleans on create', () => {
    const input = service.buildRecordInput(
      minimalItem({
        focus_area: 'FA3 Embodied AI',
        criteria_headline: 'PLVS · embodied robotics',
        pedigree: 'DeepMind',
        is_raising: true,
        near_network: true,
      }),
    );

    expect(input.focusArea).toBe('FA3 Embodied AI');
    expect(input.criteriaHeadline).toBe('PLVS · embodied robotics');
    expect(input.pedigree).toBe('DeepMind');
    expect(input.isRaising).toBe(true);
    expect(input.nearNetwork).toBe(true);
    expect(input.isCofounderSearch).toBeUndefined();
  });

  it('omits sticky booleans on update when not present in payload', () => {
    const item = minimalItem();
    const input = service.buildRecordInput({ ...item, is_raising: true }, 'run-1', 'signal-sourcing');
    const updateWithoutFlag = service['stripKeysForUpdate'](input, minimalItem());
    expect(updateWithoutFlag.isRaising).toBeUndefined();

    const updateWithFlag = service['stripKeysForUpdate'](input, minimalItem({ is_raising: true }));
    expect(updateWithFlag.isRaising).toBe(true);
  });

  it('upserts methodology when version and payload are provided', async () => {
    findUnique.mockResolvedValue(null);

    await service.ingest({
      methodology_version: 'abc123',
      methodology: { summary: 'test' },
      items: [minimalItem()],
    });

    expect(methodologyUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { version: 'abc123' },
        create: expect.objectContaining({ version: 'abc123' }),
      }),
    );
  });

  it('omits optional scalar fields when absent on payload', () => {
    const input = service.buildRecordInput(minimalItem({ plvs_score: undefined, alignment_max: undefined }));

    expect(input.plvsScore).toBeUndefined();
    expect(input.alignmentMax).toBeUndefined();
  });

  it('exports review state for non-new rows with decided_at', async () => {
    const findMany = jest.fn().mockResolvedValue([
      {
        founderId: 'profile-001',
        reviewStatus: FounderReviewStatus.APPROVED,
        reviewFeedback: null,
        reviewDecidedAt: new Date('2026-06-01T12:00:00.000Z'),
        reviewNote: null,
      },
    ]);
    (prismaMock as any).founderSourcingRecord.findMany = findMany;

    const items = await service.exportReviewState();

    expect(items).toHaveLength(1);
    expect(items[0].profile_id).toBe('profile-001');
    expect(items[0].status).toBe('approved');
  });
});
