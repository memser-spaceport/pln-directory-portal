import type { InvestorOutreachRecord } from '@prisma/client';
import { toInvestorDto } from './investor-outreach.mapper';

describe('toInvestorDto additionalEmails', () => {
  const baseRecord = {
    investorId: '133218792',
    canonicalId: '133218792',
    dedupeKey: 'yoni9091@gmail.com',
    source: 'PATHFINDER_NEURO',
    firstName: 'Yonatan',
    lastName: 'Shimon',
    email: 'yoni9091@gmail.com',
    additionalEmails: ['benshimonmia@gmail.com'],
    emailStatus: 'unverified',
    linkedinUrl: null,
    firm: 'Example VC',
    firmDomain: null,
    title: null,
    proximityCode: null,
    investorType: 'fund',
    fundThesis: null,
    aumRange: null,
    checkSizeRange: null,
    stageFocus: 'seed',
    sectorTags: null,
    geoFocus: null,
    recentDeals: null,
    outreachTouches: 0,
    outreachCampaigns: null,
    opened: 0,
    clicked: 0,
    registered: 0,
    firstSentDate: null,
    lastSentDate: null,
    engagementTier: '',
    enrichmentStatus: 'pending',
    enrichmentDate: null,
    lastEnrichmentAttempt: null,
    enrichmentNotes: null,
    rawPayload: null,
    tags: [],
    bestProximityCode: null,
    hasPath: false,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    id: 1,
  } as InvestorOutreachRecord;

  it('includes additionalEmails when non-empty', () => {
    const dto = toInvestorDto(baseRecord, new Map(), new Map());
    expect(dto.additionalEmails).toEqual(['benshimonmia@gmail.com']);
  });

  it('omits additionalEmails when empty', () => {
    const dto = toInvestorDto({ ...baseRecord, additionalEmails: [] }, new Map(), new Map());
    expect(dto.additionalEmails).toBeUndefined();
  });
});
