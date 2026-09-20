import { toPublicPay } from './job-openings-public-role';

describe('toPublicPay', () => {
  it('rebuilds the range when all four columns are set', () => {
    expect(toPublicPay({ payMin: 180000, payMax: 220000, payCurrency: 'USD', payPeriod: 'year' })).toEqual({
      min: 180000,
      max: 220000,
      currency: 'USD',
      period: 'year',
    });
  });

  it('returns null when no pay is stored', () => {
    expect(toPublicPay({ payMin: null, payMax: null, payCurrency: null, payPeriod: null })).toBeNull();
  });

  it('returns null when any column is missing', () => {
    expect(toPublicPay({ payMin: 180000, payMax: 220000, payCurrency: null, payPeriod: 'year' })).toBeNull();
    expect(toPublicPay({ payMin: 180000, payMax: null, payCurrency: 'USD', payPeriod: 'year' })).toBeNull();
    expect(toPublicPay({ payMin: null, payMax: 220000, payCurrency: 'USD', payPeriod: 'year' })).toBeNull();
    expect(toPublicPay({ payMin: 180000, payMax: 220000, payCurrency: 'USD', payPeriod: null })).toBeNull();
  });

  it('returns null for an unknown period rather than exposing it', () => {
    expect(toPublicPay({ payMin: 1, payMax: 2, payCurrency: 'USD', payPeriod: 'week' })).toBeNull();
  });

  it('accepts a zero minimum', () => {
    expect(toPublicPay({ payMin: 0, payMax: 2, payCurrency: 'USD', payPeriod: 'hour' })?.min).toBe(0);
  });
});
