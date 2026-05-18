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
  const teamFindMany = jest.fn();
  const teamFindUnique = jest.fn();
  const overlapUpsert = jest.fn();
  const overlapDeleteMany = jest.fn();
  const teamMetaUpsert = jest.fn();

  const prismaMock = {
    investorOutreachRecord: {
      findUnique,
      upsert,
    },
    team: {
      findMany: teamFindMany,
      findUnique: teamFindUnique,
    },
    investorPortfolioOverlap: {
      upsert: overlapUpsert,
      deleteMany: overlapDeleteMany,
    },
    plPortfolioTeamMeta: {
      upsert: teamMetaUpsert,
    },
  } as unknown as PrismaService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new InvestorOutreachService(prismaMock);
    upsert.mockResolvedValue({ id: 42 });
    overlapDeleteMany.mockResolvedValue({ count: 0 });
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

  describe('Phase 2 — tags', () => {
    beforeEach(() => {
      findUnique.mockResolvedValue(null);
    });

    it('omits tags from upsert input when the field is absent (protects user-applied tags)', async () => {
      await service.ingest({ items: [minimalItem()] });
      const args = upsert.mock.calls[0][0];
      expect(args.create).not.toHaveProperty('tags');
      expect(args.update).not.toHaveProperty('tags');
    });

    it('includes tags in upsert input when supplied', async () => {
      await service.ingest({ items: [minimalItem({ tags: ['fund-of-interest', 'q3-target'] })] });
      const args = upsert.mock.calls[0][0];
      expect(args.create.tags).toEqual(['fund-of-interest', 'q3-target']);
      expect(args.update.tags).toEqual(['fund-of-interest', 'q3-target']);
    });

    it('explicit empty tags array overwrites the column', async () => {
      await service.ingest({ items: [minimalItem({ tags: [] })] });
      const args = upsert.mock.calls[0][0];
      expect(args.create.tags).toEqual([]);
      expect(args.update.tags).toEqual([]);
    });
  });

  describe('Phase 2 — portfolio_overlaps sync', () => {
    beforeEach(() => {
      findUnique.mockResolvedValue(null);
      overlapUpsert.mockResolvedValue({});
    });

    it('skips overlap touchpoints entirely when portfolio_overlaps is absent', async () => {
      await service.ingest({ items: [minimalItem()] });
      expect(overlapUpsert).not.toHaveBeenCalled();
      expect(overlapDeleteMany).not.toHaveBeenCalled();
    });

    it('upserts each provided overlap and deletes rows outside the provided set', async () => {
      teamFindMany.mockResolvedValue([{ uid: 'team-a' }, { uid: 'team-b' }]);
      overlapDeleteMany.mockResolvedValue({ count: 3 });

      const res = await service.ingest({
        items: [
          minimalItem({
            portfolio_overlaps: [
              { team_uid: 'team-a', deal_amount: 250000, deal_date: '2025-06-01', is_lead_investor: true },
              { team_uid: 'team-b', attribution_fund: 'PLVS' },
            ],
          }),
        ],
      });

      expect(overlapUpsert).toHaveBeenCalledTimes(2);
      expect(overlapDeleteMany).toHaveBeenCalledWith({
        where: { investorOutreachRecordId: 42, teamUid: { notIn: ['team-a', 'team-b'] } },
      });
      expect(res.overlaps_synced).toBe(5); // 2 upserts + 3 deletes
      expect(res.failed).toBe(0);
    });

    it('empty portfolio_overlaps wipes all existing rows for the investor', async () => {
      overlapDeleteMany.mockResolvedValue({ count: 4 });

      const res = await service.ingest({
        items: [minimalItem({ portfolio_overlaps: [] })],
      });

      expect(overlapUpsert).not.toHaveBeenCalled();
      expect(overlapDeleteMany).toHaveBeenCalledWith({ where: { investorOutreachRecordId: 42 } });
      expect(res.overlaps_synced).toBe(4);
    });

    it('records an error for unknown team_uid but continues with the rest', async () => {
      teamFindMany.mockResolvedValue([{ uid: 'team-real' }]);

      const res = await service.ingest({
        items: [
          minimalItem({
            portfolio_overlaps: [
              { team_uid: 'team-real' },
              { team_uid: 'team-missing' },
            ],
          }),
        ],
      });

      expect(overlapUpsert).toHaveBeenCalledTimes(1);
      expect(overlapUpsert.mock.calls[0][0].create.teamUid).toBe('team-real');
      expect(res.errors).toEqual(
        expect.arrayContaining([expect.stringContaining('team-missing')])
      );
      expect(res.failed).toBe(0); // overlap errors don't fail the row
    });

    it('rejects invalid attribution_fund and skips that entry', async () => {
      teamFindMany.mockResolvedValue([{ uid: 'team-a' }]);

      const res = await service.ingest({
        items: [
          minimalItem({
            portfolio_overlaps: [{ team_uid: 'team-a', attribution_fund: 'BadFund' }],
          }),
        ],
      });

      expect(overlapUpsert).not.toHaveBeenCalled();
      expect(res.errors).toEqual(
        expect.arrayContaining([expect.stringContaining('attribution_fund invalid')])
      );
    });
  });

  describe('Phase 2 — top-level portfolio_teams', () => {
    beforeEach(() => {
      findUnique.mockResolvedValue(null);
    });

    it('upserts known portfolio_teams entries', async () => {
      teamFindUnique.mockResolvedValue({ uid: 'team-a' });

      const res = await service.ingest({
        items: [minimalItem()],
        portfolio_teams: [
          {
            team_uid: 'team-a',
            pl_invested_at: '2024-12-01',
            pl_invested_stage: 'seed',
            raising_now: 'series-a',
            sectors: 'ai,crypto',
            geo: 'US',
          },
        ],
      });

      expect(teamMetaUpsert).toHaveBeenCalledTimes(1);
      const args = teamMetaUpsert.mock.calls[0][0];
      expect(args.where).toEqual({ teamUid: 'team-a' });
      expect(args.create.plInvestedStage).toBe('seed');
      expect(args.create.raisingNow).toBe('series-a');
      expect(args.create.sectors).toBe('ai,crypto');
      expect(res.portfolio_teams_upserted).toBe(1);
    });

    it('records an error for unknown team_uid without aborting the batch', async () => {
      teamFindUnique.mockResolvedValue(null);

      const res = await service.ingest({
        items: [minimalItem()],
        portfolio_teams: [{ team_uid: 'team-missing' }],
      });

      expect(teamMetaUpsert).not.toHaveBeenCalled();
      expect(res.portfolio_teams_upserted).toBe(0);
      expect(res.errors).toEqual(expect.arrayContaining([expect.stringContaining('team-missing')]));
    });

    it('rejects invalid pl_invested_stage via vocab check', async () => {
      teamFindUnique.mockResolvedValue({ uid: 'team-a' });

      const res = await service.ingest({
        items: [minimalItem()],
        portfolio_teams: [{ team_uid: 'team-a', pl_invested_stage: 'not-a-stage' }],
      });

      expect(teamMetaUpsert).not.toHaveBeenCalled();
      expect(res.errors).toEqual(
        expect.arrayContaining([expect.stringContaining('pl_invested_stage invalid')])
      );
    });
  });
});
