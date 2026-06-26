import type { PrismaService } from '../shared/prisma.service';
import { AffinityService } from './affinity.service';

type PrismaMock = {
  affinityIngestRun: {
    upsert: jest.Mock;
    update: jest.Mock;
  };
  team: { findMany: jest.Mock };
  member: { findMany: jest.Mock };
  affinityCompany: { findMany: jest.Mock; upsert: jest.Mock };
  affinityPerson: { findMany: jest.Mock; upsert: jest.Mock };
  affinityListMembership: { deleteMany: jest.Mock; upsert: jest.Mock };
  affinityPersonOrganization: { upsert: jest.Mock };
};

const buildPrismaMock = (): PrismaMock => ({
  affinityIngestRun: { upsert: jest.fn(), update: jest.fn() },
  team: { findMany: jest.fn() },
  member: { findMany: jest.fn() },
  affinityCompany: { findMany: jest.fn(), upsert: jest.fn() },
  affinityPerson: { findMany: jest.fn(), upsert: jest.fn() },
  affinityListMembership: { deleteMany: jest.fn(), upsert: jest.fn() },
  affinityPersonOrganization: { upsert: jest.fn() },
});

describe('AffinityService', () => {
  let service: AffinityService;
  let prisma: PrismaMock;

  beforeEach(() => {
    prisma = buildPrismaMock();
    prisma.affinityIngestRun.upsert.mockResolvedValue({
      id: 'run-1',
      stats: null,
    });
    prisma.affinityIngestRun.update.mockResolvedValue({});
    prisma.team.findMany.mockResolvedValue([{ uid: 'team-1', airtableRecId: 'recTEAM', website: 'https://acme.io' }]);
    prisma.member.findMany.mockResolvedValue([
      {
        uid: 'member-1',
        name: 'Founder',
        email: 'founder@acme.io',
        airtableRecId: 'recMEM',
      },
      {
        uid: 'owner-1',
        name: 'Brad Holden',
        email: 'brad@protocol.vc',
        airtableRecId: null,
      },
    ]);
    prisma.affinityCompany.findMany.mockResolvedValue([]);
    prisma.affinityPerson.findMany.mockResolvedValue([]);
    prisma.affinityCompany.upsert.mockResolvedValue({ uid: 'comp-uid-1' });
    prisma.affinityPerson.upsert.mockResolvedValue({ uid: 'person-uid-1' });
    prisma.affinityListMembership.deleteMany.mockResolvedValue({ count: 0 });
    prisma.affinityListMembership.upsert.mockResolvedValue({});
    prisma.affinityPersonOrganization.upsert.mockResolvedValue({});

    service = new AffinityService(prisma as unknown as PrismaService);
  });

  it('upserts company linked to team and person linked to member', async () => {
    const result = await service.ingest({
      runId: 'run-1',
      scope: 'full',
      companies: [
        {
          affinity_org_id: '100',
          name: 'Acme',
          domain: 'acme.io',
          builders_funnel_record_id: 'recTEAM',
          raw_fields: {},
          list_memberships: [],
        },
      ],
      persons: [
        {
          affinity_person_id: '200',
          primary_email: 'founder@acme.io',
          current_organization_affinity_id: '100',
          raw_fields: {},
          list_memberships: [],
          organizations: [{ affinity_org_id: '100', is_current: true }],
        },
      ],
    });

    expect(result.ingested).toEqual({ companies: 1, persons: 1 });
    expect(result.linked.companiesToTeam).toBe(1);
    expect(result.linked.personsToMember).toBe(1);
    expect(result.linked.personsToCompany).toBe(1);
    expect(prisma.affinityCompany.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { affinityOrgId: '100' },
        create: expect.objectContaining({ teamUid: 'team-1' }),
      })
    );
    expect(prisma.affinityPerson.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { affinityPersonId: '200' },
        create: expect.objectContaining({ memberUid: 'member-1', primaryCompanyUid: 'comp-uid-1' }),
      })
    );
  });

  it('dry run computes links without sidecar upserts', async () => {
    const result = await service.ingest({
      runId: 'run-dry',
      scope: 'full',
      dryRun: true,
      companies: [
        {
          affinity_org_id: '100',
          name: 'Acme',
          domain: 'acme.io',
          raw_fields: {},
          list_memberships: [],
        },
      ],
      persons: [
        {
          affinity_person_id: '200',
          primary_email: 'founder@acme.io',
          raw_fields: {},
          list_memberships: [],
          organizations: [],
        },
      ],
    });

    expect(result.linked.companiesToTeam).toBe(1);
    expect(result.linked.personsToMember).toBe(1);
    expect(prisma.affinityCompany.upsert).not.toHaveBeenCalled();
    expect(prisma.affinityPerson.upsert).not.toHaveBeenCalled();
  });

  it('persists relationship card fields and resolves owner member uid', async () => {
    await service.ingest({
      runId: 'run-rel',
      scope: 'founders',
      persons: [
        {
          affinity_person_id: '200',
          primary_email: 'founder@acme.io',
          raw_fields: {},
          list_memberships: [],
          organizations: [],
          relationship_owner: {
            name: 'Brad Holden',
            email: 'brad@protocol.vc',
            affinity_person_id: '118269819',
          },
          last_contact_summary: 'Intro call',
          last_contact_method: 'meeting',
          touchpoints_6m: 16,
          touchpoints_by_month: [{ label: 'Jun', count: 4 }],
          frequency_tier: 'high',
          interaction_window_months: 6,
        },
      ],
    });

    expect(prisma.affinityPerson.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          relationshipOwnerName: 'Brad Holden',
          relationshipOwnerMemberUid: 'owner-1',
          lastContactSummary: 'Intro call',
          touchpoints6m: 16,
          frequencyTier: 'HIGH',
        }),
      })
    );
  });

  it('falls back to company Owners when person owner is missing', async () => {
    await service.ingest({
      runId: 'run-company-owner',
      scope: 'full',
      companies: [
        {
          affinity_org_id: '100',
          name: 'Acme',
          domain: 'acme.io',
          raw_fields: {},
          list_memberships: [
            {
              affinity_list_id: 176789,
              affinity_list_entry_id: 1,
              list_name: 'Portfolio Companies',
              list_fields: {
                'field-3378414': {
                  name: 'Owners',
                  data: [
                    {
                      id: 118239754,
                      type: 'internal',
                      firstName: 'Lacey',
                      lastName: 'Wisdom',
                      primaryEmailAddress: 'lacey.wisdom@protocol.ai',
                    },
                  ],
                },
              },
            },
          ],
        },
      ],
      persons: [
        {
          affinity_person_id: '200',
          primary_email: 'founder@acme.io',
          current_organization_affinity_id: '100',
          raw_fields: {},
          list_memberships: [],
          organizations: [{ affinity_org_id: '100', is_current: true }],
        },
      ],
    });

    expect(prisma.affinityPerson.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          relationshipOwnerName: 'Lacey Wisdom',
        }),
      })
    );
  });

  it('returns chunk-local stats but persists merged stats on the ingest run', async () => {
    prisma.affinityIngestRun.upsert.mockResolvedValueOnce({
      id: 'run-chunk',
      stats: null,
    });
    prisma.affinityIngestRun.upsert.mockResolvedValueOnce({
      id: 'run-chunk',
      stats: {
        runId: 'run-chunk',
        received: { companies: 1, persons: 0 },
        ingested: { companies: 1, persons: 0 },
        linked: { companiesToTeam: 1, personsToMember: 0, personsToCompany: 0 },
        unmatched: { companies: 0, persons: 0 },
        failed: 0,
      },
    });

    const first = await service.ingest({
      runId: 'run-chunk',
      scope: 'companies',
      companies: [
        {
          affinity_org_id: '100',
          name: 'Acme',
          domain: 'acme.io',
          raw_fields: {},
          list_memberships: [],
        },
      ],
    });

    const second = await service.ingest({
      runId: 'run-chunk',
      scope: 'founders',
      persons: [
        {
          affinity_person_id: '200',
          primary_email: 'founder@acme.io',
          raw_fields: {},
          list_memberships: [],
          organizations: [],
        },
      ],
    });

    expect(first.received).toEqual({ companies: 1, persons: 0 });
    expect(second.received).toEqual({ companies: 0, persons: 1 });
    expect(prisma.affinityIngestRun.update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          stats: expect.objectContaining({
            received: { companies: 1, persons: 1 },
            ingested: { companies: 1, persons: 1 },
          }),
        }),
      })
    );
  });
});
