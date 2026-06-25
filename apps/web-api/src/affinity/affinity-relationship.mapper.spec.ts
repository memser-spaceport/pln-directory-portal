import {
  computeFrequencyTierFromSignals,
  extractLastContactFromRawFields,
  extractOwnerFromListMemberships,
  toMemberRelationshipDto,
} from './affinity-relationship.mapper';

describe('affinity-relationship.mapper', () => {
  it('extracts owner from list membership Owners field', () => {
    const owner = extractOwnerFromListMemberships([
      {
        listFields: {
          'field-3040811': {
            name: 'Owners',
            data: [
              {
                id: 1,
                type: 'internal',
                firstName: 'Brad',
                lastName: 'Holden',
                primaryEmailAddress: 'brad@protocol.vc',
              },
            ],
          },
        },
      },
    ]);
    expect(owner?.name).toBe('Brad Holden');
  });

  it('extracts meeting title from raw fields', () => {
    const contact = extractLastContactFromRawFields({
      'last-contact': {
        data: { type: 'meeting', startTime: '2026-06-22T00:00:00Z', title: 'Intro call' },
      },
    });
    expect(contact?.summary).toBe('Intro call');
  });

  it('builds relationship dto from normalized columns', () => {
    const dto = toMemberRelationshipDto({
      relationshipOwnerName: 'Brad Holden',
      relationshipOwnerEmail: 'brad@protocol.vc',
      relationshipOwnerAffinityPersonId: '1',
      relationshipOwnerMemberUid: 'owner-1',
      lastContactAt: new Date('2026-06-22T00:00:00Z'),
      lastContactSummary: 'Intro call',
      lastContactMethod: 'meeting',
      touchpoints6m: 16,
      touchpointsByMonth: [{ label: 'Jun', count: 4 }],
      frequencyTier: 'HIGH',
      interactionWindowMonths: 6,
      keyContact: null,
      rawFields: {},
    } as never);

    expect(dto.empty).toBe(false);
    expect(dto.frequency_tier).toBe('high');
    expect(dto.touchpoints_6m).toBe(16);
  });

  it('computes neglected tier from sparse old contact', () => {
    expect(
      computeFrequencyTierFromSignals({
        touchpoints6m: 2,
        lastContactAt: '2026-02-18T00:00:00Z',
        reference: new Date('2026-06-24T00:00:00Z'),
      }),
    ).toBe('neglected');
  });
});
