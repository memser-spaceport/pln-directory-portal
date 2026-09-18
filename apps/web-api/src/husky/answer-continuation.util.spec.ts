import { trimRepeatedPrefix, MAX_OVERLAP_CHARS } from './answer-continuation.util';

describe('trimRepeatedPrefix', () => {
  const partial = '## Recent News\n\n| Title | Event Type | Event Date | Summary |';

  it('drops a repeated last line so the table continues below the header', () => {
    const continuation =
      '| Title | Event Type | Event Date | Summary |\n|---|---|---|---|\n| A | LAUNCH | 2026-09-01 | x |';
    expect(partial + trimRepeatedPrefix(partial, continuation)).toBe(
      `${partial}\n|---|---|---|---|\n| A | LAUNCH | 2026-09-01 | x |`
    );
  });

  it('ignores leading whitespace in front of the repetition', () => {
    expect(trimRepeatedPrefix(partial, '\n\n| Title | Event Type | Event Date | Summary |\n|---|')).toBe('\n|---|');
  });

  it('drops the whole partial answer when the model restarted from the top', () => {
    expect(trimRepeatedPrefix(partial, `${partial}\n|---|`)).toBe('\n|---|');
  });

  it('returns the continuation untouched when nothing is repeated', () => {
    expect(trimRepeatedPrefix(partial, '\n|---|---|---|---|')).toBe('\n|---|---|---|---|');
  });

  it('leaves short coincidental overlaps alone', () => {
    expect(trimRepeatedPrefix('Prime Intellect raised the', 'the funding round')).toBe('the funding round');
  });

  it('only compares against the tail of a very long partial answer', () => {
    const longPartial = 'x'.repeat(MAX_OVERLAP_CHARS + 50) + 'END OF PARTIAL';
    expect(trimRepeatedPrefix(longPartial, 'END OF PARTIAL and more')).toBe(' and more');
  });
});
