import { InvestorOutreachService } from './investor-outreach.service';
import { PrismaService } from '../shared/prisma.service';

function minimalItem(overrides: Record<string, unknown> = {}) {
  return {
    investor_id: 'INV-001733',
    canonical_id: '',
    dedupe_key: 'alice@acmevc.com',
    source: 'Manual',
    first_name: 'Alice',
    last_name: 'Brown',
    email: 'alice@acmevc.com',
    email_status: 'verified',
    linkedin_url: '',
    firm: 'Acme',
    firm_domain: 'acmevc.com',
    title: '',
    investor_type: 'fund',
    fund_thesis: '',
    stage_focus: 'seed',
    sector_tags: '',
    geo_focus: '',
    recent_deals: '',
    outreach_touches: 0,
    outreach_campaigns: '',
    opened: 0,
    clicked: 0,
    registered: 0,
    engagement_tier: 'T4_cold',
    enrichment_status: 'pending',
    ...overrides,
  } as import('./dto/ingest-investor-outreach.dto').InvestorOutreachIngestItem;
}

describe('InvestorOutreachService', () => {
  let service: InvestorOutreachService;
  const findUnique = jest.fn();
  const upsert = jest.fn();

  const prismaMock = {
    investorOutreachRecord: {
      findUnique,
      upsert,
    },
  } as unknown as PrismaService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new InvestorOutreachService(prismaMock);
    upsert.mockResolvedValue({});
  });

  it('creates when no existing rows', async () => {
    findUnique.mockImplementation(({ where }: { where: Record<string, unknown> }) => {
      if ('dedupeKey' in where) return Promise.resolve(null);
      if ('investorId' in where) return Promise.resolve(null);
      return Promise.resolve(null);
    });

    const res = await service.ingest({
      items: [minimalItem()],
    });

    expect(res.created).toBe(1);
    expect(res.updated).toBe(0);
    expect(res.failed).toBe(0);
    expect(upsert).toHaveBeenCalledTimes(1);
  });

  it('updates when dedupe exists with same investor id', async () => {
    findUnique.mockImplementation(({ where }: { where: Record<string, unknown> }) => {
      if ('dedupeKey' in where) {
        return Promise.resolve({
          id: 1,
          investorId: 'INV-001733',
          dedupeKey: 'alice@acmevc.com',
        });
      }
      if ('investorId' in where) {
        return Promise.resolve({
          id: 1,
          dedupeKey: 'alice@acmevc.com',
        });
      }
      return Promise.resolve(null);
    });

    const res = await service.ingest({ items: [minimalItem()] });

    expect(res.updated).toBe(1);
    expect(res.created).toBe(0);
  });

  it('fails item when dedupe maps to different investor id', async () => {
    findUnique.mockImplementation(({ where }: { where: Record<string, unknown> }) => {
      if ('dedupeKey' in where) {
        return Promise.resolve({
          id: 1,
          investorId: 'INV-999999',
          dedupeKey: 'alice@acmevc.com',
        });
      }
      return Promise.resolve(null);
    });

    const res = await service.ingest({ items: [minimalItem()] });

    expect(res.failed).toBe(1);
    expect(res.ingested).toBe(0);
    expect(upsert).not.toHaveBeenCalled();
  });

  it('fails when investor_id exists under another dedupe_key', async () => {
    findUnique.mockImplementation(({ where }: { where: Record<string, unknown> }) => {
      if ('dedupeKey' in where) return Promise.resolve(null);
      if ('investorId' in where) {
        return Promise.resolve({ id: 2, dedupeKey: 'other@acmevc.com' });
      }
      return Promise.resolve(null);
    });

    const res = await service.ingest({ items: [minimalItem()] });
    expect(res.failed).toBe(1);
    expect(upsert).not.toHaveBeenCalled();
  });

  it('counts partial batch failures', async () => {
    findUnique.mockImplementation(({ where }: { where: Record<string, unknown> }) => {
      const isDedupe = 'dedupeKey' in where;
      if (!isDedupe) return Promise.resolve(null);
      const key = (where as { dedupeKey: string }).dedupeKey;
      if (key === 'bad@x.com') {
        return Promise.resolve({
          id: 9,
          investorId: 'INV-OTHER',
          dedupeKey: 'bad@x.com',
        });
      }
      return Promise.resolve(null);
    });

    const res = await service.ingest({
      items: [
        minimalItem({ dedupe_key: 'ok@x.com', email: 'ok@x.com', investor_id: 'INV-OK' }),
        minimalItem({ dedupe_key: 'bad@x.com', email: 'bad@x.com', investor_id: 'INV-NO' }),
      ],
    });

    expect(res.created).toBe(1);
    expect(res.failed).toBe(1);
    expect(upsert).toHaveBeenCalledTimes(1);
  });
});
