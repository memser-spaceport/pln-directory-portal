import { computeImpactAggregate, emptyImpactDistribution, impactValuesFromPins } from './roadmap-pin.util';

describe('roadmap-pin.util impact helpers', () => {
  it('returns empty aggregate when there are no ratings', () => {
    expect(computeImpactAggregate([])).toEqual({
      impactCount: 0,
      avgImpact: null,
      impactDistribution: emptyImpactDistribution(),
    });
  });

  it('ignores null/out-of-range values', () => {
    expect(computeImpactAggregate([null, 0, 6, 3, undefined, 5])).toEqual({
      impactCount: 2,
      avgImpact: 4,
      impactDistribution: { 1: 0, 2: 0, 3: 1, 4: 0, 5: 1 },
    });
  });

  it('uses only active pins while pinnable', () => {
    expect(
      impactValuesFromPins(
        [
          { impact: 2, releasedAt: null },
          { impact: 5, releasedAt: new Date() },
          { impact: null, releasedAt: null },
        ],
        true
      )
    ).toEqual([2]);
  });

  it('includes released pins when frozen', () => {
    expect(
      impactValuesFromPins(
        [
          { impact: 2, releasedAt: null },
          { impact: 5, releasedAt: new Date() },
        ],
        false
      )
    ).toEqual([2, 5]);
  });
});
