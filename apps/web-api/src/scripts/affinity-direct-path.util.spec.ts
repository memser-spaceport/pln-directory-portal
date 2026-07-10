import {
  buildAffinityDirectPath,
  passesAffinityDirectThreshold,
} from './affinity-direct-path.util';

const connector = (
  over: Partial<{
    name: string;
    strength: number | null;
    tier: number;
    attributionSource: 'affinity-v1' | 'keyContact' | 'lastContact' | 'lastEmail';
    evidenceKind: string | null;
  }> = {},
) => ({
  name: 'Brad Holden',
  internalId: 118269819,
  strength: 0.9 as number | null,
  recencyDays: 30,
  evidenceKind: 'last_email' as string | null,
  evidenceDate: '2026-05-01T00:00:00Z',
  eventOnly: false,
  tier: 2,
  ...over,
});

describe('passesAffinityDirectThreshold', () => {
  it('accepts strength >= 0.3', () => {
    expect(passesAffinityDirectThreshold(connector({ strength: 0.3, tier: 0 }))).toBe(true);
  });

  it('rejects email tier without strength >= 0.3 (LAB-2108)', () => {
    expect(
      passesAffinityDirectThreshold(connector({ strength: null, tier: 1, evidenceKind: 'last_email' })),
    ).toBe(false);
    expect(passesAffinityDirectThreshold(connector({ strength: 0.1, tier: 1 }))).toBe(false);
  });

  it('rejects weak event-only ties', () => {
    expect(passesAffinityDirectThreshold(connector({ strength: 0.1, tier: 0 }))).toBe(false);
  });

  it('accepts roster keyContact fallback', () => {
    expect(
      passesAffinityDirectThreshold(
        connector({ strength: null, tier: 1, attributionSource: 'keyContact' }),
      ),
    ).toBe(true);
  });
});

describe('buildAffinityDirectPath', () => {
  it('emits hops:1 PL path with empty explanation (attribution is separate)', () => {
    const path = buildAffinityDirectPath({
      targetInvestorId: '118574277',
      plConnector: connector({}),
      caliber: 'B',
      caliberConfidence: 0.5,
      targetSet: 'acme-fund-i',
      summary: 'Best connector: Brad Holden (tie 0.90).',
    });
    expect(path.hops).toBe(1);
    expect(path.connectorType).toBe('PL');
    expect(path.proximityCode).toBe('PL+1B');
    expect(path.score).toBeCloseTo(0.9);
    expect(path.hopChain.explanation).toBe('');
    expect((path.hopChain as { plConnector?: { name: string } }).plConnector?.name).toBe('Brad Holden');
  });
});
