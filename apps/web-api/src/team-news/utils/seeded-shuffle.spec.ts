import {
  computeRunSeedFromCreatedAt,
  hashStringToSeed,
  mulberry32,
  seededShuffle,
} from './seeded-shuffle';

describe('mulberry32', () => {
  it('produces the same sequence for the same seed', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    const seqA = [a(), a(), a(), a()];
    const seqB = [b(), b(), b(), b()];
    expect(seqA).toEqual(seqB);
  });

  it('produces different sequences for different seeds', () => {
    const a = mulberry32(1);
    const b = mulberry32(2);
    expect(a()).not.toEqual(b());
  });

  it('returns values in [0, 1)', () => {
    const r = mulberry32(7);
    for (let i = 0; i < 100; i++) {
      const v = r();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe('hashStringToSeed', () => {
  it('is deterministic', () => {
    expect(hashStringToSeed('2026-05-19T10:00:00.000Z')).toBe(
      hashStringToSeed('2026-05-19T10:00:00.000Z')
    );
  });

  it('changes when the input changes', () => {
    expect(hashStringToSeed('2026-05-19T10:00:00.000Z')).not.toBe(
      hashStringToSeed('2026-05-19T10:00:01.000Z')
    );
  });
});

describe('seededShuffle', () => {
  const items = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

  it('returns a new array of the same length with the same elements', () => {
    const out = seededShuffle(items, 123);
    expect(out).not.toBe(items);
    expect(out).toHaveLength(items.length);
    expect([...out].sort((a, b) => a - b)).toEqual(items);
  });

  it('is stable for the same seed', () => {
    expect(seededShuffle(items, 999)).toEqual(seededShuffle(items, 999));
  });

  it('differs for different seeds', () => {
    expect(seededShuffle(items, 1)).not.toEqual(seededShuffle(items, 2));
  });

  it('returns empty array for empty input', () => {
    expect(seededShuffle([], 42)).toEqual([]);
  });
});

describe('computeRunSeedFromCreatedAt', () => {
  it('returns 0 for empty input', () => {
    expect(computeRunSeedFromCreatedAt([])).toBe(0);
  });

  it('is stable when the same set of timestamps is passed in any order', () => {
    const a = computeRunSeedFromCreatedAt([
      new Date('2026-05-19T10:00:00Z'),
      new Date('2026-05-18T22:30:00Z'),
      new Date('2026-05-19T09:15:00Z'),
    ]);
    const b = computeRunSeedFromCreatedAt([
      new Date('2026-05-19T09:15:00Z'),
      new Date('2026-05-19T10:00:00Z'),
      new Date('2026-05-18T22:30:00Z'),
    ]);
    expect(a).toBe(b);
  });

  it('changes when a newer createdAt is introduced (i.e. a new ingest run)', () => {
    const before = computeRunSeedFromCreatedAt([
      new Date('2026-05-19T10:00:00Z'),
      new Date('2026-05-18T22:30:00Z'),
    ]);
    const after = computeRunSeedFromCreatedAt([
      new Date('2026-05-19T10:00:00Z'),
      new Date('2026-05-18T22:30:00Z'),
      new Date('2026-05-19T11:00:00Z'),
    ]);
    expect(before).not.toBe(after);
  });

  it('is insensitive to older items being added (max stays the same)', () => {
    const before = computeRunSeedFromCreatedAt([new Date('2026-05-19T10:00:00Z')]);
    const after = computeRunSeedFromCreatedAt([
      new Date('2026-05-19T10:00:00Z'),
      new Date('2026-04-01T00:00:00Z'),
    ]);
    expect(before).toBe(after);
  });
});
