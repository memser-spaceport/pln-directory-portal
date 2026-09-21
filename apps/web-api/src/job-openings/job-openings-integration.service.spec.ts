jest.mock('../analytics/service/analytics.service', () => ({
  AnalyticsService: class AnalyticsService {},
}));

import { ConflictException, ForbiddenException, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import type { EventEmitter2 } from '@nestjs/event-emitter';
import { Prisma } from '@prisma/client';
import type { PrismaService } from '../shared/prisma.service';
import type { IntegrationKeysService } from '../integration-keys/integration-keys.service';
import {
  INTEGRATION_SIGNAL_TYPE,
  INTEGRATION_SOURCE_TYPE,
  JobOpeningsIntegrationService,
  applyState,
} from './job-openings-integration.service';

process.env.WEB_UI_BASE_URL = 'https://os.example';

const key = {
  uid: 'ik-1',
  teamUid: 'team-1',
  scopes: ['jobs:write'] as ('jobs:write' | 'candidates:read')[],
  name: 'PL ATS',
  keyPrefix: 'labos_ik_abcdefg',
};

const row = (overrides: Record<string, unknown> = {}) => ({
  uid: 'job-1',
  status: 'CONFIRMED',
  closedAt: null,
  publishedAt: new Date('2026-01-01T00:00:00.000Z'),
  dedupKey: 'integration:ik-1:role-42',
  roleTitle: 'Platform Lead',
  teamUid: 'team-1',
  managedBy: 'INTEGRATION',
  integrationKeyUid: 'ik-1',
  integrationExternalId: 'role-42',
  sourceLink: null,
  ...overrides,
});

const body = (overrides: Record<string, unknown> = {}) => ({
  title: 'Platform Lead',
  descriptionHtml: '<p>Build the platform</p>',
  state: 'published' as const,
  ...overrides,
});

describe('applyState', () => {
  const NOW = new Date('2026-03-01T00:00:00.000Z');

  it('publishes a new row: CONFIRMED, closedAt null, publishedAt now', () => {
    expect(applyState(null, 'published', NOW)).toEqual({ status: 'CONFIRMED', closedAt: null, publishedAt: NOW });
  });

  it('pauses a new row: STALE, closedAt null, publishedAt null', () => {
    expect(applyState(null, 'paused', NOW)).toEqual({ status: 'STALE', closedAt: null, publishedAt: null });
  });

  it('pauses a published row without touching closedAt or publishedAt', () => {
    expect(applyState({ status: 'CONFIRMED', closedAt: null }, 'paused', NOW)).toEqual({
      status: 'STALE',
      closedAt: null,
    });
  });

  it('re-publishes a paused row with a fresh publishedAt', () => {
    expect(applyState({ status: 'STALE', closedAt: null }, 'published', NOW)).toEqual({
      status: 'CONFIRMED',
      closedAt: null,
      publishedAt: NOW,
    });
  });

  it('closes a published row, setting closedAt once', () => {
    expect(applyState({ status: 'CONFIRMED', closedAt: null }, 'closed', NOW)).toEqual({
      status: 'CLOSED_ROLE_FILLED',
      closedAt: NOW,
    });
    const earlier = new Date('2026-02-01T00:00:00.000Z');
    expect(applyState({ status: 'CLOSED_ROLE_FILLED', closedAt: earlier }, 'closed', NOW).closedAt).toBe(earlier);
  });

  it('re-publishes a closed row: clears closedAt and stamps publishedAt', () => {
    expect(applyState({ status: 'CLOSED_ROLE_FILLED', closedAt: new Date() }, 'published', NOW)).toEqual({
      status: 'CONFIRMED',
      closedAt: null,
      publishedAt: NOW,
    });
  });

  it('does not re-stamp publishedAt when publishing an already visible row', () => {
    expect(applyState({ status: 'NEW', closedAt: null }, 'published', NOW)).toEqual({
      status: 'CONFIRMED',
      closedAt: null,
    });
  });
});

describe('JobOpeningsIntegrationService', () => {
  let prisma: {
    jobOpening: {
      findFirst: jest.Mock;
      findUnique: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      findMany: jest.Mock;
    };
    team: { findUnique: jest.Mock };
  };
  let emit: jest.Mock;
  let assertKeyOwnsTeam: jest.Mock;
  let trackEvent: jest.Mock;
  let service: JobOpeningsIntegrationService;

  beforeEach(() => {
    prisma = {
      jobOpening: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        findMany: jest.fn(),
      },
      team: { findUnique: jest.fn().mockResolvedValue({ name: 'Protocol Labs' }) },
    };
    emit = jest.fn();
    trackEvent = jest.fn();
    assertKeyOwnsTeam = jest.fn((k: { teamUid: string }, teamUid: string | null) => {
      if (!teamUid || teamUid !== k.teamUid) throw new ForbiddenException();
    });
    service = new JobOpeningsIntegrationService(
      prisma as unknown as PrismaService,
      { emit } as unknown as EventEmitter2,
      { assertKeyOwnsTeam } as unknown as IntegrationKeysService,
      { trackEvent } as never
    );
  });

  describe('upsertByExternalId', () => {
    it('creates a row with every required column on first publish', async () => {
      prisma.jobOpening.findFirst.mockResolvedValue(null);
      prisma.jobOpening.create.mockImplementation(async ({ data }) => row({ ...data, uid: 'job-new' }));

      const out = await service.upsertByExternalId(
        key,
        'role-42',
        body({ pay: { min: 180000, max: 220000, currency: 'USD', period: 'year' }, department: 'PL Infra' })
      );

      const { data } = prisma.jobOpening.create.mock.calls[0][0];
      expect(data).toMatchObject({
        managedBy: 'INTEGRATION',
        integrationKeyUid: 'ik-1',
        integrationExternalId: 'role-42',
        teamUid: 'team-1',
        companyName: 'Protocol Labs',
        signalType: INTEGRATION_SIGNAL_TYPE,
        sourceType: INTEGRATION_SOURCE_TYPE,
        sourceLink: null,
        canonicalKey: 'integration:ik-1:role-42',
        dedupKey: 'integration:ik-1:role-42',
        status: 'CONFIRMED',
        closedAt: null,
        roleTitle: 'Platform Lead',
        department: 'PL Infra',
        descriptionHtml: '<p>Build the platform</p>',
        payMin: 180000,
        payMax: 220000,
        payCurrency: 'USD',
        payPeriod: 'year',
        location: [],
      });
      expect(data.publishedAt).toBeInstanceOf(Date);
      expect(data.detectionDate).toBeInstanceOf(Date);
      expect(data.postedDate).toBeInstanceOf(Date);
      expect(out).toMatchObject({
        uid: 'job-new',
        externalId: 'role-42',
        status: 'CONFIRMED',
        boardUrl: 'https://os.example/jobs/openings/job-new',
      });
      expect(out.publishedAt).not.toBeNull();
      expect(trackEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'job-published-via-integration',
          distinctId: 'job:job-new',
          properties: expect.objectContaining({
            job_uid: 'job-new',
            team_uid: 'team-1',
            external_id: 'role-42',
            origin: 'ats',
          }),
        })
      );
    });

    it('updates the owned row in place, nulls omitted optionals, keeps dedupKey and publishedAt', async () => {
      const existing = row({ publishedAt: new Date('2026-01-01T00:00:00.000Z') });
      prisma.jobOpening.findFirst.mockResolvedValue(existing);
      prisma.jobOpening.update.mockImplementation(async ({ data }) => ({ ...existing, ...data }));

      const out = await service.upsertByExternalId(key, 'role-42', body({ title: 'Staff Platform Lead' }));

      const call = prisma.jobOpening.update.mock.calls[0][0];
      expect(call.where).toEqual({ uid: 'job-1' });
      expect(call.data).toMatchObject({
        roleTitle: 'Staff Platform Lead',
        payMin: null,
        payMax: null,
        payCurrency: null,
        payPeriod: null,
        equityNote: null,
        department: null,
        postedDate: null,
        status: 'CONFIRMED',
        closedAt: null,
      });
      expect(call.data).not.toHaveProperty('publishedAt');
      expect(call.data).not.toHaveProperty('dedupKey');
      expect(call.data).not.toHaveProperty('integrationExternalId');
      expect(prisma.jobOpening.create).not.toHaveBeenCalled();
      expect(out.dedupKey).toBe('integration:ik-1:role-42');
      expect(out.publishedAt).toBe('2026-01-01T00:00:00.000Z');
    });

    it('creates a hidden row when the body state is paused', async () => {
      prisma.jobOpening.findFirst.mockResolvedValue(null);
      prisma.jobOpening.create.mockImplementation(async ({ data }) => row({ ...data, uid: 'job-p' }));

      await service.upsertByExternalId(key, 'role-9', body({ state: 'paused' }));

      const { data } = prisma.jobOpening.create.mock.calls[0][0];
      expect(data).toMatchObject({ status: 'STALE', closedAt: null, publishedAt: null });
    });

    it('updates a claimed row found by external id and keeps its crawler dedup key', async () => {
      const claimed = row({ dedupKey: 'https://jobs.polychain.capital/x', integrationExternalId: 'role-7' });
      prisma.jobOpening.findFirst.mockResolvedValue(claimed);
      prisma.jobOpening.update.mockImplementation(async ({ data }) => ({ ...claimed, ...data }));

      const out = await service.upsertByExternalId(key, 'role-7', body());

      expect(prisma.jobOpening.findFirst.mock.calls[0][0].where).toEqual({
        integrationKeyUid: 'ik-1',
        integrationExternalId: 'role-7',
      });
      expect(out.dedupKey).toBe('https://jobs.polychain.capital/x');
    });

    it('rejects a description that is empty after sanitisation with 422 and writes nothing', async () => {
      await expect(
        service.upsertByExternalId(key, 'role-1', body({ descriptionHtml: '<script>alert(1)</script>' }))
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
      expect(prisma.jobOpening.create).not.toHaveBeenCalled();
      expect(prisma.jobOpening.update).not.toHaveBeenCalled();
    });

    it('rejects an over-long external id with 422', async () => {
      await expect(service.upsertByExternalId(key, 'x'.repeat(201), body())).rejects.toBeInstanceOf(
        UnprocessableEntityException
      );
    });

    it('emits the ingest-completed event with a per-request run id and the created count', async () => {
      prisma.jobOpening.findFirst.mockResolvedValue(null);
      prisma.jobOpening.create.mockImplementation(async ({ data }) => row({ ...data, uid: 'job-new' }));

      await service.upsertByExternalId(key, 'role-42', body());

      expect(emit).toHaveBeenCalledTimes(1);
      const [event, payload] = emit.mock.calls[0];
      expect(event).toBe('job-ingest.completed');
      expect(payload).toMatchObject({ source: 'integration', received: 1, created: 1, updated: 0, failed: 0 });
      expect(payload.runId).toMatch(/^integration:ik-1:\d+$/);
    });
  });

  describe('setState', () => {
    it('pauses: STALE, closedAt untouched, publishedAt untouched', async () => {
      prisma.jobOpening.findFirst.mockResolvedValue(row());
      prisma.jobOpening.update.mockImplementation(async ({ data }) => ({ ...row(), ...data }));
      const out = await service.setState(key, 'role-42', 'paused');
      const { data } = prisma.jobOpening.update.mock.calls[0][0];
      expect(data).toMatchObject({ status: 'STALE', closedAt: null });
      expect(data).not.toHaveProperty('publishedAt');
      expect(out.status).toBe('STALE');
      expect(emit).toHaveBeenCalledWith('job-ingest.completed', expect.objectContaining({ created: 0, updated: 1 }));
    });

    it('re-publishes a paused row with a new publishedAt', async () => {
      prisma.jobOpening.findFirst.mockResolvedValue(row({ status: 'STALE' }));
      prisma.jobOpening.update.mockImplementation(async ({ data }) => ({ ...row(), ...data }));
      await service.setState(key, 'role-42', 'published');
      const { data } = prisma.jobOpening.update.mock.calls[0][0];
      expect(data.status).toBe('CONFIRMED');
      expect(data.publishedAt).toBeInstanceOf(Date);
      expect(data.publishedAt.getTime()).toBeGreaterThan(new Date('2026-01-01T00:00:00.000Z').getTime());
      expect(trackEvent).toHaveBeenCalledWith(expect.objectContaining({ name: 'job-published-via-integration' }));
    });

    it('closes: CLOSED_ROLE_FILLED with closedAt set', async () => {
      prisma.jobOpening.findFirst.mockResolvedValue(row());
      prisma.jobOpening.update.mockImplementation(async ({ data }) => ({ ...row(), ...data }));
      await service.setState(key, 'role-42', 'closed');
      const { data } = prisma.jobOpening.update.mock.calls[0][0];
      expect(data.status).toBe('CLOSED_ROLE_FILLED');
      expect(data.closedAt).toBeInstanceOf(Date);
      expect(data).not.toHaveProperty('publishedAt');
      expect(trackEvent).toHaveBeenCalledWith(expect.objectContaining({ name: 'job-closed-via-integration' }));
    });

    it('re-publishes a closed row: closedAt cleared, publishedAt now', async () => {
      prisma.jobOpening.findFirst.mockResolvedValue(row({ status: 'CLOSED_ROLE_FILLED', closedAt: new Date() }));
      prisma.jobOpening.update.mockImplementation(async ({ data }) => ({ ...row(), ...data }));
      await service.setState(key, 'role-42', 'published');
      const { data } = prisma.jobOpening.update.mock.calls[0][0];
      expect(data).toMatchObject({ status: 'CONFIRMED', closedAt: null });
      expect(data.publishedAt).toBeInstanceOf(Date);
    });

    it('returns 404 when the key owns no row with that external id', async () => {
      prisma.jobOpening.findFirst.mockResolvedValue(null);
      await expect(service.setState(key, 'nope', 'paused')).rejects.toBeInstanceOf(NotFoundException);
      expect(emit).not.toHaveBeenCalled();
    });
  });

  describe('claim', () => {
    const crawlerRow = row({
      uid: 'manual-pl-79560093',
      managedBy: null,
      integrationKeyUid: null,
      integrationExternalId: null,
      dedupKey: 'https://jobs.polychain.capital/79560093',
      sourceLink: 'https://jobs.polychain.capital/79560093',
      roleTitle: 'Platform Lead',
    });

    it('adopts a crawler row: ownership fields and sourceLink only, nothing else', async () => {
      prisma.jobOpening.findUnique.mockResolvedValue(crawlerRow);
      prisma.jobOpening.findFirst.mockResolvedValue(null);
      prisma.jobOpening.update.mockImplementation(async ({ data }) => ({ ...crawlerRow, ...data }));

      const out = await service.claim(key, 'manual-pl-79560093', 'role-7');

      const { where, data } = prisma.jobOpening.update.mock.calls[0][0];
      expect(where).toEqual({ uid: 'manual-pl-79560093' });
      expect(data).toEqual({
        managedBy: 'INTEGRATION',
        integrationKeyUid: 'ik-1',
        integrationExternalId: 'role-7',
        sourceLink: null,
      });
      for (const untouched of ['dedupKey', 'canonicalKey', 'status', 'publishedAt', 'closedAt', 'roleTitle']) {
        expect(data).not.toHaveProperty(untouched);
      }
      expect(out).toMatchObject({ uid: 'manual-pl-79560093', externalId: 'role-7', dedupKey: crawlerRow.dedupKey });
      expect(emit).toHaveBeenCalledWith('job-ingest.completed', expect.objectContaining({ created: 0, updated: 1 }));
      expect(trackEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'job-claimed',
          distinctId: 'job:manual-pl-79560093',
        })
      );
    });

    it('is a no-op when the row is already claimed by this key', async () => {
      prisma.jobOpening.findUnique.mockResolvedValue(row());
      const out = await service.claim(key, 'job-1', 'role-42');
      expect(prisma.jobOpening.update).not.toHaveBeenCalled();
      expect(emit).not.toHaveBeenCalled();
      expect(trackEvent).not.toHaveBeenCalled();
      expect(out.uid).toBe('job-1');
    });

    it('returns 409 when another integration owns the row', async () => {
      prisma.jobOpening.findUnique.mockResolvedValue(row({ integrationKeyUid: 'ik-other' }));
      await expect(service.claim(key, 'job-1', 'role-42')).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.jobOpening.update).not.toHaveBeenCalled();
    });

    it('returns 403 when the row belongs to another team', async () => {
      prisma.jobOpening.findUnique.mockResolvedValue(
        crawlerRow.teamUid ? { ...crawlerRow, teamUid: 'team-b' } : crawlerRow
      );
      await expect(service.claim(key, 'manual-pl-79560093', 'role-7')).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.jobOpening.update).not.toHaveBeenCalled();
    });

    it('returns 403 when the row has no team', async () => {
      prisma.jobOpening.findUnique.mockResolvedValue({ ...crawlerRow, teamUid: null });
      await expect(service.claim(key, 'manual-pl-79560093', 'role-7')).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('returns 409 when the external id is already used by another of the key’s rows', async () => {
      prisma.jobOpening.findUnique.mockResolvedValue(crawlerRow);
      prisma.jobOpening.findFirst.mockResolvedValue(row({ uid: 'job-other', integrationExternalId: 'role-7' }));
      await expect(service.claim(key, 'manual-pl-79560093', 'role-7')).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.jobOpening.update).not.toHaveBeenCalled();
    });

    it('returns 404 for an unknown uid', async () => {
      prisma.jobOpening.findUnique.mockResolvedValue(null);
      await expect(service.claim(key, 'nope', 'role-7')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('maps a unique-constraint race on the external id to 409', async () => {
      prisma.jobOpening.findUnique.mockResolvedValue(crawlerRow);
      prisma.jobOpening.findFirst.mockResolvedValue(null);
      prisma.jobOpening.update.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Unique constraint failed', 'P2002', 'test')
      );
      await expect(service.claim(key, 'manual-pl-79560093', 'role-7')).rejects.toBeInstanceOf(ConflictException);
      expect(emit).not.toHaveBeenCalled();
    });
  });

  describe('listForTeam', () => {
    it('returns every team row, exposing externalId only for rows the key owns', async () => {
      prisma.jobOpening.findMany.mockResolvedValue([
        row(),
        row({
          uid: 'job-crawler',
          managedBy: null,
          integrationKeyUid: null,
          integrationExternalId: null,
          dedupKey: 'https://x/1',
        }),
        row({ uid: 'job-other', integrationKeyUid: 'ik-other', integrationExternalId: 'their-1' }),
      ]);

      const out = await service.listForTeam(key);

      expect(prisma.jobOpening.findMany.mock.calls[0][0].where).toEqual({ teamUid: 'team-1' });
      expect(out.map((r) => [r.uid, r.externalId, r.ownedByCaller])).toEqual([
        ['job-1', 'role-42', true],
        ['job-crawler', null, false],
        ['job-other', null, false],
      ]);
      expect(out[0]).toMatchObject({
        managedBy: 'INTEGRATION',
        status: 'CONFIRMED',
        title: 'Platform Lead',
        publishedAt: '2026-01-01T00:00:00.000Z',
        closedAt: null,
        boardUrl: 'https://os.example/jobs/openings/job-1',
      });
    });

    it('carries a crawler row’s public fields so the ATS can import it as a draft role', async () => {
      prisma.jobOpening.findMany.mockResolvedValue([
        row({
          uid: 'manual-pl-79560093',
          managedBy: null,
          integrationKeyUid: null,
          integrationExternalId: null,
          dedupKey: 'https://jobs.polychain.capital/79560093',
          sourceLink: 'https://jobs.polychain.capital/79560093',
          roleTitle: 'Platform Lead',
          department: null,
          roleCategory: 'Engineering',
          seniority: 'Lead (L5)',
          workMode: 'remote',
          location: ['Lisbon', 'Remote (EU)'],
          summary: 'Lead the platform team',
          descriptionHtml: '<p>Full posting</p>',
          postedDate: new Date('2026-08-01T00:00:00.000Z'),
          payMin: null,
          payMax: null,
          payCurrency: null,
          payPeriod: null,
          equityNote: null,
        }),
      ]);

      const [item] = await service.listForTeam(key);

      expect(item).toMatchObject({
        externalId: null,
        ownedByCaller: false,
        managedBy: null,
        title: 'Platform Lead',
        department: null,
        roleCategory: 'Engineering',
        seniority: 'Lead (L5)',
        workMode: 'remote',
        locations: ['Lisbon', 'Remote (EU)'],
        summary: 'Lead the platform team',
        descriptionHtml: '<p>Full posting</p>',
        postedAt: '2026-08-01T00:00:00.000Z',
        applyUrl: 'https://jobs.polychain.capital/79560093',
        pay: null,
        equityNote: null,
      });
    });
  });
});
