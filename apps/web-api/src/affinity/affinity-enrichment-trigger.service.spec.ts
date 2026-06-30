import { HttpException, HttpStatus, NotFoundException } from '@nestjs/common';
import type { PrismaService } from '../shared/prisma.service';
import type { DataEnrichmentClientService } from '../data-enrichment-client/data-enrichment-client.service';
import { AffinityEnrichmentTriggerService } from './affinity-enrichment-trigger.service';

type PrismaMock = {
  member: { findUnique: jest.Mock };
  affinityPerson: { findFirst: jest.Mock };
};

const buildPrismaMock = (): PrismaMock => ({
  member: { findUnique: jest.fn() },
  affinityPerson: { findFirst: jest.fn() },
});

describe('AffinityEnrichmentTriggerService', () => {
  let service: AffinityEnrichmentTriggerService;
  let prisma: PrismaMock;
  let dataEnrichmentClient: { triggerAffinityMemberEnrichment: jest.Mock };

  beforeEach(() => {
    prisma = buildPrismaMock();
    dataEnrichmentClient = { triggerAffinityMemberEnrichment: jest.fn() };
    service = new AffinityEnrichmentTriggerService(
      prisma as unknown as PrismaService,
      dataEnrichmentClient as unknown as DataEnrichmentClientService,
    );
  });

  it('triggers enrichment for a linked member', async () => {
    prisma.member.findUnique.mockResolvedValue({ uid: 'member-1' });
    prisma.affinityPerson.findFirst.mockResolvedValue({ affinityPersonId: '12345' });
    dataEnrichmentClient.triggerAffinityMemberEnrichment.mockResolvedValue({
      runId: 'run-1',
      ingest: {
        ingested: { companies: 0, persons: 1 },
        linked: { companiesToTeam: 0, personsToMember: 1, personsToCompany: 0 },
        failed: 0,
      },
    });

    const result = await service.retriggerForMember('member-1');

    expect(dataEnrichmentClient.triggerAffinityMemberEnrichment).toHaveBeenCalledWith('12345');
    expect(result).toEqual({
      success: true,
      member_uid: 'member-1',
      affinity_person_id: '12345',
      run_id: 'run-1',
      ingest: {
        ingested: { companies: 0, persons: 1 },
        linked: { companiesToTeam: 0, personsToMember: 1, personsToCompany: 0 },
        failed: 0,
      },
    });
  });

  it('throws when member is missing', async () => {
    prisma.member.findUnique.mockResolvedValue(null);

    await expect(service.retriggerForMember('missing')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('throws when affinity profile is not linked', async () => {
    prisma.member.findUnique.mockResolvedValue({ uid: 'member-1' });
    prisma.affinityPerson.findFirst.mockResolvedValue(null);

    await expect(service.retriggerForMember('member-1')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('enforces cooldown per member', async () => {
    prisma.member.findUnique.mockResolvedValue({ uid: 'member-1' });
    prisma.affinityPerson.findFirst.mockResolvedValue({ affinityPersonId: '12345' });
    dataEnrichmentClient.triggerAffinityMemberEnrichment.mockResolvedValue({
      runId: 'run-1',
      ingest: {
        ingested: { companies: 0, persons: 1 },
        linked: { companiesToTeam: 0, personsToMember: 0, personsToCompany: 0 },
        failed: 0,
      },
    });

    await service.retriggerForMember('member-1');
    await expect(service.retriggerForMember('member-1')).rejects.toMatchObject({
      status: HttpStatus.TOO_MANY_REQUESTS,
    });
    expect(dataEnrichmentClient.triggerAffinityMemberEnrichment).toHaveBeenCalledTimes(1);
  });
});
