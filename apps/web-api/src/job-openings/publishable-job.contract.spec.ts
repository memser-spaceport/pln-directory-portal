import { PaySchema, PublishableJobSchema } from 'libs/contracts/src/schema/publishable-job';

const minimal = { title: 'Platform Lead', descriptionHtml: '<p>Build</p>', state: 'published' };

describe('PublishableJobSchema', () => {
  it('accepts a minimal job and leaves optional fields absent', () => {
    const out = PublishableJobSchema.parse(minimal);
    expect(out).toEqual(minimal);
    expect(out).not.toHaveProperty('pay');
    expect(out).not.toHaveProperty('workMode');
  });

  it('rejects a missing descriptionHtml naming the field', () => {
    const result = PublishableJobSchema.safeParse({ title: 'x', state: 'published' });
    expect(result.success).toBe(false);
    expect(result.success ? [] : result.error.issues.map((i) => i.path.join('.'))).toContain('descriptionHtml');
  });

  it('rejects a draft state; drafts never reach the board', () => {
    expect(PublishableJobSchema.safeParse({ ...minimal, state: 'draft' }).success).toBe(false);
  });

  it('rejects an unknown work mode naming the field', () => {
    const result = PublishableJobSchema.safeParse({ ...minimal, workMode: 'onsite' });
    expect(result.success).toBe(false);
    expect(result.success ? [] : result.error.issues.map((i) => i.path.join('.'))).toContain('workMode');
  });

  it('accepts the three work modes and three states', () => {
    for (const workMode of ['remote', 'hybrid', 'in-office']) {
      expect(PublishableJobSchema.safeParse({ ...minimal, workMode }).success).toBe(true);
    }
    for (const state of ['published', 'paused', 'closed']) {
      expect(PublishableJobSchema.safeParse({ ...minimal, state }).success).toBe(true);
    }
  });

  it('accepts a full job', () => {
    const out = PublishableJobSchema.parse({
      ...minimal,
      department: 'PL Infra',
      roleCategory: 'Engineering',
      seniority: 'Lead (L5)',
      workMode: 'remote',
      locations: ['Lisbon', 'Remote (EU)'],
      summary: 'Lead the platform team',
      pay: { min: 180000, max: 220000, currency: 'USD', period: 'year' },
      equityNote: '0.1% to 0.3%',
      postedAt: '2026-09-01T00:00:00.000Z',
    });
    expect(out.pay).toEqual({ min: 180000, max: 220000, currency: 'USD', period: 'year' });
    expect(out.locations).toHaveLength(2);
  });
});

describe('PaySchema', () => {
  it('accepts a valid range', () => {
    expect(PaySchema.safeParse({ min: 180000, max: 220000, currency: 'USD', period: 'year' }).success).toBe(true);
  });

  it('rejects an inverted range naming pay.min', () => {
    const result = PublishableJobSchema.safeParse({
      ...minimal,
      pay: { min: 220000, max: 180000, currency: 'USD', period: 'year' },
    });
    expect(result.success).toBe(false);
    expect(result.success ? [] : result.error.issues.map((i) => i.path.join('.'))).toContain('pay.min');
  });

  it('rejects a non ISO-4217 currency naming pay.currency', () => {
    const result = PublishableJobSchema.safeParse({
      ...minimal,
      pay: { min: 1, max: 2, currency: 'dollars', period: 'year' },
    });
    expect(result.success).toBe(false);
    expect(result.success ? [] : result.error.issues.map((i) => i.path.join('.'))).toContain('pay.currency');
  });

  it('rejects an unknown period and negative amounts', () => {
    expect(PaySchema.safeParse({ min: 1, max: 2, currency: 'USD', period: 'week' }).success).toBe(false);
    expect(PaySchema.safeParse({ min: -1, max: 2, currency: 'USD', period: 'year' }).success).toBe(false);
  });
});
