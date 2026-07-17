import {
  ConnectorTier,
  mergePlTeamRelationship,
  type PlTeamMember,
  type PlTeamRelationship,
} from './pl-team-relationship.util';

const REF = '2026-06-17T00:00:00Z';

const LEADS: PlTeamMember[] = [
  { name: 'Brad Holden', internalId: 2 },
  { name: 'Christina DesVaux', internalId: 228136266 },
];

describe('mergePlTeamRelationship', () => {
  it('keeps v1 when strength >= 0.3', () => {
    const strongV1: PlTeamRelationship = {
      externalId: 99,
      connectors: [
        {
          name: 'Brad Holden',
          internalId: 2,
          strength: 0.45,
          recencyDays: 5,
          evidenceKind: 'last_email',
          evidenceDate: '2026-06-12T00:00:00Z',
          eventOnly: false,
          tier: ConnectorTier.Strength,
          attributionSource: 'affinity-v1',
        },
      ],
      bestConnector: {
        name: 'Brad Holden',
        internalId: 2,
        strength: 0.45,
        recencyDays: 5,
        evidenceKind: 'last_email',
        evidenceDate: '2026-06-12T00:00:00Z',
        eventOnly: false,
        tier: ConnectorTier.Strength,
        attributionSource: 'affinity-v1',
      },
      summary: null,
    };
    const out = mergePlTeamRelationship(strongV1, { keyContactName: 'Christina DesVaux' }, LEADS, REF);
    expect(out.bestConnector?.name).toBe('Brad Holden');
    expect(out.bestConnector?.strength).toBe(0.45);
    expect(out.bestConnector?.attributionSource).toBe('affinity-v1');
  });

  it('does not promote roster when v1 strength is 0.1 (LAB-2108)', () => {
    const weakStrengthV1: PlTeamRelationship = {
      externalId: 245762872,
      connectors: [
        {
          name: 'Christina DesVaux',
          internalId: 228136266,
          strength: 0.1,
          recencyDays: 270,
          evidenceKind: 'last_email',
          evidenceDate: '2025-09-20T00:00:00Z',
          eventOnly: false,
          tier: ConnectorTier.Email,
          attributionSource: 'affinity-v1',
        },
      ],
      bestConnector: {
        name: 'Christina DesVaux',
        internalId: 228136266,
        strength: 0.1,
        recencyDays: 270,
        evidenceKind: 'last_email',
        evidenceDate: '2025-09-20T00:00:00Z',
        eventOnly: false,
        tier: ConnectorTier.Email,
        attributionSource: 'affinity-v1',
      },
      summary: null,
    };
    const out = mergePlTeamRelationship(
      weakStrengthV1,
      {
        lastContactFromName: 'Christina DesVaux',
        lastContactFromInternal: true,
        lastContactDate: '2025-09-20T00:00:00Z',
      },
      LEADS,
      REF
    );
    expect(out.bestConnector?.attributionSource).toBe('affinity-v1');
    expect(out.bestConnector?.strength).toBe(0.1);
  });

  it('promotes roster when v1 strength is null', () => {
    const nullStrengthV1: PlTeamRelationship = {
      externalId: 99,
      connectors: [
        {
          name: 'Brad Holden',
          internalId: 2,
          strength: null,
          recencyDays: 30,
          evidenceKind: 'last_event',
          evidenceDate: '2026-05-18T00:00:00Z',
          eventOnly: true,
          tier: ConnectorTier.EventOnly,
          attributionSource: 'affinity-v1',
        },
      ],
      bestConnector: {
        name: 'Brad Holden',
        internalId: 2,
        strength: null,
        recencyDays: 30,
        evidenceKind: 'last_event',
        evidenceDate: '2026-05-18T00:00:00Z',
        eventOnly: true,
        tier: ConnectorTier.EventOnly,
        attributionSource: 'affinity-v1',
      },
      summary: null,
    };
    const out = mergePlTeamRelationship(nullStrengthV1, { keyContactName: 'Christina DesVaux' }, LEADS, REF);
    expect(out.bestConnector?.name).toBe('Christina DesVaux');
    expect(out.bestConnector?.attributionSource).toBe('keyContact');
  });
});
