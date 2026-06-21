import { compareWarmIntroMembers } from './warm-intro-list-sort.util';

describe('warm-intro-list-sort.util', () => {
  const warm = (overrides: Partial<Parameters<typeof compareWarmIntroMembers>[0]>) => ({
    hasPath: true,
    hops: 2,
    score: 0.4,
    bestProximityCode: 'VC+2A',
    lastName: 'Zeta',
    ...overrides,
  });

  it('sinks cold members last', () => {
    expect(
      compareWarmIntroMembers(warm({ hasPath: false, bestProximityCode: null }), warm({ hops: 2 }))
    ).toBeGreaterThan(0);
  });

  it('prefers direct (1-hop) over multi-hop regardless of score', () => {
    expect(
      compareWarmIntroMembers(
        warm({ hops: 1, score: 0.2, bestProximityCode: 'F+1B' }),
        warm({ hops: 2, score: 0.9, bestProximityCode: 'VC+2A' })
      )
    ).toBeLessThan(0);
  });

  it('breaks hop ties by higher score', () => {
    expect(compareWarmIntroMembers(warm({ score: 0.5 }), warm({ score: 0.3 }))).toBeLessThan(0);
  });

  it('breaks score ties by caliber A before B', () => {
    expect(
      compareWarmIntroMembers(
        warm({ hops: 2, score: 0.4, bestProximityCode: 'F+2A' }),
        warm({ hops: 2, score: 0.4, bestProximityCode: 'F+2B' })
      )
    ).toBeLessThan(0);
  });
});
