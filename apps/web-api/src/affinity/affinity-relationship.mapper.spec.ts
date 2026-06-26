import {
  computeFrequencyTierFromSignals,
  extractLastContactFromRawFields,
  extractOwnerFromCompanyListMemberships,
  extractOwnerFromLastContactInternal,
  normalizeOwnerName,
  resolveOwnerMemberUid,
  resolveRelationshipOwner,
  toMemberRelationshipDto,
} from './affinity-relationship.mapper';

describe('affinity-relationship.mapper', () => {
  it('extracts owner from portfolio founders Owners field', () => {
    const owner = resolveRelationshipOwner({
      personListMemberships: [
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
      ],
    });
    expect(owner?.name).toBe('Brad Holden');
  });

  it('extracts strategic founders Owners from field-4904646', () => {
    const owner = resolveRelationshipOwner({
      personListMemberships: [
        {
          listFields: {
            'field-4904646': {
              name: 'Owners',
              data: [
                {
                  id: 1,
                  type: 'internal',
                  firstName: 'Lacey',
                  lastName: 'Wisdom',
                },
              ],
            },
          },
        },
      ],
    });
    expect(owner?.name).toBe('Lacey Wisdom');
  });

  it('extracts owner from company list memberships', () => {
    const owner = extractOwnerFromCompanyListMemberships([
      {
        listFields: {
          'field-3378414': {
            name: 'Owners',
            data: [{ id: 1, type: 'internal', firstName: 'Niki', lastName: 'Gokani' }],
          },
        },
      },
    ]);
    expect(owner?.name).toBe('Niki Gokani');
  });

  it('extracts owner from last-contact internal sender', () => {
    const owner = extractOwnerFromLastContactInternal({
      'last-contact': {
        data: {
          type: 'email',
          from: {
            person: {
              id: 1,
              type: 'internal',
              firstName: 'Brad',
              lastName: 'Holden',
            },
          },
        },
      },
    });
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

  it('resolves owner member_uid by unique name at read time', () => {
    const dto = toMemberRelationshipDto(
      {
        relationshipOwnerName: 'Brad Holden',
        relationshipOwnerEmail: 'brad@protocol.vc',
        relationshipOwnerMemberUid: null,
        lastContactAt: new Date('2026-06-22T00:00:00Z'),
        touchpoints6m: 10,
        frequencyTier: 'HIGH',
        interactionWindowMonths: 6,
        rawFields: {},
      } as never,
      [
        { uid: 'owner-1', name: 'Brad Holden', email: 'other@example.com' },
        { uid: 'other', name: 'Someone Else', email: null },
      ]
    );
    expect(dto.owner?.member_uid).toBe('owner-1');
  });

  it('does not resolve owner member_uid when name is ambiguous', () => {
    const uid = resolveOwnerMemberUid({ name: 'Alex Smith' }, [
      { uid: 'a', name: 'Alex Smith', email: null },
      { uid: 'b', name: 'Alex Smith', email: null },
    ]);
    expect(uid).toBeNull();
  });

  it('resolves owner from company list at read fallback', () => {
    const dto = toMemberRelationshipDto({
      relationshipOwnerName: null,
      relationshipOwnerMemberUid: null,
      lastContactAt: new Date('2026-06-22T00:00:00Z'),
      touchpoints6m: 2,
      frequencyTier: 'NEGLECTED',
      interactionWindowMonths: 6,
      keyContact: null,
      rawFields: {},
      listMemberships: [],
      primaryCompany: {
        listMemberships: [
          {
            listFields: {
              'field-3378414': {
                name: 'Owners',
                data: [
                  {
                    id: 1,
                    type: 'internal',
                    firstName: 'Lacey',
                    lastName: 'Wisdom',
                  },
                ],
              },
            },
          },
        ],
      },
    } as never);
    expect(dto.owner?.name).toBe('Lacey Wisdom');
  });

  it('computes neglected tier from sparse old contact', () => {
    expect(
      computeFrequencyTierFromSignals({
        touchpoints6m: 2,
        lastContactAt: '2026-02-18T00:00:00Z',
        reference: new Date('2026-06-24T00:00:00Z'),
      })
    ).toBe('neglected');
  });

  it('normalizes owner names for matching', () => {
    expect(normalizeOwnerName('  Brad   Holden ')).toBe('brad holden');
  });
});
