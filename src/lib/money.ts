import type { CurrencyCode, Frequency } from '../types';

/** Average weeks in a month (52 / 12).
 *
 *  Not 4. Using a flat ×4 under-counts every weekly bill by about 8% — roughly
 *  one extra month of that bill a year that the budget never sees. */
export const WEEKS_PER_MONTH = 52 / 12;

const PER_MONTH: Record<Frequency, number> = {
  weekly: WEEKS_PER_MONTH,
  biweekly: WEEKS_PER_MONTH / 2,
  monthly: 1,
  quarterly: 1 / 3,
  annual: 1 / 12,
  // A one-off is not part of every month, so it adds nothing to the monthly
  // figure. The amount is still shown on its own line.
  once: 0,
};

export const FREQUENCIES: Frequency[] = [
  'weekly',
  'biweekly',
  'monthly',
  'quarterly',
  'annual',
  'once',
];

export const FREQUENCY_LABEL: Record<Frequency, string> = {
  weekly: 'Weekly',
  biweekly: 'Every 2 weeks',
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  annual: 'Yearly',
  once: 'One-off',
};

/** Normalise any recurring amount to what it costs in a month. */
export function toMonthly(amount: number, frequency: Frequency): number {
  return amount * PER_MONTH[frequency];
}

/** Convert between the two currencies using a hand-entered rate expressed as
 *  ZAR per USD. */
export function convert(
  amount: number,
  from: CurrencyCode,
  to: CurrencyCode,
  usdZarRate: number,
): number {
  if (from === to) return amount;
  if (!Number.isFinite(usdZarRate) || usdZarRate <= 0) return amount;
  return from === 'USD' ? amount * usdZarRate : amount / usdZarRate;
}

const SYMBOL: Record<CurrencyCode, string> = { USD: '$', ZAR: 'R' };

export function currencySymbol(currency: CurrencyCode): string {
  return SYMBOL[currency];
}

export interface FormatOptions {
  /** Drop the decimals. Default true — cents are noise at dashboard scale. */
  round?: boolean;
  /** Render 12,900 as 12.9K and 4,200,000 as 4.2M. For stat tiles and axes. */
  compact?: boolean;
  /** Always show a leading + or -. */
  signed?: boolean;
}

export function formatMoney(
  amount: number,
  currency: CurrencyCode,
  options: FormatOptions = {},
): string {
  const { round = true, compact = false, signed = false } = options;
  const symbol = SYMBOL[currency];
  const negative = amount < 0;
  const value = Math.abs(amount);

  let body: string;
  if (compact && value >= 1_000_000) {
    body = `${trimZero(value / 1_000_000)}M`;
  } else if (compact && value >= 10_000) {
    body = `${trimZero(value / 1_000)}K`;
  } else {
    body = value.toLocaleString('en-US', {
      minimumFractionDigits: round ? 0 : 2,
      maximumFractionDigits: round ? 0 : 2,
    });
  }

  const sign = negative ? '-' : signed ? '+' : '';
  return `${sign}${symbol}${body}`;
}

function trimZero(n: number): string {
  return n.toFixed(1).replace(/\.0$/, '');
}

/** A short label for an axis tick — no symbol, compacted hard. */
export function formatAxis(amount: number): string {
  const value = Math.abs(amount);
  const sign = amount < 0 ? '-' : '';
  if (value >= 1_000_000) return `${sign}${trimZero(value / 1_000_000)}M`;
  if (value >= 1_000) return `${sign}${trimZero(value / 1_000)}K`;
  return `${sign}${Math.round(value)}`;
}

export function formatPercent(fraction: number): string {
  return `${Math.round(fraction * 100)}%`;
}
