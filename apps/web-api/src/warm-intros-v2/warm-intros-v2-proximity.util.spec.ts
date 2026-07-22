import {
  buildProximityCode,
  computeCaliber,
  computeScoreBand,
  computeScorePercent,
  computeWarmPathProximity,
  deriveConnectorFamily,
} from './warm-intros-v2-proximity.util';

describe('warm-intros-v2-proximity.util', () => {
  describe('computeCaliber', () => {
    it('returns A for score >= 0.60', () => {
      expect(computeCaliber(0.6)).toBe('A');
      expect(computeCaliber(0.7)).toBe('A');
      expect(computeCaliber(1)).toBe('A');
    });

    it('returns B for 0 < score < 0.60', () => {
      expect(computeCaliber(0.4)).toBe('B');
      expect(computeCaliber(0.1)).toBe('B');
      expect(computeCaliber(0.599)).toBe('B');
    });

    it('returns null for score <= 0', () => {
      expect(computeCaliber(0)).toBeNull();
      expect(computeCaliber(-0.1)).toBeNull();
    });
  });

  describe('computeScoreBand', () => {
    it('maps percent bands', () => {
      expect(computeScoreBand(70)).toBe('green');
      expect(computeScoreBand(61)).toBe('green');
      expect(computeScoreBand(60)).toBe('yellow');
      expect(computeScoreBand(25)).toBe('yellow');
      expect(computeScoreBand(24)).toBe('red');
      expect(computeScoreBand(1)).toBe('red');
      expect(computeScoreBand(0)).toBe('none');
    });
  });

  describe('computeWarmPathProximity', () => {
    it('score 0.7 → A + green + PL+1A', () => {
      expect(
        computeWarmPathProximity({
          score: 0.7,
          hopCount: 1,
          hopChain: { relationKind: 'pl_direct' },
        })
      ).toEqual({
        caliber: 'A',
        scorePercent: 70,
        scoreBand: 'green',
        proximityCode: 'PL+1A',
      });
    });

    it('score 0.4 → B + yellow + PL+1B', () => {
      expect(computeWarmPathProximity({ score: 0.4, hopCount: 1 })).toEqual({
        caliber: 'B',
        scorePercent: 40,
        scoreBand: 'yellow',
        proximityCode: 'PL+1B',
      });
    });

    it('score 0.1 → B + red + PL+1B', () => {
      expect(computeWarmPathProximity({ score: 0.1, hopCount: 1 })).toEqual({
        caliber: 'B',
        scorePercent: 10,
        scoreBand: 'red',
        proximityCode: 'PL+1B',
      });
    });

    it('uses hopCount in proximityCode', () => {
      expect(buildProximityCode('PL', 2, 'A')).toBe('PL+2A');
      expect(computeScorePercent(0.705)).toBe(71);
    });

    it('defaults family to PL for pl_direct hopChain', () => {
      expect(deriveConnectorFamily({ hopChain: { relationKind: 'pl_direct' } })).toBe('PL');
      expect(
        deriveConnectorFamily({
          hopChain: { hops: [{ role: 'pl_connector' }] },
        })
      ).toBe('PL');
    });
  });
});
