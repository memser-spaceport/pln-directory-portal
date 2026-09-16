import { EventEmitter2 } from '@nestjs/event-emitter';
import type { PrismaService } from '../shared/prisma.service';
import { JobOpeningsService } from './job-openings.service';
import type { JobOpeningIngestItem } from './dto/ingest-job-openings.dto';
import { sanitizeJobDescriptionHtml } from './job-description-html.util';

jest.mock('./job-description-html.util', () => ({
  sanitizeJobDescriptionHtml: jest.fn((html: string | null | undefined) =>
    typeof html === 'string' && html.trim() ? html.trim() : null
  ),
}));

const mockedSanitize = sanitizeJobDescriptionHtml as jest.MockedFunction<typeof sanitizeJobDescriptionHtml>;

const baseItem = (overrides: Partial<JobOpeningIngestItem> = {}): JobOpeningIngestItem => ({
  status: 'New',
  companyName: 'Acme',
  signalType: 'Open Role',
  roleTitle: 'Engineer',
  detectionDate: '2026-08-26T00:00:00.000Z',
  canonicalKey: 'acme||engineer||remote',
  dedupKey: 'https://jobs.example/1',
  ...overrides,
});

describe('JobOpeningsService descriptionHtml ingest', () => {
  let prisma: {
    jobOpening: { findUnique: jest.Mock; upsert: jest.Mock };
  };
  let service: JobOpeningsService;

  beforeEach(() => {
    prisma = {
      jobOpening: {
        findUnique: jest.fn(),
        upsert: jest.fn().mockResolvedValue({}),
      },
    };
    mockedSanitize.mockImplementation((html) => (typeof html === 'string' && html.trim() ? html.trim() : null));
    service = new JobOpeningsService(
      prisma as unknown as PrismaService,
      {
        emit: jest.fn(),
      } as unknown as EventEmitter2
    );
  });

  it('stores sanitized HTML on create', async () => {
    prisma.jobOpening.findUnique.mockResolvedValue(null);
    await service.ingestJobOpenings([baseItem({ descriptionHtml: '<p>Build things</p>' })]);
    expect(mockedSanitize).toHaveBeenCalledWith('<p>Build things</p>');
    const { create } = prisma.jobOpening.upsert.mock.calls[0][0];
    expect(create.descriptionHtml).toBe('<p>Build things</p>');
  });

  it('writes descriptionHtml on update when the payload has HTML', async () => {
    prisma.jobOpening.findUnique.mockResolvedValue({
      closedAt: null,
      id: 1,
      createdAt: new Date('2026-01-01'),
    });
    await service.ingestJobOpenings([baseItem({ descriptionHtml: '<p>Updated</p>' })]);
    const { update } = prisma.jobOpening.upsert.mock.calls[0][0];
    expect(update.descriptionHtml).toBe('<p>Updated</p>');
  });

  it('does not overwrite existing descriptionHtml when the payload has none', async () => {
    prisma.jobOpening.findUnique.mockResolvedValue({
      closedAt: null,
      id: 1,
      createdAt: new Date('2026-01-01'),
    });
    await service.ingestJobOpenings([baseItem()]);
    const { update } = prisma.jobOpening.upsert.mock.calls[0][0];
    expect(update).not.toHaveProperty('descriptionHtml');
    const { create } = prisma.jobOpening.upsert.mock.calls[0][0];
    expect(create.descriptionHtml).toBeNull();
  });

  it('does not wipe summary or workMode on HTML-only updates', async () => {
    prisma.jobOpening.findUnique.mockResolvedValue({
      closedAt: null,
      id: 1,
      createdAt: new Date('2026-01-01'),
    });
    await service.ingestJobOpenings([baseItem({ descriptionHtml: '<p>Backfill</p>' })]);
    const { update } = prisma.jobOpening.upsert.mock.calls[0][0];
    expect(update.descriptionHtml).toBe('<p>Backfill</p>');
    expect(update).not.toHaveProperty('summary');
    expect(update).not.toHaveProperty('workMode');
  });

  it('preserves CONFIRMED status when the payload sends the enum value', async () => {
    prisma.jobOpening.findUnique.mockResolvedValue({
      closedAt: null,
      id: 1,
      createdAt: new Date('2026-01-01'),
    });
    await service.ingestJobOpenings([baseItem({ status: 'CONFIRMED', descriptionHtml: '<p>Getro</p>' })]);
    const { update } = prisma.jobOpening.upsert.mock.calls[0][0];
    expect(update.status).toBe('CONFIRMED');
  });

  it('does not change status when the payload sends an unknown value', async () => {
    prisma.jobOpening.findUnique.mockResolvedValue({
      closedAt: null,
      id: 1,
      createdAt: new Date('2026-01-01'),
    });
    await service.ingestJobOpenings([baseItem({ status: 'SOMETHING_ELSE' })]);
    const { update } = prisma.jobOpening.upsert.mock.calls[0][0];
    expect(update).not.toHaveProperty('status');
    const { create } = prisma.jobOpening.upsert.mock.calls[0][0];
    expect(create.status).toBe('NEW');
  });
});

describe('JobOpeningsService ownership and publication', () => {
  let prisma: {
    jobOpening: { findUnique: jest.Mock; upsert: jest.Mock };
  };
  let emit: jest.Mock;
  let service: JobOpeningsService;

  const existingRow = (overrides: Record<string, unknown> = {}) => ({
    status: 'NEW',
    closedAt: null,
    managedBy: null,
    publishedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  });

  beforeEach(() => {
    prisma = {
      jobOpening: {
        findUnique: jest.fn(),
        upsert: jest.fn().mockResolvedValue({}),
      },
    };
    emit = jest.fn();
    service = new JobOpeningsService(prisma as unknown as PrismaService, { emit } as unknown as EventEmitter2);
  });

  describe('ownership guard', () => {
    it('skips a row owned by an integration without touching it', async () => {
      prisma.jobOpening.findUnique.mockResolvedValue(existingRow({ managedBy: 'INTEGRATION', status: 'CONFIRMED' }));
      const result = await service.ingestJobOpenings([baseItem({ status: 'Closed' })]);
      expect(prisma.jobOpening.upsert).not.toHaveBeenCalled();
      expect(result).toMatchObject({ created: 0, updated: 0, skipped: 1, failed: 0 });
      expect(result.skippedReasons).toEqual(['owned-by-integration: https://jobs.example/1']);
    });

    it('skips a manual row with the manual reason', async () => {
      prisma.jobOpening.findUnique.mockResolvedValue(existingRow({ managedBy: 'MANUAL' }));
      const result = await service.ingestJobOpenings([baseItem({ roleTitle: 'Renamed' })]);
      expect(prisma.jobOpening.upsert).not.toHaveBeenCalled();
      expect(result.skipped).toBe(1);
      expect(result.skippedReasons).toEqual(['owned-by-manual: https://jobs.example/1']);
    });

    it('counts a mixed batch as created, updated and skipped', async () => {
      prisma.jobOpening.findUnique
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(existingRow())
        .mockResolvedValueOnce(existingRow({ managedBy: 'INTEGRATION' }));
      const result = await service.ingestJobOpenings([
        baseItem({ dedupKey: 'https://jobs.example/new' }),
        baseItem({ dedupKey: 'https://jobs.example/mine' }),
        baseItem({ dedupKey: 'https://jobs.example/theirs' }),
      ]);
      expect(result).toMatchObject({ received: 3, created: 1, updated: 1, skipped: 1, failed: 0 });
      expect(prisma.jobOpening.upsert).toHaveBeenCalledTimes(2);
    });

    it('rejects an item claiming a foreign ownership value as failed', async () => {
      prisma.jobOpening.findUnique.mockResolvedValue(null);
      const result = await service.ingestJobOpenings([baseItem({ managedBy: 'INTEGRATION' })]);
      expect(prisma.jobOpening.upsert).not.toHaveBeenCalled();
      expect(result).toMatchObject({ created: 0, updated: 0, skipped: 0, failed: 1 });
      expect(result.errors?.[0]).toContain('https://jobs.example/1');
    });

    it('processes an explicit ENRICHMENT value like an item without the field', async () => {
      prisma.jobOpening.findUnique.mockResolvedValue(null);
      const result = await service.ingestJobOpenings([baseItem({ managedBy: 'ENRICHMENT' })]);
      expect(result).toMatchObject({ created: 1, failed: 0, skipped: 0 });
    });

    it('stamps managedBy ENRICHMENT on create and on update of a legacy row', async () => {
      prisma.jobOpening.findUnique.mockResolvedValue(existingRow({ managedBy: null }));
      await service.ingestJobOpenings([baseItem()]);
      const { create, update } = prisma.jobOpening.upsert.mock.calls[0][0];
      expect(create.managedBy).toBe('ENRICHMENT');
      expect(update.managedBy).toBe('ENRICHMENT');
    });

    it('does not rewrite managedBy on an already-stamped enrichment row', async () => {
      prisma.jobOpening.findUnique.mockResolvedValue(existingRow({ managedBy: 'ENRICHMENT' }));
      await service.ingestJobOpenings([baseItem()]);
      const { update } = prisma.jobOpening.upsert.mock.calls[0][0];
      expect(update).not.toHaveProperty('managedBy');
    });

    it('emits the ingest-completed event with zero created and updated for a skipped-only batch', async () => {
      prisma.jobOpening.findUnique.mockResolvedValue(existingRow({ managedBy: 'INTEGRATION' }));
      await service.ingestJobOpenings([baseItem()], { runId: 'run-1' });
      expect(emit).toHaveBeenCalledWith(
        'job-ingest.completed',
        expect.objectContaining({ runId: 'run-1', created: 0, updated: 0, failed: 0 })
      );
    });
  });

  describe('publishedAt stamp', () => {
    it('sets publishedAt on create when the status is visible', async () => {
      prisma.jobOpening.findUnique.mockResolvedValue(null);
      await service.ingestJobOpenings([baseItem({ status: 'New' })]);
      const { create } = prisma.jobOpening.upsert.mock.calls[0][0];
      expect(create.publishedAt).toBeInstanceOf(Date);
    });

    it('leaves publishedAt null on create when the status is hidden', async () => {
      prisma.jobOpening.findUnique.mockResolvedValue(null);
      await service.ingestJobOpenings([baseItem({ status: 'Closed' })]);
      const { create } = prisma.jobOpening.upsert.mock.calls[0][0];
      expect(create.publishedAt).toBeNull();
    });

    it('re-stamps publishedAt when a hidden row becomes visible', async () => {
      prisma.jobOpening.findUnique.mockResolvedValue(existingRow({ status: 'STALE' }));
      await service.ingestJobOpenings([baseItem({ status: 'New' })]);
      const { update } = prisma.jobOpening.upsert.mock.calls[0][0];
      expect(update.publishedAt).toBeInstanceOf(Date);
      expect(update.publishedAt.getTime()).toBeGreaterThan(new Date('2026-01-01T00:00:00.000Z').getTime());
    });

    it('does not touch publishedAt when a visible row is edited', async () => {
      prisma.jobOpening.findUnique.mockResolvedValue(existingRow({ status: 'NEW' }));
      await service.ingestJobOpenings([baseItem({ status: 'New', summary: 'Changed' })]);
      const { update } = prisma.jobOpening.upsert.mock.calls[0][0];
      expect(update).not.toHaveProperty('publishedAt');
    });

    it('does not touch publishedAt when a visible row moves between visible statuses', async () => {
      prisma.jobOpening.findUnique.mockResolvedValue(existingRow({ status: 'NEW' }));
      await service.ingestJobOpenings([baseItem({ status: 'CONFIRMED' })]);
      const { update } = prisma.jobOpening.upsert.mock.calls[0][0];
      expect(update).not.toHaveProperty('publishedAt');
    });

    it('does not clear publishedAt when a visible row is closed', async () => {
      prisma.jobOpening.findUnique.mockResolvedValue(existingRow({ status: 'NEW' }));
      await service.ingestJobOpenings([baseItem({ status: 'Closed' })]);
      const { update } = prisma.jobOpening.upsert.mock.calls[0][0];
      expect(update).not.toHaveProperty('publishedAt');
      expect(update.status).toBe('STALE');
    });

    it('does not treat an unknown incoming status as a transition', async () => {
      prisma.jobOpening.findUnique.mockResolvedValue(existingRow({ status: 'STALE' }));
      await service.ingestJobOpenings([baseItem({ status: 'SOMETHING_ELSE' })]);
      const { update } = prisma.jobOpening.upsert.mock.calls[0][0];
      expect(update).not.toHaveProperty('publishedAt');
    });
  });

  describe('widened update path', () => {
    it('writes title, seniority, category, department, postedDate, teamUid and sourceType when present', async () => {
      prisma.jobOpening.findUnique.mockResolvedValue(existingRow());
      await service.ingestJobOpenings([
        baseItem({
          roleTitle: 'Staff Engineer',
          seniority: 'Lead (L5)',
          roleCategory: 'Engineering',
          department: 'PL Infra',
          postedDate: '2026-09-01T00:00:00.000Z',
          teamUid: 'team-1',
          sourceType: 'Careers Page',
        }),
      ]);
      const { update } = prisma.jobOpening.upsert.mock.calls[0][0];
      expect(update).toMatchObject({
        roleTitle: 'Staff Engineer',
        seniority: 'Lead (L5)',
        roleCategory: 'Engineering',
        department: 'PL Infra',
        postedDate: new Date('2026-09-01T00:00:00.000Z'),
        teamUid: 'team-1',
        sourceType: 'Careers Page',
      });
    });

    it('leaves absent descriptive fields out of the update payload', async () => {
      prisma.jobOpening.findUnique.mockResolvedValue(existingRow());
      await service.ingestJobOpenings([baseItem()]);
      const { update } = prisma.jobOpening.upsert.mock.calls[0][0];
      for (const key of ['roleCategory', 'seniority', 'department', 'postedDate', 'teamUid', 'sourceType']) {
        expect(update).not.toHaveProperty(key);
      }
      expect(update).not.toHaveProperty('companyName');
    });
  });
});
