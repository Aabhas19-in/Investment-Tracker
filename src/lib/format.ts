import type { Formatters } from './finance';

export const CURRENCIES = [
  { code: 'INR', symbol: '₹', locale: 'en-IN' },
  { code: 'USD', symbol: '$', locale: 'en-US' },
  { code: 'EUR', symbol: '€', locale: 'de-DE' },
  { code: 'GBP', symbol: '£', locale: 'en-GB' },
  { code: 'AED', symbol: 'د.إ', locale: 'en-AE' },
] as const;

export type CurrencyCode = (typeof CURRENCIES)[number]['code'];

export function makeFormatters(code: CurrencyCode): Formatters {
  const cur = CURRENCIES.find((c) => c.code === code) ?? CURRENCIES[0];
  const money = new Intl.NumberFormat(cur.locale, {
    style: 'currency',
    currency: cur.code,
    maximumFractionDigits: 0,
  });
  const plain = new Intl.NumberFormat(cur.locale, { maximumFractionDigits: 2 });

  return {
    money: (n) => (Number.isFinite(n) ? money.format(n) : '—'),
    pct: (n) => (Number.isFinite(n) ? `${plain.format(n)}%` : '—'),
    num: (n) => (Number.isFinite(n) ? plain.format(n) : '—'),
  };
}

/**
 * Pulls a number out of whatever the sheet displays — "₹1,20,000", "12.5%",
 * "(500)" for negatives, "1 234". Returns null when the cell isn't numeric,
 * which is how the Summary tab decides which columns to total.
 */
export function parseNumeric(raw: string): number | null {
  if (raw == null) return null;
  let s = String(raw).trim();
  if (!s) return null;

  let sign = 1;
  if (/^\(.*\)$/.test(s)) {
    sign = -1;
    s = s.slice(1, -1);
  }
  // "12.5%" reads back as 12.5, matching what the sheet shows.
  s = s.replace(/[^\d.\-]/g, '');
  if (!s || s === '-' || s === '.') return null;

  const n = Number(s);
  return Number.isFinite(n) ? sign * n : null;
}
