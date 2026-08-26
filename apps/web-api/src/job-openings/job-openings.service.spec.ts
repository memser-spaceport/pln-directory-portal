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
