import { BadRequestException } from '@nestjs/common';
import { DEAL_OFFER_VALUE_MAX, normalizeOfferValue } from './deal-offer-value';

describe('normalizeOfferValue (LAB-3071)', () => {
  it('leaves the field alone when the request does not mention it', () => {
    expect(normalizeOfferValue(undefined)).toBeUndefined();
  });

  it('trims, and clears it for null or blank', () => {
    expect(normalizeOfferValue('  12 mo free ')).toBe('12 mo free');
    expect(normalizeOfferValue(null)).toBeNull();
    expect(normalizeOfferValue('   ')).toBeNull();
  });

  it('refuses a value longer than the pill fits, or not a string', () => {
    expect(normalizeOfferValue('x'.repeat(DEAL_OFFER_VALUE_MAX))).toHaveLength(DEAL_OFFER_VALUE_MAX);
    expect(() => normalizeOfferValue('x'.repeat(DEAL_OFFER_VALUE_MAX + 1))).toThrow(BadRequestException);
    expect(() => normalizeOfferValue(42)).toThrow(BadRequestException);
  });
});
