import { BadRequestException } from '@nestjs/common';

/** Longest value the Home deals pill can show on one line (LAB-3071). */
export const DEAL_OFFER_VALUE_MAX = 24;

/**
 * The admin's offer value as stored: trimmed, blank -> null (hides the pill), `undefined` -> `undefined` (an update
 * that doesn't mention it leaves it alone). Longer than the pill fits is refused rather than cut.
 */
export function normalizeOfferValue(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== 'string') {
    throw new BadRequestException('offerValue must be a string');
  }
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length > DEAL_OFFER_VALUE_MAX) {
    throw new BadRequestException(`offerValue must be at most ${DEAL_OFFER_VALUE_MAX} characters`);
  }
  return trimmed;
}
