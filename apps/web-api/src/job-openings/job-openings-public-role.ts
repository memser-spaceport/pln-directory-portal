import type { Pay } from 'libs/contracts/src/schema/publishable-job';
import { PAY_PERIODS } from 'libs/contracts/src/schema/publishable-job';

export type PayColumns = {
  payMin: number | null;
  payMax: number | null;
  payCurrency: string | null;
  payPeriod: string | null;
};

/**
 * The public pay range for a role: the four stored columns as one object, or null
 * unless every one of them is set and the period is a known value. Half-written
 * rows never leak a partial range to the board.
 */
export function toPublicPay(row: PayColumns): Pay | null {
  if (row.payMin == null || row.payMax == null || !row.payCurrency || !row.payPeriod) {
    return null;
  }
  if (!(PAY_PERIODS as readonly string[]).includes(row.payPeriod)) {
    return null;
  }
  return {
    min: row.payMin,
    max: row.payMax,
    currency: row.payCurrency,
    period: row.payPeriod as Pay['period'],
  };
}
