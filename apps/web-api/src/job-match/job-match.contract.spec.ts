import {
  MatchCriteriaUpdateBodySchema,
  MatchCriterionSchema,
  SuggestedCandidateContactBodySchema,
} from 'libs/contracts/src/schema/job-match';

describe('SuggestedCandidateContactBodySchema', () => {
  it('rejects a blank message', () => {
    expect(SuggestedCandidateContactBodySchema.safeParse({ message: '   ' }).success).toBe(false);
    expect(SuggestedCandidateContactBodySchema.safeParse({ message: '' }).success).toBe(false);
  });

  it('rejects a missing or non-string message', () => {
    expect(SuggestedCandidateContactBodySchema.safeParse({}).success).toBe(false);
    expect(SuggestedCandidateContactBodySchema.safeParse({ message: 42 }).success).toBe(false);
  });

  it('accepts 2000 characters and trims', () => {
    const parsed = SuggestedCandidateContactBodySchema.safeParse({ message: `  ${'a'.repeat(2000)}  ` });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.message).toHaveLength(2000);
  });

  it('rejects 2001 characters', () => {
    expect(SuggestedCandidateContactBodySchema.safeParse({ message: 'a'.repeat(2001) }).success).toBe(false);
  });
});

describe('MatchCriteriaUpdateBodySchema', () => {
  it('accepts a string array, including an empty one', () => {
    expect(MatchCriteriaUpdateBodySchema.safeParse({ disabled: ['Rust'] }).success).toBe(true);
    expect(MatchCriteriaUpdateBodySchema.safeParse({ disabled: [] }).success).toBe(true);
  });

  it('rejects a non-array disabled', () => {
    expect(MatchCriteriaUpdateBodySchema.safeParse({ disabled: 'Rust' }).success).toBe(false);
    expect(MatchCriteriaUpdateBodySchema.safeParse({}).success).toBe(false);
    expect(MatchCriteriaUpdateBodySchema.safeParse({ disabled: [1] }).success).toBe(false);
  });

  describe('prompt (LAB-2853)', () => {
    const parse = (body: unknown) => MatchCriteriaUpdateBodySchema.safeParse(body);

    it('leaves prompt out of the parsed body when absent, meaning "keep the stored prompt"', () => {
      const parsed = parse({ disabled: ['Rust'] });
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data).toEqual({ disabled: ['Rust'] });
        expect('prompt' in parsed.data).toBe(false);
      }
    });

    it.each([null, '', '   \n\t '])('parses %j to null, meaning "clear the prompt"', (prompt) => {
      const parsed = parse({ disabled: [], prompt });
      expect(parsed.success).toBe(true);
      if (parsed.success) expect(parsed.data).toEqual({ disabled: [], prompt: null });
    });

    it('trims the prompt', () => {
      const parsed = parse({ disabled: [], prompt: '  Shipped Rust in production.  ' });
      expect(parsed.success).toBe(true);
      if (parsed.success) expect(parsed.data.prompt).toBe('Shipped Rust in production.');
    });

    it('accepts 500 characters after trimming and rejects 501', () => {
      const ok = parse({ disabled: [], prompt: `   ${'a'.repeat(500)}   ` });
      expect(ok.success).toBe(true);
      if (ok.success) expect(ok.data.prompt).toHaveLength(500);
      expect(parse({ disabled: [], prompt: 'a'.repeat(501) }).success).toBe(false);
    });

    it('rejects a non-string prompt', () => {
      expect(parse({ disabled: [], prompt: 42 }).success).toBe(false);
      expect(parse({ disabled: [], prompt: ['a'] }).success).toBe(false);
    });
  });
});

describe('MatchCriterionSchema', () => {
  it('describes { text, enabled }', () => {
    expect(MatchCriterionSchema.safeParse({ text: 'Rust', enabled: false }).success).toBe(true);
    expect(MatchCriterionSchema.safeParse({ text: 'Rust' }).success).toBe(false);
  });
});
