import { NotFoundException } from '@nestjs/common';
import type { PrismaService } from '../shared/prisma.service';
import { AffinityQueryService } from './affinity-query.service';

type PrismaMock = {
  member: { findUnique: jest.Mock };
  affinityPerson: { findFirst: jest.Mock };
};

const buildPrismaMock = (): PrismaMock => ({
  member: { findUnique: jest.fn() },
  affinityPerson: { findFirst: jest.fn() },
});

describe('AffinityQueryService', () => {
  let service: AffinityQueryService;
  let prisma: PrismaMock;

  beforeEach(() => {
    prisma = buildPrismaMock();
    service = new AffinityQueryService(prisma as unknown as PrismaService);
  });

  it('returns person, primary company, and organizations', async () => {
    prisma.member.findUnique.mockResolvedValue({ uid: 'member-1' });
    prisma.affinityPerson.findFirst.mockResolvedValue({
      uid: 'person-1',
      affinityPersonId: '99',
      memberUid: 'member-1',
      firstName: 'Ada',
      lastName: 'Lovelace',
      fullName: 'Ada Lovelace',
      primaryEmail: 'ada@example.com',
      emailAddresses: [],
      currentJobTitle: 'CEO',
      currentOrganizationName: 'Acme',
      currentOrganizationAffinityId: '42',
      relationshipTiers: ['Tier 1'],
      relationshipRoles: [],
      fundRelevance: [],
      listStatus: null,
      standing: null,
      engagementScore: null,
      relationshipScore: null,
      qualityScore: null,
      lastContactAt: null,
      lastEmailAt: null,
      linkMethod: 'EMAIL',
      linkConfidence: 1,
      linkedAt: new Date('2026-01-01'),
      primaryCompanyUid: 'comp-1',
      pulledAt: new Date('2026-01-01'),
      updatedAt: new Date('2026-01-02'),
      listMemberships: [
        { affinityListId: 1, affinityListEntryId: 10, listName: 'Founders', listFields: {}, updatedAt: new Date() },
      ],
      primaryCompany: {
        uid: 'comp-1',
        affinityOrgId: '42',
        name: 'Acme',
        domain: 'acme.io',
        domains: [],
        dealStatus: 'Portfolio',
        tags: [],
        priority: 'P1',
        kpiListStatus: null,
        mrr: null,
        revenueLtm: null,
        monthlyBurn: null,
        cashBalance: null,
        runwayMonths: null,
        teamFte: null,
        postMoneyValuation: null,
        lastContactAt: null,
        lastEmailAt: null,
        relationshipRoles: [],
        fundRelevance: [],
        teamUid: 'team-1',
        linkMethod: 'DOMAIN',
        linkConfidence: 1,
        linkedAt: new Date('2026-01-01'),
        pulledAt: new Date('2026-01-01'),
        updatedAt: new Date('2026-01-02'),
        listMemberships: [],
        team: { uid: 'team-1', name: 'Acme', website: 'https://acme.io' },
      },
      organizations: [
        {
          affinityOrgId: '42',
          isCurrent: true,
          jobTitle: 'CEO',
          company: {
            uid: 'comp-1',
            affinityOrgId: '42',
            name: 'Acme',
            domain: 'acme.io',
            domains: [],
            dealStatus: 'Portfolio',
            tags: [],
            priority: 'P1',
            kpiListStatus: null,
            mrr: null,
            revenueLtm: null,
            monthlyBurn: null,
            cashBalance: null,
            runwayMonths: null,
            teamFte: null,
            postMoneyValuation: null,
            lastContactAt: null,
            lastEmailAt: null,
            relationshipRoles: [],
            fundRelevance: [],
            teamUid: 'team-1',
            linkMethod: 'DOMAIN',
            linkConfidence: 1,
            linkedAt: new Date('2026-01-01'),
            pulledAt: new Date('2026-01-01'),
            updatedAt: new Date('2026-01-02'),
            listMemberships: [],
            team: { uid: 'team-1', name: 'Acme', website: 'https://acme.io' },
          },
        },
      ],
    });

    const out = await service.getByMemberUid('member-1');

    expect(out.member_uid).toBe('member-1');
    expect(out.person.affinity_person_id).toBe('99');
    expect(out.primary_company?.name).toBe('Acme');
    expect(out.primary_company?.linked_team?.uid).toBe('team-1');
    expect(out.organizations).toHaveLength(1);
  });

  it('throws when member missing', async () => {
    prisma.member.findUnique.mockResolvedValue(null);
    await expect(service.getByMemberUid('missing')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('throws when no affinity person linked', async () => {
    prisma.member.findUnique.mockResolvedValue({ uid: 'member-1' });
    prisma.affinityPerson.findFirst.mockResolvedValue(null);
    await expect(service.getByMemberUid('member-1')).rejects.toBeInstanceOf(NotFoundException);
  });
});
